using GearDoctor.Api.Infrastructure;
using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using GearDoctor.Application.Seo;
using Microsoft.Extensions.Caching.Memory;

namespace GearDoctor.Api.Endpoints;

/// <summary>
/// SEO pre-render. Vercel rewrites /products/{slug} and /sitemap.xml here.
///   GET /api/seo/product/{slug}  the storefront's product.html with title, description, canonical, OG/Twitter
///                                tags and Product JSON-LD injected, so crawlers and link previews see real content.
///   GET /api/seo/sitemap.xml     static pages + published products + published guides.
/// Env: SITE_URL (required; absent = 503 ProblemDetails, never a startup failure), STORE_NAME (default "The Gear Doctor").
/// The template HTML is cached in memory for 10 minutes. That is only a cache: any instance can refetch it.
/// </summary>
public static partial class SeoEndpoints
{
    public const string TemplateClient = "seo-template";
    private static readonly TimeSpan TemplateTtl = TimeSpan.FromMinutes(10);
    private static readonly string[] StaticPages = ["/", "/shop.html", "/gear-doctor.html", "/about.html", "/contact.html"];

    private static readonly JsonSerializerOptions LdJson = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public static IServiceCollection AddSeo(this IServiceCollection s)
    {
        s.AddMemoryCache();
        s.AddHttpClient(TemplateClient, c => c.Timeout = TimeSpan.FromSeconds(3));
        return s;
    }

    public static IEndpointRouteBuilder MapSeo(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/seo").WithTags("Seo").AllowAnonymous();
        // GET + HEAD: crawlers and link-preview bots often probe with HEAD first.
        g.MapMethods("/product/{slug}", ["GET", "HEAD"], Product);
        g.MapMethods("/sitemap.xml", ["GET", "HEAD"], Sitemap);
        return app;
    }

    private static string? SiteUrl(IConfiguration config) =>
        config["SITE_URL"] is { Length: > 0 } s && Uri.TryCreate(s.Trim(), UriKind.Absolute, out var u) && u.Scheme is "http" or "https"
            ? s.Trim().TrimEnd('/') : null;

    private static IResult NotConfigured() =>
        Results.Problem(title: "SEO pages are not configured", detail: "SITE_URL is not set.", statusCode: StatusCodes.Status503ServiceUnavailable);

    // ------------------------------------------------------------------ product page
    private static async Task<IResult> Product(string slug, SeoService seo, IConfiguration config, IHttpClientFactory http,
        IMemoryCache cache, HttpResponse res, CancellationToken ct)
    {
        if (SiteUrl(config) is not { } site) return NotConfigured();
        var store = config["STORE_NAME"] is { Length: > 0 } n ? n : "The Gear Doctor";

        var p = await seo.ProductAsync(slug, ct);
        if (p is null)
        {
            res.CachePublic(60);
            return Html(StatusCodes.Status404NotFound, NotFoundPage(store));
        }

        var template = await cache.GetOrCreateAsync("seo:product-template", async e =>
        {
            e.AbsoluteExpirationRelativeToNow = TemplateTtl;
            try
            {
                using var r = await http.CreateClient(TemplateClient).GetAsync($"{site}/product.html", ct);
                return r.IsSuccessStatusCode ? await r.Content.ReadAsStringAsync(ct) : null;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException) { return null; }
        });
        if (string.IsNullOrEmpty(template))
        {
            cache.Remove("seo:product-template");   // don't cache a failure
            res.Headers.CacheControl = "no-store";
            return Results.Redirect($"/product.html?slug={Uri.EscapeDataString(slug)}");   // 302: the client-rendered page still works
        }

        res.CachePublic(300);
        return Html(StatusCodes.Status200OK, Render(template, p, site, store));
    }

