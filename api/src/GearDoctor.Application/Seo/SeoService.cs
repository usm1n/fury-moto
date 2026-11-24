using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Seo;

public sealed record SeoProduct(string Slug, string Title, string Description, string Brand, IReadOnlyList<string> ImageUrls,
    int Price, bool InStock, string? Sku);
public sealed record SeoUrl(string Slug, DateTimeOffset UpdatedAt);

/// <summary>Read models for the SEO endpoints (server-rendered product page head + sitemap). Published products only.</summary>
public sealed class SeoService(IAppDbContext db, IFileStorage files)
{
    public async Task<SeoProduct?> ProductAsync(string slug, CancellationToken ct)
    {
        var p = await db.Products.AsNoTracking()
            .Where(x => x.Slug == slug && x.Status == ProductStatus.Published && x.Category.IsActive && x.Brand.IsActive)
            .Select(x => new { x.Id, x.Slug, x.Title, x.Description, x.ShortDescription, Brand = x.Brand.Name, x.Price })
            .FirstOrDefaultAsync(ct);
        if (p is null) return null;
        var images = await db.ProductImages.AsNoTracking().Where(i => i.ProductId == p.Id)
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Id).Select(i => i.StorageKey).ToListAsync(ct);
        var variants = await db.ProductVariants.AsNoTracking().Where(v => v.ProductId == p.Id && v.IsActive)
            .OrderBy(v => v.Id).Select(v => new { v.Sku, v.Stock }).ToListAsync(ct);
        return new SeoProduct(p.Slug, p.Title, string.IsNullOrWhiteSpace(p.Description) ? p.ShortDescription : p.Description, p.Brand,
            images.Select(files.GetPublicUrl).ToList(), p.Price, variants.Any(v => v.Stock > 0), variants.FirstOrDefault()?.Sku);
    }

    public Task<List<SeoUrl>> ProductUrlsAsync(CancellationToken ct) => db.Products.AsNoTracking()
        .Where(p => p.Status == ProductStatus.Published && p.Category.IsActive && p.Brand.IsActive)
        .OrderBy(p => p.SortOrder).ThenBy(p => p.Id).Select(p => new SeoUrl(p.Slug, p.UpdatedAt)).ToListAsync(ct);

    public Task<List<SeoUrl>> GuideUrlsAsync(CancellationToken ct) => db.Guides.AsNoTracking()
        .Where(g => g.IsPublished).OrderBy(g => g.SortOrder).ThenBy(g => g.Id).Select(g => new SeoUrl(g.Slug, g.UpdatedAt)).ToListAsync(ct);
}
