using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Tests.Infrastructure;

namespace GearDoctor.Tests.Catalog;

[Collection(ApiCollection.Name)]
public sealed class CatalogTests(ApiFactory f) : IAsyncLifetime
{
    private readonly HttpClient _http = f.CreateClient();
    private Category _helmets = null!, _jackets = null!;
    private Brand _agv = null!, _alpine = null!;
    private Certification _ece = null!, _dot = null!;

    public async Task InitializeAsync()
    {
        await f.ResetAsync();
        _helmets = await f.AddCategory("Helmets", 1);
        _jackets = await f.AddCategory("Jackets", 2);
        _agv = await f.AddBrand("AGV");
        _alpine = await f.AddBrand("Alpinestars");
        _ece = await f.AddCert("ECE_22_06", "ECE 22.06");
        _dot = await f.AddCert("DOT", "DOT");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<JsonElement> Get(string url, HttpStatusCode expect = HttpStatusCode.OK)
    {
        var res = await _http.GetAsync(url);
        Assert.Equal(expect, res.StatusCode);
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private async Task<string[]> Slugs(string url) =>
        (await Get(url)).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("slug").GetString()!).ToArray();

    private async Task Seed()
    {
        await f.AddProduct(new("Pista Helmet", _agv.Id, _helmets.Id, 50000) { Featured = true, SortOrder = 1, CertIds = [_ece.Id, _dot.Id],
            Variants = [new("M", "Black", 5), new("L", "Black", 0)], CreatedAt = DateTimeOffset.UtcNow.AddDays(-3) });
        await f.AddProduct(new("K1 Helmet", _agv.Id, _helmets.Id, 20000) { SortOrder = 2, CertIds = [_dot.Id],
            Variants = [new("S", "Red", 0)], CreatedAt = DateTimeOffset.UtcNow.AddDays(-2) });
        await f.AddProduct(new("Tech Jacket", _alpine.Id, _jackets.Id, 35000) { SortOrder = 3,
            Variants = [new("XL", "Grey", 2)], CreatedAt = DateTimeOffset.UtcNow.AddDays(-1) });
        await f.AddProduct(new("Draft Helmet", _agv.Id, _helmets.Id, 1000) { Status = ProductStatus.Draft });
        await f.AddProduct(new("Deleted Helmet", _agv.Id, _helmets.Id, 1000) { Deleted = true });
    }

    [Fact]
    public async Task Draft_and_deleted_products_are_hidden()
    {
        await Seed();
        var json = await Get("/api/products");
        Assert.Equal(3, json.GetProperty("total").GetInt32());
        Assert.DoesNotContain("draft-helmet", await Slugs("/api/products"));
        Assert.DoesNotContain("deleted-helmet", await Slugs("/api/products"));
    }

    [Fact]
    public async Task Card_shape_and_images()
    {
        await Seed();
        var items = (await Get("/api/products?q=pista")).GetProperty("items");
        var card = Assert.Single(items.EnumerateArray());
        Assert.Equal("pista-helmet", card.GetProperty("slug").GetString());
        Assert.Equal("agv", card.GetProperty("brand").GetProperty("slug").GetString());
        Assert.Equal("Helmets", card.GetProperty("category").GetProperty("name").GetString());
        Assert.Equal(50000, card.GetProperty("price").GetInt32());
        Assert.Equal(JsonValueKind.Null, card.GetProperty("compareAtPrice").ValueKind);
        Assert.Equal(2, card.GetProperty("images").GetArrayLength());
        Assert.StartsWith("/products/pista-helmet/0", card.GetProperty("images")[0].GetProperty("url").GetString());
        Assert.Contains("thumbUrl", card.GetProperty("images")[0].EnumerateObject().Select(p => p.Name));
        Assert.True(card.GetProperty("inStock").GetBoolean());
        Assert.Equal(["L", "M"], card.GetProperty("sizes").EnumerateArray().Select(x => x.GetString()!).Order().ToArray());
        Assert.Equal(["DOT", "ECE 22.06"], card.GetProperty("certifications").EnumerateArray().Select(x => x.GetString()!).Order().ToArray());
    }

    [Fact]
    public async Task Filter_category_brand_size_cert()
    {
        await Seed();
        Assert.Equal(["pista-helmet", "k1-helmet"], await Slugs("/api/products?category=helmets"));
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?brand=alpinestars"));
        Assert.Equal(3, (await Slugs("/api/products?brand=alpinestars,agv")).Length);
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?size=XL"));
        Assert.Equal(["pista-helmet", "k1-helmet"], await Slugs("/api/products?size=S,L"));
        Assert.Equal(["pista-helmet"], await Slugs("/api/products?cert=ECE_22_06"));
        Assert.Equal(["pista-helmet", "k1-helmet"], await Slugs("/api/products?cert=DOT,ECE_22_06"));
    }

    [Fact]
    public async Task Filter_price_instock_and_search()
    {
        await Seed();
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?minPrice=30000&maxPrice=40000"));
        Assert.Equal(["k1-helmet"], await Slugs("/api/products?maxPrice=20000"));
        Assert.Equal(["pista-helmet", "tech-jacket"], await Slugs("/api/products?inStock=true"));
        Assert.Equal(["pista-helmet", "k1-helmet"], await Slugs("/api/products?q=HELMET"));
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?q=alpine"));          // brand name
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?q=jackets"));         // category name
        Assert.Equal(["pista-helmet"], await Slugs("/api/products?q=agv pista"));      // all terms
        Assert.Empty(await Slugs("/api/products?q=pista jacket"));
    }

    [Fact]
    public async Task Sorting()
    {
        await Seed();
        Assert.Equal(["pista-helmet", "k1-helmet", "tech-jacket"], await Slugs("/api/products"));
        Assert.Equal(["pista-helmet", "k1-helmet", "tech-jacket"], await Slugs("/api/products?sort=featured"));
        Assert.Equal(["k1-helmet", "tech-jacket", "pista-helmet"], await Slugs("/api/products?sort=price-asc"));
        Assert.Equal(["pista-helmet", "tech-jacket", "k1-helmet"], await Slugs("/api/products?sort=price-desc"));
        Assert.Equal(["tech-jacket", "k1-helmet", "pista-helmet"], await Slugs("/api/products?sort=new"));
        Assert.Equal(["k1-helmet", "pista-helmet", "tech-jacket"], await Slugs("/api/products?sort=name"));
    }

    [Fact]
    public async Task Paging_and_validation()
    {
        await Seed();
        var p1 = await Get("/api/products?pageSize=2&page=1&sort=name");
        Assert.Equal(3, p1.GetProperty("total").GetInt32());
        Assert.Equal(2, p1.GetProperty("pageSize").GetInt32());
        Assert.Equal(2, p1.GetProperty("items").GetArrayLength());
        Assert.Equal(["tech-jacket"], await Slugs("/api/products?pageSize=2&page=2&sort=name"));
        Assert.Empty(await Slugs("/api/products?pageSize=2&page=9"));

        var bad = await _http.GetAsync("/api/products?pageSize=61");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Contains("problem+json", bad.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.GetAsync("/api/products?sort=bogus")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _http.GetAsync("/api/products?page=0")).StatusCode);
    }

