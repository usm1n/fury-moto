using System.Net;
using System.Text.RegularExpressions;
using GearDoctor.Domain;
using GearDoctor.Tests.AdminCatalog;
using GearDoctor.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace GearDoctor.Tests.Seo;

[Collection(ApiCollection.Name)]
public sealed class SeoTests(ApiFactory f) : IAsyncLifetime
{
    private Category _cat = null!;
    private Brand _brand = null!;
    private HttpClient _c = null!;

    public async Task InitializeAsync()
    {
        SeoStub.Fail = false;
        await f.ResetAsync();
        _cat = await f.AddCategory("Helmets");
        _brand = await f.AddBrand("AGV");
        _c = f.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    }
    public Task DisposeAsync() { SeoStub.Fail = false; return Task.CompletedTask; }

    [Fact]
    public async Task Product_page_injects_escaped_head_tags_jsonld_and_base_first()
    {
        var p = await f.AddProduct(new ProductSpec("AGV \"Pista\" <GP> & Co", _brand.Id, _cat.Id, 45000) { Slug = "agv-pista" });
        await f.WithDb(async db =>
        {
            var row = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstAsync(db.Products, x => x.Id == p.Id);
            row.Description = "Race **ready** helmet </script><script>alert(1)</script> with a long description " + new string('x', 300);
            await db.SaveChangesAsync();
        });

        var res = await _c.GetAsync("/api/seo/product/agv-pista");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("public, s-maxage=300, stale-while-revalidate=600", res.Headers.CacheControl!.ToString());
        Assert.StartsWith("text/html", res.Content.Headers.ContentType!.ToString());
        var html = await res.Content.ReadAsStringAsync();

        Assert.Matches(@"<head>\s*<base href=""/"">", html);                                    // first child of head
        Assert.Contains("<title>AGV &quot;Pista&quot; &lt;GP&gt; &amp; Co | The Gear Doctor</title>", html);
        Assert.Single(Regex.Matches(html, "<title"));                                             // old title replaced
        Assert.DoesNotContain("<title>old</title>", html);
        Assert.Single(Regex.Matches(html, @"name=""description"""));
        Assert.Single(Regex.Matches(html, @"property=""og:type"""));
        Assert.Contains(@"<meta property=""og:type"" content=""product"">", html);
        Assert.Contains(@"<link rel=""canonical"" href=""https://shop.example.test/products/agv-pista"">", html);
        Assert.Contains(@"property=""og:url"" content=""https://shop.example.test/products/agv-pista""", html);
        Assert.Contains(@"name=""twitter:card"" content=""summary_large_image""", html);
        Assert.Contains(@"property=""product:price:amount"" content=""45000""", html);
        Assert.Contains(@"property=""product:price:currency"" content=""PKR""", html);
        Assert.Contains(@"property=""og:title"" content=""AGV &quot;Pista&quot; &lt;GP&gt; &amp; Co""", html);
        // main image becomes absolute (legacy-style relative key is prefixed with SITE_URL or the R2 url)
        Assert.Matches(@"property=""og:image"" content=""https?://", html);
        Assert.DoesNotContain("og-default.jpg", html);

        // description: markdown stripped, hostile markup encoded, trimmed to ~155 chars
        var desc = Regex.Match(html, @"name=""description"" content=""([^""]*)""").Groups[1].Value;
        Assert.DoesNotContain("**", desc);
        Assert.DoesNotContain("<", desc);
        Assert.True(desc.Length <= 200, desc.Length.ToString());

        // JSON-LD
        var ld = Regex.Match(html, @"<script type=""application/ld\+json"">(.*?)</script>", RegexOptions.Singleline).Groups[1].Value;
        Assert.DoesNotContain("<", ld);
        using var json = System.Text.Json.JsonDocument.Parse(ld);
        var root = json.RootElement;
        Assert.Equal("Product", root.GetProperty("@type").GetString());
        Assert.Equal("AGV \"Pista\" <GP> & Co", root.GetProperty("name").GetString());
        Assert.Equal("AGV", root.GetProperty("brand").GetProperty("name").GetString());
        Assert.True(root.GetProperty("image").GetArrayLength() >= 1);
        var offers = root.GetProperty("offers");
        Assert.Equal(45000, offers.GetProperty("price").GetInt32());
        Assert.Equal("PKR", offers.GetProperty("priceCurrency").GetString());
        Assert.Equal("https://schema.org/InStock", offers.GetProperty("availability").GetString());
        Assert.Equal("https://shop.example.test/products/agv-pista", offers.GetProperty("url").GetString());
        Assert.Contains("AGV-PISTA", root.GetProperty("sku").GetString());
        Assert.Single(Regex.Matches(html, "application/ld\\+json"));
    }

