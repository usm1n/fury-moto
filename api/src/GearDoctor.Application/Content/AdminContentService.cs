using FluentValidation;
using GearDoctor.Application.Admin;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Content;

/// <summary>Admin CRUD + reorder for guides, FAQs and testimonials. Every mutation records an audit entry.</summary>
public sealed class AdminContentService(IAppDbContext db, IFileStorage files, IClock clock, IAuditLog audit,
    IValidator<GuideUpsert> guideVal, IValidator<FaqUpsert> faqVal, IValidator<TestimonialUpsert> testimonialVal)
{
    private string? Url(string? key) => string.IsNullOrEmpty(key) ? null : files.GetPublicUrl(key);
    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // ================================================================ guides
    /// <summary>Maps guides in one go; related product refs (saved order, any status) come from a single query.</summary>
    private async Task<List<AdminGuideDto>> MapAsync(IReadOnlyList<Guide> guides, CancellationToken ct)
    {
        var ids = guides.SelectMany(g => g.RelatedProductIds).Distinct().ToArray();
        var info = ids.Length == 0 ? [] : (await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id))
            .Select(p => new { p.Id, p.Title, Thumb = p.Images.OrderBy(i => i.SortOrder).Select(i => i.ThumbKey).FirstOrDefault() })
            .ToListAsync(ct)).ToDictionary(p => p.Id);
        return guides.Select(g => new AdminGuideDto(g.Id, g.Slug, g.Title, g.Type, g.Excerpt, g.Body, g.CoverKey, Url(g.CoverKey),
            g.Video, g.Source, g.RelatedProductIds, g.IsPublished, g.SortOrder, g.UpdatedAt, g.Version.ToString(),
            g.RelatedProductIds.Where(info.ContainsKey).Select(i => new RelatedProductRef(i, info[i].Title, Url(info[i].Thumb))).ToList())).ToList();
    }

    private async Task<AdminGuideDto> MapAsync(Guide g, CancellationToken ct) => (await MapAsync([g], ct))[0];

    public async Task<List<AdminGuideDto>> ListGuidesAsync(CancellationToken ct) =>
        await MapAsync(await db.Guides.AsNoTracking().OrderBy(g => g.SortOrder).ThenBy(g => g.Id).ToListAsync(ct), ct);

    public async Task<Result<AdminGuideDto>> GetGuideAsync(int id, CancellationToken ct) =>
        await db.Guides.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id, ct) is { } g ? await MapAsync(g, ct) : Error.NotFound("Guide");

    public async Task<Result<AdminGuideDto>> CreateGuideAsync(GuideUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(guideVal, req, ct) is { } bad) return bad;
        var related = (req.RelatedProductIds ?? []).Distinct().ToArray();
        if (await CheckRelatedAsync(related, ct) is { } rel) return rel;
        var now = clock.Now;
        var next = await db.Guides.Select(g => (int?)g.SortOrder).MaxAsync(ct) ?? -1;
        var g = new Guide
        {
            Slug = await UniqueGuideSlugAsync(req.Slug, req.Title, null, ct), Title = req.Title.Trim(), Type = req.Type,
            Excerpt = req.Excerpt.Trim(), Body = req.Body, CoverKey = Blank(req.CoverKey), Video = Blank(req.Video), Source = Blank(req.Source),
            RelatedProductIds = related, IsPublished = req.IsPublished ?? false, SortOrder = next + 1, CreatedAt = now, UpdatedAt = now,
        };
        db.Guides.Add(g);
        await db.SaveChangesAsync(ct);
        audit.Record("guide.create", "Guide", g.Id.ToString(), $"Created guide \"{g.Title}\" ({(g.IsPublished ? "published" : "draft")})");
        await db.SaveChangesAsync(ct);
        return await MapAsync(g, ct);
    }

    public async Task<Result<AdminGuideDto>> UpdateGuideAsync(int id, GuideUpsert req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Version)) return Error.Validation("version", "Version is required when updating.");
        if (!uint.TryParse(req.Version, out var version)) return Error.Validation("version", "Version is not valid.");
        if (await AdminValidation.CheckAsync(guideVal, req, ct) is { } bad) return bad;
        var related = (req.RelatedProductIds ?? []).Distinct().ToArray();
        if (await CheckRelatedAsync(related, ct) is { } rel) return rel;
        var g = await db.Guides.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null) return Error.NotFound("Guide");
        if (g.Version != version) return AdminValidation.Stale("Guide");

        var old = (g.Title, g.Slug, g.Type, g.Excerpt, g.Body, g.CoverKey, g.Video, g.Source, Related: string.Join(",", g.RelatedProductIds), g.IsPublished);
        g.Title = req.Title.Trim();
        if (!string.IsNullOrWhiteSpace(req.Slug) && Slugs.From(req.Slug) != g.Slug)
            g.Slug = await UniqueGuideSlugAsync(req.Slug, req.Title, id, ct);
        g.Type = req.Type;
        g.Excerpt = req.Excerpt.Trim();
        g.Body = req.Body;
        if (req.CoverKey is not null) g.CoverKey = Blank(req.CoverKey);   // null = unchanged, "" = clear
        if (req.Video is not null) g.Video = Blank(req.Video);     // null = unchanged, "" = clear
        if (req.Source is not null) g.Source = Blank(req.Source);
        g.RelatedProductIds = related;
        if (req.IsPublished is { } pub) g.IsPublished = pub;
        g.UpdatedAt = clock.Now;

        var diff = new AuditDiff().Text("title", old.Title, g.Title).Text("slug", old.Slug, g.Slug).Text("type", old.Type, g.Type)
            .Changed("excerpt", old.Excerpt != g.Excerpt).Changed("body", old.Body != g.Body).Changed("cover", old.CoverKey != g.CoverKey)
            .Changed("video", old.Video != g.Video).Changed("source", old.Source != g.Source)
            .Changed("related products", old.Related != string.Join(",", g.RelatedProductIds));
        if (old.IsPublished != g.IsPublished) diff.Add($"status {(old.IsPublished ? "Published" : "Draft")} → {(g.IsPublished ? "Published" : "Draft")}");
        audit.Record("guide.update", "Guide", id.ToString(), diff.Any ? $"\"{g.Title}\": {diff}" : $"\"{g.Title}\": saved with no field changes");

        ((DbContext)db).Entry(g).Property(x => x.Version).OriginalValue = version;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AdminValidation.Stale("Guide"); }
        return await MapAsync(g, ct);
    }

    public async Task<Result> DeleteGuideAsync(int id, CancellationToken ct)
    {
        var g = await db.Guides.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null) return Error.NotFound("Guide");
        db.Guides.Remove(g);
        audit.Record("guide.delete", "Guide", id.ToString(), $"Deleted guide \"{g.Title}\"");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result> ReorderGuidesAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Guides.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        audit.Record("guide.reorder", "Guide", null, $"Reordered {rows.Count} guides");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    private async Task<Error?> CheckRelatedAsync(int[] ids, CancellationToken ct)
    {
        if (ids.Length == 0) return null;
        return await db.Products.CountAsync(p => ids.Contains(p.Id), ct) == ids.Length ? null
            : Error.Validation("relatedProductIds", "One or more related products do not exist.");
    }

    private async Task<string> UniqueGuideSlugAsync(string? slug, string title, int? selfId, CancellationToken ct)
    {
        var baseSlug = Slugs.From(string.IsNullOrWhiteSpace(slug) ? title : slug);
        if (baseSlug.Length == 0) baseSlug = "guide";
        if (baseSlug.Length > 150) baseSlug = baseSlug[..150].Trim('-');
        var taken = (await db.Guides.Where(g => g.Id != selfId && g.Slug.StartsWith(baseSlug)).Select(g => g.Slug).ToListAsync(ct)).ToHashSet();
        var candidate = baseSlug;
        for (var n = 2; taken.Contains(candidate); n++) candidate = $"{baseSlug}-{n}";
        return candidate;
    }

    // ================================================================ faqs
    private static AdminFaqDto Map(Faq f) => new(f.Id, f.Q, f.A, f.IsPublished, f.SortOrder);

    public async Task<List<AdminFaqDto>> ListFaqsAsync(CancellationToken ct) =>
        (await db.Faqs.AsNoTracking().OrderBy(f => f.SortOrder).ThenBy(f => f.Id).ToListAsync(ct)).Select(Map).ToList();

    public async Task<Result<AdminFaqDto>> GetFaqAsync(int id, CancellationToken ct) =>
        await db.Faqs.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id, ct) is { } f ? Map(f) : Error.NotFound("FAQ");

    public async Task<Result<AdminFaqDto>> CreateFaqAsync(FaqUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(faqVal, req, ct) is { } bad) return bad;
        var next = await db.Faqs.Select(f => (int?)f.SortOrder).MaxAsync(ct) ?? -1;
        var f = new Faq { Q = req.Q.Trim(), A = req.A.Trim(), IsPublished = req.IsPublished ?? true, SortOrder = next + 1 };
        db.Faqs.Add(f);
        await db.SaveChangesAsync(ct);
        audit.Record("faq.create", "Faq", f.Id.ToString(), $"Created FAQ \"{Short(f.Q)}\"");
        await db.SaveChangesAsync(ct);
        return Map(f);
    }

    public async Task<Result<AdminFaqDto>> UpdateFaqAsync(int id, FaqUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(faqVal, req, ct) is { } bad) return bad;
        var f = await db.Faqs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (f is null) return Error.NotFound("FAQ");
        var (oq, oa, op) = (f.Q, f.A, f.IsPublished);
        f.Q = req.Q.Trim(); f.A = req.A.Trim();
        if (req.IsPublished is { } pub) f.IsPublished = pub;
        var diff = new AuditDiff().Changed("question", oq != f.Q).Changed("answer", oa != f.A).Flag("published", op, f.IsPublished);
        audit.Record("faq.update", "Faq", id.ToString(), $"\"{Short(f.Q)}\": " + (diff.Any ? diff.ToString() : "saved with no field changes"));
        await db.SaveChangesAsync(ct);
        return Map(f);
    }

    public async Task<Result> DeleteFaqAsync(int id, CancellationToken ct)
    {
        var f = await db.Faqs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (f is null) return Error.NotFound("FAQ");
        db.Faqs.Remove(f);
        audit.Record("faq.delete", "Faq", id.ToString(), $"Deleted FAQ \"{Short(f.Q)}\"");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result> ReorderFaqsAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Faqs.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        audit.Record("faq.reorder", "Faq", null, $"Reordered {rows.Count} FAQs");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    // ================================================================ testimonials
    private static AdminTestimonialDto Map(Testimonial t) => new(t.Id, t.Name, t.Bike, t.Quote, t.Rating, t.IsPublished, t.SortOrder);

    public async Task<List<AdminTestimonialDto>> ListTestimonialsAsync(CancellationToken ct) =>
        (await db.Testimonials.AsNoTracking().OrderBy(t => t.SortOrder).ThenBy(t => t.Id).ToListAsync(ct)).Select(Map).ToList();

    public async Task<Result<AdminTestimonialDto>> GetTestimonialAsync(int id, CancellationToken ct) =>
        await db.Testimonials.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct) is { } t ? Map(t) : Error.NotFound("Testimonial");

    public async Task<Result<AdminTestimonialDto>> CreateTestimonialAsync(TestimonialUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(testimonialVal, req, ct) is { } bad) return bad;
        var next = await db.Testimonials.Select(t => (int?)t.SortOrder).MaxAsync(ct) ?? -1;
        var t = new Testimonial
        {
            Name = req.Name.Trim(), Bike = Blank(req.Bike), Quote = req.Quote.Trim(), Rating = req.Rating,
            IsPublished = req.IsPublished ?? true, SortOrder = next + 1,
        };
        db.Testimonials.Add(t);
        await db.SaveChangesAsync(ct);
        audit.Record("testimonial.create", "Testimonial", t.Id.ToString(), $"Created testimonial from {t.Name} ({t.Rating}/5)");
        await db.SaveChangesAsync(ct);
        return Map(t);
    }

    public async Task<Result<AdminTestimonialDto>> UpdateTestimonialAsync(int id, TestimonialUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(testimonialVal, req, ct) is { } bad) return bad;
        var t = await db.Testimonials.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Error.NotFound("Testimonial");
        var (oName, oBike, oQuote, oRating, oPub) = (t.Name, t.Bike, t.Quote, t.Rating, t.IsPublished);
        t.Name = req.Name.Trim(); t.Bike = Blank(req.Bike); t.Quote = req.Quote.Trim(); t.Rating = req.Rating;
        if (req.IsPublished is { } pub) t.IsPublished = pub;
        var diff = new AuditDiff().Text("name", oName, t.Name).Text("bike", oBike, t.Bike).Changed("quote", oQuote != t.Quote)
            .Text("rating", oRating.ToString(), t.Rating.ToString()).Flag("published", oPub, t.IsPublished);
        audit.Record("testimonial.update", "Testimonial", id.ToString(), $"{t.Name}: " + (diff.Any ? diff.ToString() : "saved with no field changes"));
        await db.SaveChangesAsync(ct);
        return Map(t);
    }

    public async Task<Result> DeleteTestimonialAsync(int id, CancellationToken ct)
    {
        var t = await db.Testimonials.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t is null) return Error.NotFound("Testimonial");
        db.Testimonials.Remove(t);
        audit.Record("testimonial.delete", "Testimonial", id.ToString(), $"Deleted testimonial from {t.Name}");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result> ReorderTestimonialsAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Testimonials.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        audit.Record("testimonial.reorder", "Testimonial", null, $"Reordered {rows.Count} testimonials");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    private static string Short(string s) => s.Length <= 60 ? s : s[..59] + "…";
}