    [Fact]
    public async Task Inactive_category_and_brand_products_are_hidden()
    {
        var hidden = await f.AddCategory("Hidden", 9, active: false);
        var ghost = await f.AddBrand("Ghost", active: false);
        await f.AddProduct(new("In Hidden Cat", _agv.Id, hidden.Id));
        await f.AddProduct(new("By Ghost", ghost.Id, _helmets.Id));
        await f.AddProduct(new("Visible", _agv.Id, _helmets.Id));
        Assert.Equal(["visible"], await Slugs("/api/products"));
        var cats = await Get("/api/categories");
        Assert.DoesNotContain("hidden", cats.EnumerateArray().Select(c => c.GetProperty("slug").GetString()!));
        Assert.DoesNotContain("ghost", (await Get("/api/brands")).EnumerateArray().Select(c => c.GetProperty("slug").GetString()!));
    }

    [Fact]
    public async Task Detail_variants_lowstock_related()
    {
        await f.SetSetting(SettingKeys.LowStockThreshold, "3");
        await f.AddProduct(new("Main Helmet", _agv.Id, _helmets.Id, 40000) { CompareAtPrice = 45000, Badges = ["New"], CertIds = [_ece.Id],
            Variants = [new("M", "Black", 25), new("L", "Black", 3, PriceOverride: 42000), new("XL", "Black", 0),
                        new("S", "Black", 5, Active: false)] });
        await f.AddProduct(new("Sibling A", _agv.Id, _helmets.Id) { SortOrder = 1 });
        await f.AddProduct(new("Sibling B", _agv.Id, _helmets.Id) { SortOrder = 2 });
        await f.AddProduct(new("Other Jacket", _alpine.Id, _jackets.Id) { SortOrder = 3 });
        await f.AddProduct(new("Another Jacket", _alpine.Id, _jackets.Id) { SortOrder = 4 });
        await f.AddProduct(new("Third Jacket", _alpine.Id, _jackets.Id) { SortOrder = 5 });
        await f.AddProduct(new("Draft Sibling", _agv.Id, _helmets.Id) { Status = ProductStatus.Draft });

        var d = await Get("/api/products/main-helmet");
        Assert.Equal("Main Helmet", d.GetProperty("title").GetString());
        Assert.Equal(45000, d.GetProperty("compareAtPrice").GetInt32());
        Assert.Equal("long", d.GetProperty("description").GetString());
        Assert.Equal("note", d.GetProperty("gearDoctorNote").GetString());
        Assert.Equal("Shell", d.GetProperty("specs")[0].GetProperty("label").GetString());
        Assert.Equal("ECE_22_06", d.GetProperty("certificationDetails")[0].GetProperty("code").GetString());
        Assert.Equal(3, d.GetProperty("images").GetArrayLength());

        var vars = d.GetProperty("variants").EnumerateArray().ToDictionary(v => v.GetProperty("size").GetString()!);
        Assert.Equal(3, vars.Count);                                   // inactive excluded
        Assert.Equal(10, vars["M"].GetProperty("available").GetInt32());   // capped
        Assert.False(vars["M"].GetProperty("lowStock").GetBoolean());
        Assert.Equal(40000, vars["M"].GetProperty("price").GetInt32());
        Assert.Equal(42000, vars["L"].GetProperty("price").GetInt32());
        Assert.True(vars["L"].GetProperty("lowStock").GetBoolean());
        Assert.Equal(0, vars["XL"].GetProperty("available").GetInt32());
        Assert.False(vars["XL"].GetProperty("lowStock").GetBoolean());

        var related = d.GetProperty("related").EnumerateArray().Select(r => r.GetProperty("slug").GetString()!).ToArray();
        Assert.Equal(["sibling-a", "sibling-b", "other-jacket", "another-jacket"], related);
    }

