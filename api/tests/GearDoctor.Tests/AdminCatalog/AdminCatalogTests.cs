using System.Net;
using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Tests.AdminCatalog;

[Collection(ApiCollection.Name)]
public sealed class AdminCatalogTests(ApiFactory f) : IAsyncLifetime
{
    private AdminHttp _a = null!;
    private Category _cat = null!;
    private Brand _brand = null!;
    private Certification _cert = null!;

    public async Task InitializeAsync()
    {
        await f.ResetAsync();
        _a = await AdminHttp.LoginAsync(f);
        _cat = await f.AddCategory("Helmets", 1);
        _brand = await f.AddBrand("AGV");
        _cert = await f.AddCert("DOT", "DOT");
    }
    public Task DisposeAsync() => Task.CompletedTask;

    private object Upsert(string title = "Pista GP", int price = 50000, string? slug = null, int? compare = null, string[]? badges = null, string? version = null) => new
    {
        title, slug, brandId = _brand.Id, categoryId = _cat.Id, price, compareAtPrice = compare, badges = badges ?? [],
        certificationIds = new[] { _cert.Id }, specs = new[] { new { label = "Shell", value = "Carbon" } }, version,
    };

    private async Task<JsonElement> CreateProduct(string title = "Pista GP", string? slug = null) =>
        await AdminHttp.Body(await _a.Post("/api/admin/products", Upsert(title, slug: slug)), HttpStatusCode.Created);

    private async Task AddImage(int productId) => await f.WithDb(async db =>
    {
        db.ProductImages.Add(new ProductImage { ProductId = productId, StorageKey = $"products/{productId}/a.webp", ThumbKey = $"products/{productId}/a-480.webp", Width = 10, Height = 10 });
        await db.SaveChangesAsync();
    });

    private static object V(string size, string color, int stock, int? id = null, string? sku = null, string? version = null) =>
        new { id, size, color, stock, sku, version };

