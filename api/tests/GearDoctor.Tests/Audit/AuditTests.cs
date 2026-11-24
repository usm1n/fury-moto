using System.Net;
using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Tests.AdminCatalog;
using GearDoctor.Tests.Infrastructure;

namespace GearDoctor.Tests.Audit;

[Collection(ApiCollection.Name)]
public sealed class AuditTests(ApiFactory f) : IAsyncLifetime
{
    private AdminHttp _a = null!;
    private Category _cat = null!;
    private Brand _brand = null!;

    public async Task InitializeAsync()
    {
        await f.ResetAsync();
        _a = await AdminHttp.LoginAsync(f);
        _cat = await f.AddCategory("Helmets");
        _brand = await f.AddBrand("AGV");
    }
    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<List<JsonElement>> Audit(string query = "")
    {
        var page = await AdminHttp.Body(await _a.Get("/api/admin/audit" + query), HttpStatusCode.OK);
        return page.GetProperty("items").EnumerateArray().ToList();
    }

    private static string S(JsonElement e, string p) => e.GetProperty(p).GetString()!;

    [Fact]
    public async Task Product_update_records_a_human_diff_with_the_admin_email()
    {
        var created = await AdminHttp.Body(await _a.Post("/api/admin/products", new
        {
            title = "Pista GP", brandId = _brand.Id, categoryId = _cat.Id, price = 45000, badges = Array.Empty<string>(),
        }), HttpStatusCode.Created);
        var id = created.GetProperty("id").GetInt32();
        await AdminHttp.Body(await _a.Put($"/api/admin/products/{id}", new
        {
            title = "Pista GP", brandId = _brand.Id, categoryId = _cat.Id, price = 42000, badges = Array.Empty<string>(),
            version = created.GetProperty("version").GetString(),
        }), HttpStatusCode.OK);

        var rows = await Audit($"?entity=product&entityId={id}");   // entity filter is case-insensitive
        Assert.Equal(new[] { "product.update", "product.create" }, rows.Select(r => S(r, "action")));   // newest first
        Assert.Equal("Price 45,000 → 42,000", S(rows[0], "summary"));
        Assert.Equal(AdminHttp.Email, S(rows[0], "by"));
        Assert.Equal("Product", S(rows[0], "entity"));
    }

