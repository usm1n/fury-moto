using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Tests.AdminCatalog;
using GearDoctor.Tests.Infrastructure;

namespace GearDoctor.Tests.Content;

[Collection(ApiCollection.Name)]
public sealed class ContentTests(ApiFactory f) : IAsyncLifetime
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

    private static object G(string title = "Guide A", string type = "safety", bool pub = true, string? slug = null, int[]? related = null,
        string? version = null, string? cover = null, string? video = null, string? source = null) =>
        new { title, slug, type, excerpt = "ex", body = "## body", isPublished = pub, relatedProductIds = related ?? [], version, coverKey = cover, video, source };

    private async Task<JsonElement> CreateGuide(object body) => await AdminHttp.Body(await _a.Post("/api/admin/guides", body), HttpStatusCode.Created);

    // ------------------------------------------------------------ public
    [Fact]
    public async Task Public_lists_only_published_in_sort_order()
    {
        var g1 = await CreateGuide(G("First"));
        var g2 = await CreateGuide(G("Second"));
        await CreateGuide(G("Hidden", pub: false));
        await AdminHttp.Body(await _a.Post("/api/admin/guides/reorder", new { ids = new[] { g2.GetProperty("id").GetInt32(), g1.GetProperty("id").GetInt32() } }), HttpStatusCode.NoContent);

        using var c = AdminHttp.NewClient(f);
        var res = await c.GetAsync("/api/content/guides");
        Assert.Equal("public, no-cache", res.Headers.CacheControl!.ToString());
        Assert.Equal("max-age=60, stale-while-revalidate=600", string.Join(",", res.Headers.GetValues("Vercel-CDN-Cache-Control")));
        var list = await AdminHttp.Body(res, HttpStatusCode.OK);
        Assert.Equal(new[] { "Second", "First" }, list.EnumerateArray().Select(x => x.GetProperty("title").GetString()));
        Assert.False(list[0].TryGetProperty("body", out _));
        Assert.Equal((int)HttpStatusCode.NotFound, (int)(await c.GetAsync("/api/content/guides/hidden")).StatusCode);
    }

    [Fact]
    public async Task Guide_detail_has_published_related_products_in_saved_order_and_legacy_cover_passthrough()
    {
        var p1 = await f.AddProduct(new ProductSpec("Alpha", _brand.Id, _cat.Id));
        var p2 = await f.AddProduct(new ProductSpec("Bravo", _brand.Id, _cat.Id));
        var draft = await f.AddProduct(new ProductSpec("Charlie", _brand.Id, _cat.Id) { Status = ProductStatus.Draft });
        await CreateGuide(G("Detail", related: [p2.Id, draft.Id, p1.Id], cover: "assets/img/categories/helmets.webp", video: "rider-hero"));

        using var c = AdminHttp.NewClient(f);
        var d = await AdminHttp.Body(await c.GetAsync("/api/content/guides/detail"), HttpStatusCode.OK);
        Assert.Equal("## body", d.GetProperty("body").GetString());
        Assert.Equal("/assets/img/categories/helmets.webp", d.GetProperty("coverUrl").GetString());
        Assert.Equal("rider-hero", d.GetProperty("video").GetString());
        Assert.Equal(new[] { "bravo", "alpha" }, d.GetProperty("relatedProducts").EnumerateArray().Select(x => x.GetProperty("slug").GetString()));
        Assert.True(d.GetProperty("relatedProducts")[0].TryGetProperty("price", out _));
    }

    [Fact]
    public async Task Public_faqs_and_testimonials_published_only_in_order()
    {
        var f1 = await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "One?", a = "A1" }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "Two?", a = "A2" }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "Off?", a = "A3", isPublished = false }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/testimonials", new { name = "Ali", quote = "Great", rating = 5 }), HttpStatusCode.Created);
        await AdminHttp.Body(await _a.Post("/api/admin/testimonials", new { name = "Hidden", quote = "x", rating = 3, isPublished = false }), HttpStatusCode.Created);

        using var c = AdminHttp.NewClient(f);
        var faqs = await AdminHttp.Body(await c.GetAsync("/api/content/faqs"), HttpStatusCode.OK);
        Assert.Equal(new[] { "One?", "Two?" }, faqs.EnumerateArray().Select(x => x.GetProperty("q").GetString()));
        var ts = await AdminHttp.Body(await c.GetAsync("/api/content/testimonials"), HttpStatusCode.OK);
        Assert.Single(ts.EnumerateArray());
        Assert.Equal(5, ts[0].GetProperty("rating").GetInt32());
        Assert.NotEqual(0, f1.GetProperty("id").GetInt32());
    }

    // ------------------------------------------------------------ admin guides
    [Fact]
    public async Task Admin_requires_login_and_csrf()
    {
        var anon = AdminHttp.NewClient(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/guides")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/admin/alerts")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _a.Send(HttpMethod.Post, "/api/admin/faqs", new { q = "x", a = "y" }, csrf: false)).StatusCode);
    }

    [Fact]
    public async Task Guide_slug_from_title_is_unique_and_validation_applies()
    {
        var a = await CreateGuide(G("Same Title"));
        var b = await CreateGuide(G("Same Title"));
        var c = await CreateGuide(G("Same Title"));
        Assert.Equal(new[] { "same-title", "same-title-2", "same-title-3" }, new[] { a, b, c }.Select(x => x.GetProperty("slug").GetString()));

        var bad = await AdminHttp.Body(await _a.Post("/api/admin/guides", G("", type: "nope")), HttpStatusCode.BadRequest);
        Assert.True(bad.GetProperty("errors").TryGetProperty("title", out _));
        Assert.True(bad.GetProperty("errors").TryGetProperty("type", out _));
        var tooLong = await _a.Post("/api/admin/guides", new { title = "x", type = "safety", excerpt = new string('e', 301), body = "b" });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        var missing = await _a.Post("/api/admin/guides", G("Rel", related: [99999]));
        var m = await AdminHttp.Body(missing, HttpStatusCode.BadRequest);
        Assert.True(m.GetProperty("errors").TryGetProperty("relatedProductIds", out _));
        var many = await _a.Post("/api/admin/guides", G("Many", related: Enumerable.Range(1, 9).ToArray()));
        Assert.Equal(HttpStatusCode.BadRequest, many.StatusCode);
    }

    [Fact]
    public async Task Guide_put_needs_version_and_stale_is_409()
    {
        var g = await CreateGuide(G("Versioned"));
        var id = g.GetProperty("id").GetInt32();
        var v1 = g.GetProperty("version").GetString();

        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Put($"/api/admin/guides/{id}", G("Versioned"))).StatusCode);

        var ok = await AdminHttp.Body(await _a.Put($"/api/admin/guides/{id}", G("Versioned 2", version: v1)), HttpStatusCode.OK);
        Assert.Equal("Versioned 2", ok.GetProperty("title").GetString());
        Assert.Equal("versioned", ok.GetProperty("slug").GetString());   // title edits keep the slug
        Assert.NotEqual(v1, ok.GetProperty("version").GetString());

        var stale = await _a.Put($"/api/admin/guides/{id}", G("Versioned 3", version: v1));
        var body = await AdminHttp.Body(stale, HttpStatusCode.Conflict);
        Assert.Equal("/problems/stale", body.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Guide_cover_video_source_null_is_unchanged_and_empty_clears()
    {
        var g = await CreateGuide(G("Media", cover: "guides/abc.webp", video: "rider-hero", source: "https://www.instagram.com/reel/x/"));
        var id = g.GetProperty("id").GetInt32();
        Assert.Equal("guides/abc.webp", g.GetProperty("coverKey").GetString());

        var same = await AdminHttp.Body(await _a.Put($"/api/admin/guides/{id}", G("Media", version: g.GetProperty("version").GetString())), HttpStatusCode.OK);
        Assert.Equal("guides/abc.webp", same.GetProperty("coverKey").GetString());
        Assert.Equal("rider-hero", same.GetProperty("video").GetString());
        Assert.Equal("https://www.instagram.com/reel/x/", same.GetProperty("source").GetString());

        var cleared = await AdminHttp.Body(await _a.Put($"/api/admin/guides/{id}",
            G("Media", version: same.GetProperty("version").GetString(), cover: "", video: "", source: "")), HttpStatusCode.OK);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("coverKey").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("video").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("source").ValueKind);

        var badCover = await _a.Post("/api/admin/guides", G("Bad", cover: "https://evil.example/x.png"));
        Assert.Equal(HttpStatusCode.BadRequest, badCover.StatusCode);
    }

    [Fact]
    public async Task Guide_admin_includes_related_product_refs_and_delete_works()
    {
        var p = await f.AddProduct(new ProductSpec("Ref Product", _brand.Id, _cat.Id));
        var g = await CreateGuide(G("Refs", related: [p.Id]));
        var rp = g.GetProperty("relatedProducts")[0];
        Assert.Equal(p.Id, rp.GetProperty("id").GetInt32());
        Assert.Equal("Ref Product", rp.GetProperty("title").GetString());

        var id = g.GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/guides/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Get($"/api/admin/guides/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Delete($"/api/admin/guides/{id}")).StatusCode);
    }

    [Fact]
    public async Task Presign_accepts_guide_kind_without_product()
    {
        var res = await _a.Post("/api/admin/uploads/presign", new { kind = "guide", contentType = "image/webp", bytes = 1000 });
        // 200 when R2 is configured, 503 when it is not: either way the request itself was valid (not 400/404)
        Assert.True(res.StatusCode is HttpStatusCode.OK or HttpStatusCode.ServiceUnavailable, res.StatusCode.ToString());
        if (res.StatusCode == HttpStatusCode.OK)
            Assert.StartsWith("guides/", (await AdminHttp.Body(res, HttpStatusCode.OK)).GetProperty("key").GetString());
    }

    // ------------------------------------------------------------ faqs and testimonials
    [Fact]
    public async Task Faq_crud_validation_and_reorder_without_versioning()
    {
        var a = await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "A?", a = "a" }), HttpStatusCode.Created);
        var b = await AdminHttp.Body(await _a.Post("/api/admin/faqs", new { q = "B?", a = "b" }), HttpStatusCode.Created);
        var ia = a.GetProperty("id").GetInt32(); var ib = b.GetProperty("id").GetInt32();
        Assert.True(b.GetProperty("sortOrder").GetInt32() > a.GetProperty("sortOrder").GetInt32());

        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/faqs", new { q = "", a = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/faqs", new { q = new string('q', 201), a = "x" })).StatusCode);

        var upd = await AdminHttp.Body(await _a.Put($"/api/admin/faqs/{ia}", new { q = "A2?", a = "a2", isPublished = false }), HttpStatusCode.OK);
        Assert.False(upd.GetProperty("isPublished").GetBoolean());
        // last write wins: a second PUT never conflicts
        Assert.Equal(HttpStatusCode.OK, (await _a.Put($"/api/admin/faqs/{ia}", new { q = "A3?", a = "a3" })).StatusCode);

        await AdminHttp.Body(await _a.Post("/api/admin/faqs/reorder", new { ids = new[] { ib, ia } }), HttpStatusCode.NoContent);
        var list = await AdminHttp.Body(await _a.Get("/api/admin/faqs"), HttpStatusCode.OK);
        Assert.Equal(new[] { ib, ia }, list.EnumerateArray().Select(x => x.GetProperty("id").GetInt32()));

        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/faqs/{ia}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _a.Get($"/api/admin/faqs/{ia}")).StatusCode);
    }

    [Fact]
    public async Task Testimonial_crud_rating_validation_and_reorder()
    {
        var a = await AdminHttp.Body(await _a.Post("/api/admin/testimonials", new { name = "Ali", bike = "GSX", quote = "q", rating = 4 }), HttpStatusCode.Created);
        var b = await AdminHttp.Body(await _a.Post("/api/admin/testimonials", new { name = "Bo", quote = "q2", rating = 5 }), HttpStatusCode.Created);
        var ia = a.GetProperty("id").GetInt32(); var ib = b.GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/testimonials", new { name = "X", quote = "q", rating = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/testimonials", new { name = "X", quote = "q", rating = 6 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _a.Post("/api/admin/testimonials", new { name = "X", quote = new string('q', 601), rating = 5 })).StatusCode);

        var upd = await AdminHttp.Body(await _a.Put($"/api/admin/testimonials/{ia}", new { name = "Ali R", bike = "", quote = "new", rating = 3 }), HttpStatusCode.OK);
        Assert.Equal(3, upd.GetProperty("rating").GetInt32());
        Assert.Equal(JsonValueKind.Null, upd.GetProperty("bike").ValueKind);

        await AdminHttp.Body(await _a.Post("/api/admin/testimonials/reorder", new { ids = new[] { ib, ia } }), HttpStatusCode.NoContent);
        var list = await AdminHttp.Body(await _a.Get("/api/admin/testimonials"), HttpStatusCode.OK);
        Assert.Equal(new[] { ib, ia }, list.EnumerateArray().Select(x => x.GetProperty("id").GetInt32()));
        Assert.Equal(HttpStatusCode.NoContent, (await _a.Delete($"/api/admin/testimonials/{ib}")).StatusCode);
    }

    // ------------------------------------------------------------ alerts
    [Fact]
    public async Task Alerts_count_new_orders_low_stock_and_sold_out()
    {
        await f.SetSetting("lowStockThreshold", "3");
        await f.AddProduct(new ProductSpec("Fine", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 10)] });
        await f.AddProduct(new ProductSpec("Low", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 2), new("L", "Black", 3), new("XL", "Black", 4), new("S", "Black", 0)] });
        await f.AddProduct(new ProductSpec("Gone", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 0), new("L", "Black", 0)] });
        await f.AddProduct(new ProductSpec("DraftLow", _brand.Id, _cat.Id) { Status = ProductStatus.Draft, Variants = [new("M", "Black", 1)] });
        await f.AddProduct(new ProductSpec("InactiveLow", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 9), new("L", "Black", 1, null, false)] });
        await f.WithDb(async db =>
        {
            db.Orders.Add(new Order { OrderNumber = "GD-9001", CustomerName = "n", Phone = "03001234567", City = "c", Address = "a", Status = OrderStatus.New, CreatedAt = DateTimeOffset.UtcNow });
            db.Orders.Add(new Order { OrderNumber = "GD-9002", CustomerName = "n", Phone = "03001234567", City = "c", Address = "a", Status = OrderStatus.Confirmed, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        });

        var r = await AdminHttp.Body(await _a.Get("/api/admin/alerts"), HttpStatusCode.OK);
        Assert.Equal(1, r.GetProperty("newOrders").GetInt32());
        Assert.Equal(2, r.GetProperty("lowStock").GetInt32());    // Low: M(2) and L(3); not XL(4), S(0), draft, inactive
        Assert.Equal(1, r.GetProperty("soldOut").GetInt32());     // Gone
    }
}
