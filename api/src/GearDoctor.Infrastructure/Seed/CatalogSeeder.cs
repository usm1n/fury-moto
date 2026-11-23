using System.Text.Json;
using System.Text.RegularExpressions;
using GearDoctor.Domain;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GearDoctor.Infrastructure.Seed;

/// <summary>
/// Imports categories, brands and products from seed/catalog.json (exported from the
/// storefront's old site.config.js by tools/export-seed.mjs). Idempotent: does nothing when
/// the Products table already has rows (soft-deleted included). Products, variants, images and
/// certification links are written in a single SaveChanges (one transaction).
/// </summary>
public static class CatalogSeeder
{
    private sealed record CatalogFile(List<CatCategory> Categories, List<CatBrand> Brands, List<CatProduct> Products);
    private sealed record CatCategory(string Name, string Slug, int SortOrder, string? ImageKey);
    private sealed record CatBrand(string Name, string Slug, int SortOrder);
    private sealed record CatProduct(
        string Slug, string Title, string BrandSlug, string CategorySlug,
        string ShortDescription, string Description, string GearDoctorNote,
        List<CatSpec> Specs, int Price, int? CompareAtPrice, List<string> Badges,
        List<string> CertificationCodes, bool IsFeatured, int SortOrder,
        List<CatImage> Images, List<CatVariant> Variants);
    private sealed record CatSpec(string Label, string Value);
    private sealed record CatImage(string Key, string ThumbKey, string Alt);
    private sealed record CatVariant(string Size, string Color, string? ColorHex, int Stock);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static async Task ImportAsync(AppDbContext db, string path, ILogger log)
    {
        if (await db.Products.IgnoreQueryFilters().AnyAsync())
        {
            log.LogInformation("Catalog: products already exist; skipping import");
            return;
        }

        var json = await File.ReadAllTextAsync(path);
        var file = JsonSerializer.Deserialize<CatalogFile>(json, JsonOptions)
            ?? throw new InvalidOperationException($"Catalog file {path} is empty or invalid");

        // Categories and brands: upsert by slug.
        var categories = await db.Categories.ToDictionaryAsync(c => c.Slug);
        foreach (var c in file.Categories)
        {
            if (!categories.TryGetValue(c.Slug, out var cat))
            {
                cat = new Category { Name = c.Name, Slug = c.Slug };
                db.Categories.Add(cat);
                categories[c.Slug] = cat;
            }
            cat.Name = c.Name;
            cat.SortOrder = c.SortOrder;
            cat.ImageKey = c.ImageKey;
        }

        var brands = await db.Brands.ToDictionaryAsync(b => b.Slug);
        foreach (var b in file.Brands)
        {
            if (!brands.TryGetValue(b.Slug, out var brand))
            {
                brand = new Brand { Name = b.Name, Slug = b.Slug };
                db.Brands.Add(brand);
                brands[b.Slug] = brand;
            }
            brand.Name = b.Name;
            brand.SortOrder = b.SortOrder;
        }
        await db.SaveChangesAsync();

        var certs = await db.Certifications.ToDictionaryAsync(c => c.Code);
        var now = DateTimeOffset.UtcNow;
        var usedSkus = new HashSet<string>(StringComparer.Ordinal);
        var totalVariants = 0;
        var totalImages = 0;

        foreach (var p in file.Products)
        {
            if (!brands.TryGetValue(p.BrandSlug, out var brand))
                throw new InvalidOperationException($"Catalog product '{p.Slug}': unknown brand '{p.BrandSlug}'");
            if (!categories.TryGetValue(p.CategorySlug, out var category))
                throw new InvalidOperationException($"Catalog product '{p.Slug}': unknown category '{p.CategorySlug}'");

            var product = new Product
            {
                Title = p.Title,
                Slug = p.Slug,
                Brand = brand,
                Category = category,
                ShortDescription = p.ShortDescription,
                Description = p.Description,
                GearDoctorNote = p.GearDoctorNote,
                Specs = p.Specs.Select(s => new Spec(s.Label, s.Value)).ToList(),
                Price = p.Price,
                CompareAtPrice = p.CompareAtPrice,
                Badges = [.. p.Badges],
                Status = ProductStatus.Published,
                IsFeatured = p.IsFeatured,
                SortOrder = p.SortOrder,
                CreatedAt = now,
                UpdatedAt = now,
            };

            foreach (var code in p.CertificationCodes)
            {
                if (!certs.TryGetValue(code, out var cert))
                    throw new InvalidOperationException($"Catalog product '{p.Slug}': unknown certification code '{code}'");
                product.Certifications.Add(cert);
            }

            for (var i = 0; i < p.Images.Count; i++)
            {
                var img = p.Images[i];
                var (width, height) = img.Key.Contains("-4x5", StringComparison.Ordinal) ? (1000, 1250) : (1000, 1000);
                product.Images.Add(new ProductImage
                {
                    StorageKey = img.Key,
                    ThumbKey = img.ThumbKey,
                    Width = width,
                    Height = height,
                    Alt = img.Alt,
                    SortOrder = i,
                });
            }
            totalImages += p.Images.Count;

            foreach (var v in p.Variants)
            {
                product.Variants.Add(new ProductVariant
                {
                    Size = v.Size,
                    Color = v.Color,
                    ColorHex = v.ColorHex,
                    Sku = MakeSku(brand.Slug, p.Slug, v.Size, v.Color, usedSkus),
                    Stock = v.Stock,
                    IsActive = true,
                });
            }
            totalVariants += p.Variants.Count;

            db.Products.Add(product);
        }

        // One SaveChanges for all products: EF wraps it in a single transaction, so a failure
        // leaves no products behind and the next run retries the whole import.
        await db.SaveChangesAsync();
        foreach (var p in file.Products)
            log.LogInformation("Catalog: imported {Slug} ({Variants} variants, {Images} images)", p.Slug, p.Variants.Count, p.Images.Count);
        log.LogInformation(
            "Catalog import complete: {Categories} categories, {Brands} brands, {Products} products, {Variants} variants, {Images} images",
            categories.Count, brands.Count, file.Products.Count, totalVariants, totalImages);
    }

    /// <summary>SKU = UPPER(brand-product-size-color), non-alphanumerics collapsed to '-', max 64 chars, unique.</summary>
    private static string MakeSku(string brandSlug, string productSlug, string size, string color, ISet<string> used)
    {
        var raw = $"{brandSlug}-{productSlug}-{size}-{color}".ToUpperInvariant();
        var baseSku = Regex.Replace(raw, "[^A-Z0-9]+", "-").Trim('-');
        if (baseSku.Length > 64) baseSku = baseSku[..64].TrimEnd('-');

        var sku = baseSku;
        for (var n = 2; !used.Add(sku); n++)
        {
            var suffix = $"-{n}";
            sku = baseSku[..Math.Min(baseSku.Length, 64 - suffix.Length)] + suffix;
        }
        return sku;
    }
}