    [Fact]
    public async Task Requires_login_and_csrf()
    {
        var anon = AdminHttp.NewClient(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _a.Send(HttpMethod.Post, "/api/admin/products", Upsert(), csrf: false)).StatusCode);
    }

    [Fact]
    public async Task Create_is_draft_with_slug_and_unique_slugs()
    {
        var p1 = await CreateProduct("Pista GP");
        Assert.Equal("Draft", p1.GetProperty("status").GetString());
        Assert.Equal("pista-gp", p1.GetProperty("slug").GetString());
        Assert.Equal("/product.html?slug=pista-gp", p1.GetProperty("storefrontUrl").GetString());
        Assert.Equal(new[] { _cert.Id }, p1.GetProperty("certificationIds").EnumerateArray().Select(x => x.GetInt32()));
        var p2 = await CreateProduct("Pista GP");
        var p3 = await CreateProduct("Other", slug: "pista-gp");
        Assert.Equal("pista-gp-2", p2.GetProperty("slug").GetString());
        Assert.Equal("pista-gp-3", p3.GetProperty("slug").GetString());
    }

    [Fact]
    public async Task Create_validation()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/products", Upsert(price: 100, compare: 100))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/products", Upsert(badges: ["Bogus"]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/products", new { title = "x", brandId = 999, categoryId = _cat.Id, price = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/products", new { title = "", brandId = _brand.Id, categoryId = _cat.Id, price = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await _a.Post("/api/admin/products", Upsert(price: 100, compare: 200, badges: ["Rider's pick", "Sale"]))).StatusCode);
    }

    [Fact]
    public async Task Publish_requires_image_and_active_variant()
    {
        var p = await CreateProduct();
        var id = p.GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post($"/api/admin/products/{id}/publish")).StatusCode);
        await AdminHttp.Body(await _a.Put($"/api/admin/products/{id}/variants", new[] { V("M", "Black", 3) }), HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post($"/api/admin/products/{id}/publish")).StatusCode);
        await AddImage(id);
        var pub = await AdminHttp.Body(await _a.Post($"/api/admin/products/{id}/publish"), HttpStatusCode.OK);
        Assert.Equal("Published", pub.GetProperty("status").GetString());
        var pubList = await AdminHttp.Body(await AdminHttp.NewClient(f).GetAsync("/api/products"), HttpStatusCode.OK);
        Assert.Single(pubList.GetProperty("items").EnumerateArray());
        var un = await AdminHttp.Body(await _a.Post($"/api/admin/products/{id}/unpublish"), HttpStatusCode.OK);
        Assert.Equal("Draft", un.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Update_requires_current_version_else_409()
    {
        var p = await CreateProduct();
        var id = p.GetProperty("id").GetInt32();
        var v1 = p.GetProperty("version").GetString();
        var ok = await AdminHttp.Body(await _a.Put($"/api/admin/products/{id}", Upsert("Renamed", version: v1)), HttpStatusCode.OK);
        Assert.Equal("Renamed", ok.GetProperty("title").GetString());
        Assert.NotEqual(v1, ok.GetProperty("version").GetString());
        var stale = await AdminHttp.Body(await _a.Put($"/api/admin/products/{id}", Upsert("Again", version: v1)), HttpStatusCode.Conflict);
        Assert.Equal("/problems/stale", stale.GetProperty("type").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put($"/api/admin/products/{id}", Upsert("NoVersion"))).StatusCode);
    }

    [Fact]
    public async Task Soft_delete_hides_from_public_and_admin()
    {
        var pub = await f.AddProduct(new("Live Helmet", _brand.Id, _cat.Id));
        var anon = AdminHttp.NewClient(f);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync($"/api/products/{pub.Slug}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/products/{pub.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/products/{pub.Slug}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Get($"/api/admin/products/{pub.Id}")).StatusCode);
        var row = await f.WithDb(db => db.Products.IgnoreQueryFilters().FirstAsync(x => x.Id == pub.Id));
        Assert.NotNull(row.DeletedAt);
    }

    [Fact]
    public async Task Duplicate_copies_without_images_and_zero_stock()
    {
        var src = await f.AddProduct(new("Source Helmet", _brand.Id, _cat.Id) { CertIds = [_cert.Id], Badges = ["Sale"], Variants = [new("M", "Black", 7), new("L", "Black", 4)] });
        var dup = await AdminHttp.Body(await _a.Post($"/api/admin/products/{src.Id}/duplicate"), HttpStatusCode.Created);
        Assert.Equal("Source Helmet (copy)", dup.GetProperty("title").GetString());
        Assert.Equal("Draft", dup.GetProperty("status").GetString());
        Assert.Empty(dup.GetProperty("images").EnumerateArray());
        var vs = dup.GetProperty("variants").EnumerateArray().ToList();
        Assert.Equal(2, vs.Count);
        Assert.All(vs, v => Assert.Equal(0, v.GetProperty("stock").GetInt32()));
        var skus = vs.Select(v => v.GetProperty("sku").GetString()).ToList();
        Assert.Equal(2, skus.Distinct().Count());
        Assert.DoesNotContain(src.Variants.Select(v => v.Sku).First(), skus);
        Assert.Single(dup.GetProperty("certificationIds").EnumerateArray());
        Assert.Equal("Sale", dup.GetProperty("badges")[0].GetString());
    }

    [Fact]
    public async Task List_filters_and_total_stock()
    {
        await f.AddProduct(new("Alpha Helmet", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 3), new("L", "Black", 4), new("S", "Black", 100, Active: false)] });
        await f.AddProduct(new("Beta Jacket", _brand.Id, _cat.Id) { Status = ProductStatus.Draft });
        var all = await AdminHttp.Body(await _a.Get("/api/admin/products"), HttpStatusCode.OK);
        Assert.Equal(2, all.GetProperty("total").GetInt32());
        var alpha = all.GetProperty("items").EnumerateArray().First(i => i.GetProperty("title").GetString() == "Alpha Helmet");
        Assert.Equal(7, alpha.GetProperty("totalStock").GetInt32());
        Assert.NotEqual(JsonValueKind.Null, alpha.GetProperty("thumbUrl").ValueKind);
        var q = await AdminHttp.Body(await _a.Get("/api/admin/products?q=jack&status=Draft"), HttpStatusCode.OK);
        Assert.Single(q.GetProperty("items").EnumerateArray());
        var none = await AdminHttp.Body(await _a.Get("/api/admin/products?status=Published&q=jack"), HttpStatusCode.OK);
        Assert.Empty(none.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Reorder_products_sets_sort_order()
    {
        var a = (await CreateProduct("A")).GetProperty("id").GetInt32();
        var b = (await CreateProduct("B")).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Post("/api/admin/products/reorder", new { ids = new[] { b, a } })).StatusCode);
        var list = await AdminHttp.Body(await _a.Get("/api/admin/products"), HttpStatusCode.OK);
        Assert.Equal(new[] { b, a }, list.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetInt32()));
    }

    [Fact]
    public async Task Variants_grid_upsert_auto_sku_and_deactivate()
    {
        var id = (await CreateProduct("Pista GP")).GetProperty("id").GetInt32();
        var url = $"/api/admin/products/{id}/variants";
        var first = await AdminHttp.Body(await _a.Put(url, new[] { V("M", "Black", 3), V("L", "Red & Blue", 2) }), HttpStatusCode.OK);
        var rows = first.EnumerateArray().ToList();
        Assert.Equal("AGV-PISTA-GP-M-BLACK", rows[0].GetProperty("sku").GetString());
        Assert.Equal("AGV-PISTA-GP-L-RED-BLUE", rows[1].GetProperty("sku").GetString());
        Assert.True(rows[0].GetProperty("isActive").GetBoolean());

        var m = rows[0];
        var second = await AdminHttp.Body(await _a.Put(url, new[]
        {
            V("M", "Black", 9, m.GetProperty("id").GetInt32(), version: m.GetProperty("version").GetString()),
            V("XL", "Black", 1),
        }), HttpStatusCode.OK);
        var byKey = second.EnumerateArray().ToDictionary(r => r.GetProperty("size").GetString()!);
        Assert.Equal(9, byKey["M"].GetProperty("stock").GetInt32());
        Assert.False(byKey["L"].GetProperty("isActive").GetBoolean());
        Assert.True(byKey["XL"].GetProperty("isActive").GetBoolean());
        Assert.Equal(3, byKey.Count);

        var stale = await _a.Put(url, new[] { V("M", "Black", 1, m.GetProperty("id").GetInt32(), version: m.GetProperty("version").GetString()) });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var third = await AdminHttp.Body(await _a.Put(url, new[] { V("L", "Red & Blue", 5) }), HttpStatusCode.OK);
        Assert.Equal(3, third.GetArrayLength());
        Assert.True(third.EnumerateArray().First(r => r.GetProperty("size").GetString() == "L").GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Variants_duplicate_or_negative_is_400()
    {
        var id = (await CreateProduct()).GetProperty("id").GetInt32();
        var url = $"/api/admin/products/{id}/variants";
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put(url, new[] { V("M", "Black", 1), V("m", "black", 2) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put(url, new[] { V("M", "Black", -1) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put(url, new[] { V("", "Black", 1) })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Put("/api/admin/products/99999/variants", new[] { V("M", "Black", 1) })).StatusCode);
    }

    [Fact]
    public async Task Stock_adjust_cannot_go_negative()
    {
        var id = (await CreateProduct()).GetProperty("id").GetInt32();
        var vs = await AdminHttp.Body(await _a.Put($"/api/admin/products/{id}/variants", new[] { V("M", "Black", 5) }), HttpStatusCode.OK);
        var vid = vs[0].GetProperty("id").GetInt32();
        var up = await AdminHttp.Body(await _a.Post($"/api/admin/variants/{vid}/stock", new { delta = 10, reason = "restock" }), HttpStatusCode.OK);
        Assert.Equal(15, up.GetProperty("stock").GetInt32());
        var down = await AdminHttp.Body(await _a.Post($"/api/admin/variants/{vid}/stock", new { delta = -15 }), HttpStatusCode.OK);
        Assert.Equal(0, down.GetProperty("stock").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post($"/api/admin/variants/{vid}/stock", new { delta = -1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Post("/api/admin/variants/99999/stock", new { delta = 1 })).StatusCode);
    }

    [Fact]
    public async Task Category_crud_slug_delete_conflict_and_reorder()
    {
        var c = await AdminHttp.Body(await _a.Post("/api/admin/categories", new { name = "Gloves & Pads" }), HttpStatusCode.Created);
        Assert.Equal("gloves-pads", c.GetProperty("slug").GetString());
        var dupe = await AdminHttp.Body(await _a.Post("/api/admin/categories", new { name = "Gloves & Pads" }), HttpStatusCode.Created);
        Assert.Equal("gloves-pads-2", dupe.GetProperty("slug").GetString());
        var cid = c.GetProperty("id").GetInt32();
        var upd = await AdminHttp.Body(await _a.Put($"/api/admin/categories/{cid}", new { name = "Gloves", isActive = false }), HttpStatusCode.OK);
        Assert.False(upd.GetProperty("isActive").GetBoolean());

        await f.AddProduct(new("In use", _brand.Id, _cat.Id));
        Assert.Equal(HttpStatusCode.Conflict, (await _a.Delete($"/api/admin/categories/{_cat.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/categories/{cid}")).StatusCode);

        var list = await AdminHttp.Body(await _a.Get("/api/admin/categories"), HttpStatusCode.OK);
        Assert.Equal(1, list.EnumerateArray().First(x => x.GetProperty("id").GetInt32() == _cat.Id).GetProperty("productCount").GetInt32());
        var other = dupe.GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Post("/api/admin/categories/reorder", new { ids = new[] { other, _cat.Id } })).StatusCode);
        var after = await AdminHttp.Body(await _a.Get("/api/admin/categories"), HttpStatusCode.OK);
        Assert.Equal(new[] { other, _cat.Id }, after.EnumerateArray().Select(x => x.GetProperty("id").GetInt32()));
    }

    [Fact]
    public async Task Brand_crud_delete_conflict_and_reorder()
    {
        var b = await AdminHttp.Body(await _a.Post("/api/admin/brands", new { name = "Shoei" }), HttpStatusCode.Created);
        Assert.Equal("shoei", b.GetProperty("slug").GetString());
        var bid = b.GetProperty("id").GetInt32();
        await f.AddProduct(new("Branded", _brand.Id, _cat.Id));
        Assert.Equal(HttpStatusCode.Conflict, (await _a.Delete($"/api/admin/brands/{_brand.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/brands", new { name = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Post("/api/admin/brands/reorder", new { ids = new[] { bid, _brand.Id } })).StatusCode);
        var list = await AdminHttp.Body(await _a.Get("/api/admin/brands"), HttpStatusCode.OK);
        Assert.Equal(bid, list[0].GetProperty("id").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/brands/{bid}")).StatusCode);
    }

    [Fact]
    public async Task Category_photo_presign_and_image_key_rules()
    {
        var res = await _a.Post("/api/admin/uploads/presign", new { kind = "category", contentType = "image/webp", bytes = 1000 });
        // 200 when storage is configured, 503 when not: either way a valid request (not 400/404)
        Assert.True(res.StatusCode is HttpStatusCode.OK or HttpStatusCode.ServiceUnavailable, res.StatusCode.ToString());
        if (res.StatusCode == HttpStatusCode.OK)
            Assert.StartsWith("categories/", (await AdminHttp.Body(res, HttpStatusCode.OK)).GetProperty("key").GetString());

        var c = await AdminHttp.Body(await _a.Post("/api/admin/categories", new { name = "Photo Cat " + Guid.NewGuid().ToString("N")[..6] }), HttpStatusCode.Created);
        var id = c.GetProperty("id").GetInt32();
        var name = c.GetProperty("name").GetString();
        // a key outside categories/ (e.g. another product's photo or an arbitrary path) is rejected
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put($"/api/admin/categories/{id}", new { name, imageKey = "products/1/x.webp" })).StatusCode);
        var ok = await AdminHttp.Body(await _a.Put($"/api/admin/categories/{id}", new { name, isActive = false, imageKey = "categories/abc.webp" }), HttpStatusCode.OK);
        Assert.EndsWith("categories/abc.webp", ok.GetProperty("imageUrl").GetString());
        Assert.False(ok.GetProperty("isActive").GetBoolean());
    }
}