    [Fact]
    public async Task Publish_duplicate_delete_and_reorder_are_audited()
    {
        var p = await f.AddProduct(new ProductSpec("Aud", _brand.Id, _cat.Id) { Status = ProductStatus.Draft });
        await AdminHttp.Body(await _a.Post($"/api/admin/products/{p.Id}/publish"), HttpStatusCode.OK);
        await AdminHttp.Body(await _a.Post($"/api/admin/products/{p.Id}/unpublish"), HttpStatusCode.OK);
        var dup = await AdminHttp.Body(await _a.Post($"/api/admin/products/{p.Id}/duplicate"), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/products/reorder", new { ids = new[] { dup.GetProperty("id").GetInt32(), p.Id } }), HttpStatusCode.NoContent);
        await AdminHttp.Body(await _a.Delete($"/api/admin/products/{p.Id}"), HttpStatusCode.NoContent);

        var actions = (await Audit("?entity=Product&pageSize=100")).Select(r => S(r, "action")).ToList();
        foreach (var a in new[] { "product.publish", "product.unpublish", "product.duplicate", "product.reorder", "product.delete" })
            Assert.Contains(a, actions);
        var publish = (await Audit($"?entityId={p.Id}")).First(r => S(r, "action") == "product.publish");
        Assert.Contains("Draft → Published", S(publish, "summary"));
    }

    [Fact]
    public async Task Stock_adjust_records_old_new_and_the_reason()
    {
        var p = await f.AddProduct(new ProductSpec("Stocky", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 3)] });
        var vid = await f.WithDb(async db => (await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.ProductVariants, v => v.ProductId == p.Id)).Id);
        await AdminHttp.Body(await _a.Post($"/api/admin/variants/{vid}/stock", new { delta = 2, reason = "cycle count" }), HttpStatusCode.OK);

        var row = (await Audit($"?entity=Variant&entityId={vid}")).Single();
        Assert.Equal("variant.stock", S(row, "action"));
        Assert.Contains("M/Black", S(row, "summary"));
        Assert.Contains("3 → 5", S(row, "summary"));
        Assert.Contains("cycle count", S(row, "summary"));
    }

    [Fact]
    public async Task Variant_grid_stock_changes_are_audited()
    {
        var p = await f.AddProduct(new ProductSpec("Grid", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 3)] });
        var v = (await AdminHttp.Body(await _a.Get($"/api/admin/products/{p.Id}"), HttpStatusCode.OK)).GetProperty("variants")[0];
        await AdminHttp.Body(await _a.Put($"/api/admin/products/{p.Id}/variants", new[]
        {
            new { id = (int?)v.GetProperty("id").GetInt32(), size = "M", color = "Black", stock = 5, version = v.GetProperty("version").GetString() },
        }), HttpStatusCode.OK);
        var row = (await Audit($"?entity=Variant&entityId={p.Id}")).Single();
        Assert.Contains("M/Black 3 → 5", S(row, "summary"));
    }

    [Fact]
    public async Task Order_status_change_is_audited()
    {
        var orderId = await f.WithDb(async db =>
        {
            var o = new Order { OrderNumber = "GD-7001", CustomerName = "n", Phone = "03001234567", City = "c", Address = "a", Status = OrderStatus.New, CreatedAt = DateTimeOffset.UtcNow };
            db.Orders.Add(o); await db.SaveChangesAsync(); return o.Id;
        });
        var order = await AdminHttp.Body(await _a.Get($"/api/admin/orders/{orderId}"), HttpStatusCode.OK);
        await AdminHttp.Body(await _a.Post($"/api/admin/orders/{orderId}/status",
            new { status = "Confirmed", note = "called customer", version = order.GetProperty("version").GetString() }), HttpStatusCode.OK);
        await AdminHttp.Body(await _a.Post($"/api/admin/orders/{orderId}/notes", new { note = "left voicemail" }), HttpStatusCode.OK);

        var rows = await Audit($"?entity=Order&entityId={orderId}");
        var status = rows.Single(r => S(r, "action") == "order.status");
        Assert.Contains("GD-7001: New → Confirmed", S(status, "summary"));
        Assert.Contains("called customer", S(status, "summary"));
        Assert.Contains(rows, r => S(r, "action") == "order.note");
    }

    [Fact]
    public async Task Settings_audit_lists_keys_but_never_bank_values()
    {
        await AdminHttp.Body(await _a.Put("/api/admin/settings", new
        {
            deliveryFee = 250, codEnabled = true, bankTransferEnabled = false, lowStockThreshold = 3, city = "Karachi",
            bankDetails = new { bankName = "SecretBank", accountTitle = "Gear Doctor", iban = "PK36SCBL0000001123456702" },
        }), HttpStatusCode.OK);
        var row = (await Audit("?entity=Settings")).Single();
        var summary = S(row, "summary");
        Assert.Contains("deliveryFee", summary);
        Assert.Contains("city", summary);
        Assert.Contains("bank details changed", summary);
        Assert.DoesNotContain("SecretBank", summary);
        Assert.DoesNotContain("PK36", summary);
        Assert.DoesNotContain("Karachi", summary);
    }

    [Fact]
    public async Task Catalog_and_content_mutations_are_audited()
    {
        var cat = await AdminHttp.Body(await _a.Post("/api/admin/categories", new { name = "Gloves" }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Put($"/api/admin/categories/{cat.GetProperty("id").GetInt32()}", new { name = "Gloves 2" }), HttpStatusCode.OK);
        await AdminHttp.Body(await _a.Post("/api/admin/brands", new { name = "Alpinestars" }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "Q?", a = "A" }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/testimonials", new { name = "N", quote = "q", rating = 5 }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/guides", new { title = "G", type = "buying", excerpt = "e", body = "b" }), HttpStatusCode.Created);

        var actions = (await Audit("?pageSize=100")).Select(r => S(r, "action")).ToList();
        foreach (var a in new[] { "category.create", "category.update", "brand.create", "faq.create", "testimonial.create", "guide.create" })
            Assert.Contains(a, actions);
    }

    [Fact]
    public async Task Login_failed_records_the_email_without_a_user_and_login_records_the_user()
    {
        var email = AuthHelpers.UniqueEmail("ghost");
        using (var s = new ApiSession(f))
            Assert.Equal(HttpStatusCode.Unauthorized, (await s.LoginAsync(email, "Wrong-Passw0rd!x")).StatusCode);

        var admin = AuthHelpers.UniqueEmail("auditadmin");
        await AuthHelpers.CreateAdminAsync(f, admin, "Test-Passw0rd!x");
        using (var s = new ApiSession(f))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await s.LoginAsync(admin, "Wrong-Passw0rd!x")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await s.LoginAsync(admin, "Test-Passw0rd!x")).StatusCode);
        }

        var rows = await Audit("?entity=Auth&pageSize=100");
        var failed = rows.First(r => S(r, "action") == "auth.login-failed" && S(r, "summary").Contains(email));
        Assert.Equal(JsonValueKind.Null, failed.GetProperty("by").ValueKind);
        Assert.Equal("Auth", S(failed, "entity"));
        Assert.Contains(rows, r => S(r, "action") == "auth.login-failed" && S(r, "summary").Contains(admin));
        var ok = rows.First(r => S(r, "action") == "auth.login" && r.GetProperty("by").GetString() == admin);
        Assert.NotEqual(JsonValueKind.Null, ok.GetProperty("ip").ValueKind);
    }

    [Fact]
    public async Task Logout_and_password_change_are_audited()
    {
        var email = AuthHelpers.UniqueEmail("pw");
        await AuthHelpers.CreateAdminAsync(f, email, "Test-Passw0rd!x");
        using var s = new ApiSession(f);
        Assert.Equal(HttpStatusCode.OK, (await s.LoginAsync(email, "Test-Passw0rd!x")).StatusCode);
        await s.FetchCsrfAsync();
        var change = await s.SendAsync(HttpMethod.Post, "/api/auth/change-password", new { currentPassword = "Test-Passw0rd!x", newPassword = "Other-Passw0rd!y" });
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        var logout = await s.SendAsync(HttpMethod.Post, "/api/auth/logout", new { });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var rows = await Audit("?entity=Auth&pageSize=100");
        Assert.Contains(rows, r => S(r, "action") == "auth.password-change" && r.GetProperty("by").GetString() == email);
        Assert.Contains(rows, r => S(r, "action") == "auth.logout" && r.GetProperty("by").GetString() == email);
    }

    [Fact]
    public async Task Audit_is_paged_newest_first_and_admin_only()
    {
        for (var i = 0; i < 3; i++) await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = $"Q{i}?", a = "A" }), HttpStatusCode.Created);
        var page1 = await AdminHttp.Body(await _a.Get("/api/admin/audit?entity=Faq&page=1&pageSize=2"), HttpStatusCode.OK);
        Assert.Equal(3, page1.GetProperty("total").GetInt32());
        Assert.Equal(2, page1.GetProperty("items").GetArrayLength());
        var page2 = await AdminHttp.Body(await _a.Get("/api/admin/audit?entity=Faq&page=2&pageSize=2"), HttpStatusCode.OK);
        Assert.Equal(1, page2.GetProperty("items").GetArrayLength());
        Assert.Contains("Q2?", S(page1.GetProperty("items")[0], "summary"));
        Assert.Equal(100, (await AdminHttp.Body(await _a.Get("/api/admin/audit?pageSize=500"), HttpStatusCode.OK)).GetProperty("pageSize").GetInt32());

        var anon = AdminHttp.NewClient(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/audit")).StatusCode);
    }
}