    [Fact]
    public async Task Out_of_stock_product_is_marked_so()
    {
        await f.AddProduct(new ProductSpec("Empty", _brand.Id, _cat.Id) { Variants = [new("M", "Black", 0)] });
        var html = await (await _c.GetAsync("/api/seo/product/empty")).Content.ReadAsStringAsync();
        Assert.Contains("https://schema.org/OutOfStock", html);
    }

    [Fact]
    public async Task Unknown_draft_and_deleted_slugs_get_a_404_page_linking_to_the_shop()
    {
        await f.AddProduct(new ProductSpec("Draft One", _brand.Id, _cat.Id) { Status = ProductStatus.Draft });
        foreach (var slug in new[] { "draft-one", "nope" })
        {
            var res = await _c.GetAsync($"/api/seo/product/{slug}");
            Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
            var html = await res.Content.ReadAsStringAsync();
            Assert.Contains(@"href=""/shop.html""", html);
            Assert.DoesNotContain("draft", html, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Unreachable_template_redirects_to_the_client_rendered_page()
    {
        await f.AddProduct(new ProductSpec("Redirect Me", _brand.Id, _cat.Id));
        SeoStub.Fail = true;
        // a fresh host has a cold template cache, so the failing fetch is really hit
        using var fresh = f.WithWebHostBuilder(_ => { });
        using var c = fresh.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        var res = await c.GetAsync("/api/seo/product/redirect-me");
        Assert.Equal(HttpStatusCode.Found, res.StatusCode);
        Assert.Equal("/product.html?slug=redirect-me", res.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Missing_site_url_is_a_503_problem_not_a_crash()
    {
        using var noUrl = f.WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, cfg) =>
            cfg.AddInMemoryCollection(new Dictionary<string, string?> { ["SITE_URL"] = "" })));
        using var c = noUrl.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        foreach (var url in new[] { "/api/seo/product/x", "/api/seo/sitemap.xml" })
        {
            var res = await c.GetAsync(url);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
            Assert.Equal("application/problem+json", res.Content.Headers.ContentType!.MediaType);
        }
    }

    [Fact]
    public async Task Sitemap_lists_static_pages_published_products_and_guides_only()
    {
        await f.AddProduct(new ProductSpec("Live One", _brand.Id, _cat.Id));
        await f.AddProduct(new ProductSpec("Draft Two", _brand.Id, _cat.Id) { Status = ProductStatus.Draft });
        await f.WithDb(async db =>
        {
            db.Guides.Add(new Guide { Slug = "live-guide", Title = "t", Type = "safety", IsPublished = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            db.Guides.Add(new Guide { Slug = "draft-guide", Title = "t", Type = "safety", IsPublished = false, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        });

        var res = await _c.GetAsync("/api/seo/sitemap.xml");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.StartsWith("application/xml", res.Content.Headers.ContentType!.ToString());
        Assert.Equal("public, s-maxage=300, stale-while-revalidate=600", res.Headers.CacheControl!.ToString());
        var xml = await res.Content.ReadAsStringAsync();
        System.Xml.Linq.XDocument.Parse(xml);   // well-formed
        Assert.Contains("<loc>https://shop.example.test/</loc>", xml);
        Assert.Contains("<loc>https://shop.example.test/shop.html</loc>", xml);
        Assert.DoesNotContain("cart", xml);
        Assert.Contains("<loc>https://shop.example.test/products/live-one</loc>", xml);
        Assert.Matches(@"products/live-one</loc><lastmod>\d{4}-\d{2}-\d{2}</lastmod>", xml);
        Assert.DoesNotContain("draft-two", xml);
        Assert.Contains("guide.html?id=live-guide", xml);
        Assert.DoesNotContain("draft-guide", xml);
    }
}