    [Fact]
    public async Task Detail_404_for_unknown_and_draft()
    {
        await f.AddProduct(new("Draft Thing", _agv.Id, _helmets.Id) { Status = ProductStatus.Draft });
        var res = await _http.GetAsync("/api/products/nope");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Contains("problem+json", res.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await _http.GetAsync("/api/products/draft-thing")).StatusCode);
    }

    [Fact]
    public async Task Featured_uses_flag_then_falls_back_to_newest()
    {
        await f.AddProduct(new("Old", _agv.Id, _helmets.Id) { CreatedAt = DateTimeOffset.UtcNow.AddDays(-5) });
        await f.AddProduct(new("New", _agv.Id, _helmets.Id) { CreatedAt = DateTimeOffset.UtcNow });
        Assert.Equal(["new", "old"], (await Get("/api/products/featured")).EnumerateArray().Select(c => c.GetProperty("slug").GetString()!));
        await f.AddProduct(new("Star", _agv.Id, _helmets.Id) { Featured = true });
        Assert.Equal(["star"], (await Get("/api/products/featured")).EnumerateArray().Select(c => c.GetProperty("slug").GetString()!));
    }

    [Fact]
    public async Task Facets()
    {
        await Seed();
        var all = await Get("/api/products/facets");
        Assert.Equal(20000, all.GetProperty("minPrice").GetInt32());
        Assert.Equal(50000, all.GetProperty("maxPrice").GetInt32());
        Assert.Equal(2, all.GetProperty("brands").GetArrayLength());

        var h = await Get("/api/products/facets?category=helmets");
        Assert.Equal(50000, h.GetProperty("maxPrice").GetInt32());
        var brand = Assert.Single(h.GetProperty("brands").EnumerateArray());
        Assert.Equal("agv", brand.GetProperty("slug").GetString());
        Assert.Equal(2, brand.GetProperty("count").GetInt32());
        Assert.Equal(["L", "M", "S"], h.GetProperty("sizes").EnumerateArray().Select(x => x.GetString()!).Order().ToArray());
        Assert.Equal(2, h.GetProperty("certifications").GetArrayLength());
    }

    [Fact]
    public async Task Lookups_and_settings()
    {
        await Seed();
        var cats = await Get("/api/categories");
        Assert.Equal(["helmets", "jackets"], cats.EnumerateArray().Select(c => c.GetProperty("slug").GetString()!));
        Assert.Equal(2, cats[0].GetProperty("productCount").GetInt32());
        Assert.Equal(2, (await Get("/api/brands")).GetArrayLength());
        Assert.Equal(2, (await Get("/api/certifications")).GetArrayLength());

        await f.SetSetting(SettingKeys.WhatsappNumber, "\"923001234567\"");
        await f.SetSetting(SettingKeys.DeliveryFee, "250");
        await f.SetSetting(SettingKeys.CodEnabled, "true");
        await f.SetSetting(SettingKeys.BankTransferEnabled, "false");
        await f.SetSetting(SettingKeys.City, "null");
        var s = await Get("/api/settings/public");
        Assert.Equal("923001234567", s.GetProperty("whatsappNumber").GetString());
        Assert.Equal(250, s.GetProperty("deliveryFee").GetInt32());
        Assert.True(s.GetProperty("codEnabled").GetBoolean());
        Assert.False(s.GetProperty("bankTransferEnabled").GetBoolean());
        Assert.Equal(JsonValueKind.Null, s.GetProperty("city").ValueKind);
        Assert.Equal(JsonValueKind.Null, s.GetProperty("email").ValueKind);
        Assert.Equal(JsonValueKind.String, s.GetProperty("turnstileSiteKey").ValueKind);
    }

    [Theory]
    [InlineData("/api/products")]
    [InlineData("/api/products/featured")]
    [InlineData("/api/products/facets")]
    [InlineData("/api/categories")]
    [InlineData("/api/brands")]
    [InlineData("/api/certifications")]
    [InlineData("/api/settings/public")]
    public async Task Public_gets_are_cacheable(string url)
    {
        var res = await _http.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var cc = res.Headers.CacheControl!.ToString();
        Assert.Contains("public", cc);
        Assert.Contains("s-maxage=60", cc);
        Assert.Contains("stale-while-revalidate=600", cc);
    }

    [Fact]
    public async Task Detail_is_cacheable()
    {
        await f.AddProduct(new("Cached", _agv.Id, _helmets.Id));
        var res = await _http.GetAsync("/api/products/cached");
        Assert.Contains("s-maxage=60", res.Headers.CacheControl!.ToString());
    }
}
