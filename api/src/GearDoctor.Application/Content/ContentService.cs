using GearDoctor.Application.Catalog;
using GearDoctor.Application.Common;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Content;

/// <summary>Public (storefront) reads of guides, FAQs and testimonials: published only, sortOrder asc.</summary>
public sealed class ContentService(IAppDbContext db, IFileStorage files, CatalogService catalog)
{
    private string? Url(string? key) => string.IsNullOrEmpty(key) ? null : files.GetPublicUrl(key);

    public async Task<List<GuideSummaryDto>> GuidesAsync(CancellationToken ct)
    {
        var rows = await db.Guides.AsNoTracking().Where(g => g.IsPublished)
            .OrderBy(g => g.SortOrder).ThenBy(g => g.Id)
            .Select(g => new { g.Slug, g.Title, g.Type, g.Excerpt, g.CoverKey, g.Video, g.Source, g.UpdatedAt })
            .ToListAsync(ct);
        return rows.Select(g => new GuideSummaryDto(g.Slug, g.Title, g.Type, g.Excerpt, Url(g.CoverKey), g.Video, g.Source, g.UpdatedAt)).ToList();
    }

    public async Task<Result<GuideDto>> GuideAsync(string slug, CancellationToken ct)
    {
        var g = await db.Guides.AsNoTracking().Where(x => x.IsPublished && x.Slug == slug)
            .Select(x => new { x.Slug, x.Title, x.Type, x.Excerpt, x.CoverKey, x.Video, x.Source, x.UpdatedAt, x.Body, x.RelatedProductIds })
            .FirstOrDefaultAsync(ct);
        if (g is null) return Error.NotFound("Guide");
        var related = await catalog.CardsByIdsAsync(g.RelatedProductIds, ct);
        return new GuideDto(g.Slug, g.Title, g.Type, g.Excerpt, Url(g.CoverKey), g.Video, g.Source, g.UpdatedAt, g.Body, related);
    }

    public Task<List<FaqDto>> FaqsAsync(CancellationToken ct) => db.Faqs.AsNoTracking().Where(f => f.IsPublished)
        .OrderBy(f => f.SortOrder).ThenBy(f => f.Id).Select(f => new FaqDto(f.Q, f.A)).ToListAsync(ct);

    public Task<List<TestimonialDto>> TestimonialsAsync(CancellationToken ct) => db.Testimonials.AsNoTracking().Where(t => t.IsPublished)
        .OrderBy(t => t.SortOrder).ThenBy(t => t.Id).Select(t => new TestimonialDto(t.Name, t.Bike, t.Quote, t.Rating)).ToListAsync(ct);
}
