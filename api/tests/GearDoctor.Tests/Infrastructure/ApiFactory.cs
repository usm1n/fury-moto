using GearDoctor.Domain;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Tests.Infrastructure;

/// <summary>
/// Shared test host: WebApplicationFactory over the real app + a real Postgres
/// (TEST_DATABASE_URL, default local geardoctor_test). Migrations run once per run.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string LocalDefault = "Host=localhost;Database=geardoctor_test;Username=geardoctor;Password=geardoctor_dev";
    public static string ConnectionString => Environment.GetEnvironmentVariable("TEST_DATABASE_URL") is { Length: > 0 } s ? s : LocalDefault;

    static ApiFactory()
    {
        Environment.SetEnvironmentVariable("NEON_DATABASE_URL", ConnectionString);
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable("SITE_URL", "https://shop.example.test");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        // Order flows need Turnstile to pass. Unless TEST_REAL_TURNSTILE=1, swap in a local stub that
        // accepts only StubTurnstileVerifier.PassingToken (no network). The real verifier is exercised
        // directly in Orders/TurnstileNetworkTests.cs.
        // SEO pages fetch {SITE_URL}/product.html; tests answer from SeoStub instead of the network.
        builder.ConfigureTestServices(s => s.AddHttpClient(GearDoctor.Api.Endpoints.SeoEndpoints.TemplateClient)
            .ConfigurePrimaryHttpMessageHandler(() => new SeoStub.Handler()));
        if (Environment.GetEnvironmentVariable("TEST_REAL_TURNSTILE") != "1")
            builder.ConfigureTestServices(s =>
            {
                s.RemoveAll<GearDoctor.Application.Common.ITurnstileVerifier>();
                s.AddSingleton<GearDoctor.Application.Common.ITurnstileVerifier, StubTurnstileVerifier>();
            });
    }

    public async Task InitializeAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync() => await base.DisposeAsync();

    public async Task<T> WithDb<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task WithDb(Func<AppDbContext, Task> action) => WithDb<int>(async db => { await action(db); return 0; });

    /// <summary>Wipes catalog + order data (identity/data-protection tables are kept).</summary>
    public Task ResetAsync() => WithDb(db => db.Database.ExecuteSqlRawAsync(
        "TRUNCATE TABLE \"OrderStatusEvents\", \"OrderItems\", \"Orders\", \"ProductCertification\", \"ProductImages\", " +
        "\"ProductVariants\", \"Products\", \"Certifications\", \"Brands\", \"Categories\", \"Settings\", " +
        "\"Guides\", \"Faqs\", \"Testimonials\", \"AuditEntries\" RESTART IDENTITY CASCADE; " +
        "ALTER SEQUENCE order_number_seq RESTART WITH 1001;"));

    // ------------------------------------------------------------------ builders
    public Task<Category> AddCategory(string name, int sortOrder = 0, bool active = true) => WithDb(async db =>
    {
        var c = new Category { Name = name, Slug = Slugs.From(name), SortOrder = sortOrder, IsActive = active };
        db.Categories.Add(c); await db.SaveChangesAsync(); return c;
    });

    public Task<Brand> AddBrand(string name, int sortOrder = 0, bool active = true) => WithDb(async db =>
    {
        var b = new Brand { Name = name, Slug = Slugs.From(name), SortOrder = sortOrder, IsActive = active };
        db.Brands.Add(b); await db.SaveChangesAsync(); return b;
    });

    public Task<Certification> AddCert(string code, string name) => WithDb(async db =>
    {
        var c = new Certification { Code = code, Name = name, Description = name + " standard" };
        db.Certifications.Add(c); await db.SaveChangesAsync(); return c;
    });

    public Task SetSetting(string key, string jsonValue) => WithDb(async db =>
    {
        db.Settings.Add(new Setting { Key = key, Value = jsonValue, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
    });

    /// <summary>Insert a product with variants (size, color, stock, priceOverride?) and N images.</summary>
    public Task<Product> AddProduct(ProductSpec s) => WithDb(async db =>
    {
        var p = new Product
        {
            Title = s.Title, Slug = s.Slug ?? Slugs.From(s.Title), BrandId = s.BrandId, CategoryId = s.CategoryId,
            ShortDescription = "short", Description = "long", GearDoctorNote = "note",
            Specs = [new Spec("Shell", "Carbon")], Price = s.Price, CompareAtPrice = s.CompareAtPrice, Badges = s.Badges?.ToList() ?? [],
            Status = s.Status, IsFeatured = s.Featured, SortOrder = s.SortOrder,
            CreatedAt = s.CreatedAt ?? DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            DeletedAt = s.Deleted ? DateTimeOffset.UtcNow : null,
        };
        var i = 0;
        foreach (var v in s.Variants ?? [new VariantSpec("M", "Black", 5)])
            p.Variants.Add(new ProductVariant
            {
                Size = v.Size, Color = v.Color, ColorHex = "#000000", Sku = $"{p.Slug}-{v.Size}-{v.Color}".ToUpperInvariant(),
                Stock = v.Stock, PriceOverride = v.PriceOverride, IsActive = v.Active,
            });
        for (i = 0; i < s.Images; i++)
            p.Images.Add(new ProductImage { StorageKey = $"products/{p.Slug}/{i}.webp", ThumbKey = $"products/{p.Slug}/{i}-t.webp", Width = 800, Height = 600, Alt = $"img {i}", SortOrder = i });
        if (s.CertIds is { Length: > 0 })
            p.Certifications.AddRange(await db.Certifications.Where(c => s.CertIds.Contains(c.Id)).ToListAsync());
        db.Products.Add(p);
        await db.SaveChangesAsync();
        return p;
    });
}

public sealed record VariantSpec(string Size, string Color, int Stock, int? PriceOverride = null, bool Active = true);

public sealed record ProductSpec(string Title, int BrandId, int CategoryId, int Price = 10000)
{
    public string? Slug { get; init; }
    public int? CompareAtPrice { get; init; }
    public string[]? Badges { get; init; }
    public ProductStatus Status { get; init; } = ProductStatus.Published;
    public bool Featured { get; init; }
    public int SortOrder { get; init; }
    public DateTimeOffset? CreatedAt { get; init; }
    public bool Deleted { get; init; }
    public VariantSpec[]? Variants { get; init; }
    public int Images { get; init; } = 3;
    public int[]? CertIds { get; init; }
}

/// <summary>Test double for Turnstile: accepts exactly one token, never touches the network.</summary>
public sealed class StubTurnstileVerifier : GearDoctor.Application.Common.ITurnstileVerifier
{
    public const string PassingToken = "test-pass";
    public string SiteKey => "1x00000000000000000000AA";
    public Task<bool> VerifyAsync(string token, string? remoteIp, CancellationToken ct = default) =>
        Task.FromResult(token == PassingToken);
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "Api";
}