    internal static string Render(string template, SeoProduct p, string site, string store)
    {
        var url = $"{site}/products/{Uri.EscapeDataString(p.Slug)}";
        var title = $"{p.Title} | {store}";
        var desc = Describe(p.Description, 155);
        var images = p.ImageUrls.Select(i => Absolute(i, site)).ToList();
        var image = images.FirstOrDefault();

        var head = new StringBuilder();
        head.Append($"<title>{Enc(title)}</title>\n");
        head.Append(MetaName("description", desc));
        head.Append($"<link rel=\"canonical\" href=\"{Enc(url)}\">\n");
        head.Append(MetaProp("og:type", "product"));
        head.Append(MetaProp("og:title", p.Title));
        head.Append(MetaProp("og:description", desc));
        if (image is not null) { head.Append(MetaProp("og:image", image)); head.Append(MetaName("twitter:image", image)); }
        head.Append(MetaProp("og:url", url));
        head.Append(MetaName("twitter:card", "summary_large_image"));
        head.Append(MetaProp("product:price:amount", p.Price.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        head.Append(MetaProp("product:price:currency", "PKR"));
        head.Append("<script type=\"application/ld+json\" data-seo=\"\">").Append(JsonLd(p, images, desc, url)).Append("</script>\n");

        var html = template;
        // Remove what we are about to set (title, canonical, <base>, our meta tags and any earlier JSON-LD) so nothing is duplicated.
        html = TitleTag().Replace(html, "");
        html = CanonicalTag().Replace(html, "");
        html = BaseTag().Replace(html, "");
        html = LdJsonTag().Replace(html, "");
        foreach (var name in new[] { "description", "twitter:card" }) html = MetaTag(name).Replace(html, "");
        foreach (var prop in new[] { "og:type", "og:title", "og:description", "og:image", "og:url", "product:price:amount", "product:price:currency" })
            html = MetaTag(prop).Replace(html, "");
        if (image is not null) { /* og:image:width/height of the generic default no longer describe this image */
            html = MetaTag("og:image:width").Replace(html, "");
            html = MetaTag("og:image:height").Replace(html, "");
            html = MetaTag("twitter:image").Replace(html, "");
        }

        // <base> must come first so every relative asset URL resolves from the site root (the page is served at /products/{slug}).
        var open = HeadOpen().Match(html);
        if (!open.Success) return html;   // not a page we can safely edit
        html = html.Insert(open.Index + open.Length, "\n<base href=\"/\">");
        var close = html.LastIndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        return close < 0 ? html : html.Insert(close, head.ToString());
    }

    private static string MetaName(string name, string content) => $"<meta name=\"{name}\" content=\"{Enc(content)}\">\n";
    private static string MetaProp(string prop, string content) => $"<meta property=\"{prop}\" content=\"{Enc(content)}\">\n";
    private static string Enc(string s) => WebUtility.HtmlEncode(s);

    private static string Absolute(string u, string site) =>
        Uri.TryCreate(u, UriKind.Absolute, out _) ? u : $"{site}/{u.TrimStart('/')}";

    /// <summary>Plain-text description: markdown-lite stripped, whitespace collapsed, cut at a word boundary.</summary>
    internal static string Describe(string text, int max)
    {
        var t = Whitespace().Replace(MarkdownChars().Replace(text ?? "", " "), " ").Trim();
        if (t.Length <= max) return t;
        var cut = t[..max];
        var sp = cut.LastIndexOf(' ');
        return (sp > max / 2 ? cut[..sp] : cut).TrimEnd(' ', ',', '.', ';', ':') + "…";
    }

    private static string JsonLd(SeoProduct p, List<string> images, string desc, string url)
    {
        var ld = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Product",
            ["name"] = p.Title,
            ["image"] = images,
            ["description"] = desc,
            ["sku"] = p.Sku,
            ["brand"] = new Dictionary<string, object?> { ["@type"] = "Brand", ["name"] = p.Brand },
            ["offers"] = new Dictionary<string, object?>
            {
                ["@type"] = "Offer",
                ["price"] = p.Price,
                ["priceCurrency"] = "PKR",
                ["availability"] = p.InStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                ["url"] = url,
            },
        };
        // Relaxed escaping leaves '<' alone, so escape it ourselves: "</script>" can never appear inside the block.
        return JsonSerializer.Serialize(ld, LdJson).Replace("<", "\\u003C");
    }

    private static IResult Html(int status, string html) => Results.Content(html, "text/html; charset=utf-8", Encoding.UTF8, status);

    private static string NotFoundPage(string store) =>
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
        $"<meta name=\"robots\" content=\"noindex\"><title>Product not found | {Enc(store)}</title></head>" +
        "<body style=\"font-family:system-ui,sans-serif;background:#0a0a0c;color:#eee;padding:3rem 1.5rem;text-align:center\">" +
        "<h1>We couldn't find that product</h1><p>It may have been removed or isn't available any more.</p>" +
        "<p><a href=\"/shop.html\" style=\"color:#fff\">Browse the shop</a></p></body></html>";

    // ------------------------------------------------------------------ sitemap
    private static async Task<IResult> Sitemap(SeoService seo, IConfiguration config, HttpResponse res, CancellationToken ct)
    {
        if (SiteUrl(config) is not { } site) return NotConfigured();
        var products = await seo.ProductUrlsAsync(ct);
        var guides = await seo.GuideUrlsAsync(ct);

        var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        void Url(string loc, DateTimeOffset? last) =>
            sb.Append("  <url><loc>").Append(Enc(loc)).Append("</loc>")
              .Append(last is { } l ? $"<lastmod>{l.UtcDateTime:yyyy-MM-dd}</lastmod>" : "").Append("</url>\n");
        foreach (var page in StaticPages) Url(site + page, null);
        foreach (var p in products) Url($"{site}/products/{Uri.EscapeDataString(p.Slug)}", p.UpdatedAt);
        foreach (var g in guides) Url($"{site}/guide.html?id={Uri.EscapeDataString(g.Slug)}", g.UpdatedAt);
        sb.Append("</urlset>\n");

        res.CachePublic(300);
        return Results.Content(sb.ToString(), "application/xml; charset=utf-8", Encoding.UTF8);

    }

    // ------------------------------------------------------------------ html editing helpers
    [GeneratedRegex(@"<title\b[^>]*>.*?</title\s*>", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex TitleTag();
    [GeneratedRegex(@"<link\b[^>]*\brel\s*=\s*[""']?canonical[""']?[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex CanonicalTag();
    [GeneratedRegex(@"<base\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex BaseTag();
    [GeneratedRegex(@"<script\b[^>]*type\s*=\s*[""']application/ld\+json[""'][^>]*>.*?</script\s*>", RegexOptions.IgnoreCase | RegexOptions.Singleline)] private static partial Regex LdJsonTag();
    [GeneratedRegex(@"<head\b[^>]*>", RegexOptions.IgnoreCase)] private static partial Regex HeadOpen();
    [GeneratedRegex(@"[*_#>`\[\]]+")] private static partial Regex MarkdownChars();
    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
    private static Regex MetaTag(string key) => new(
        @"<meta\b[^>]*\b(?:name|property)\s*=\s*[""']" + Regex.Escape(key) + @"[""'][^>]*>\s*", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
}
