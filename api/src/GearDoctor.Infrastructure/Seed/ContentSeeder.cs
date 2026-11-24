using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GearDoctor.Infrastructure.Seed;

/// <summary>
/// Imports guides, FAQs and testimonials from seed/content.json (exported from the old storefront config).
/// Each table is seeded only when it is empty, so re-running never duplicates or overwrites admin edits.
/// Guides run after the catalog import: relatedProductSlugs are mapped to product ids (unknown slugs are skipped
/// with a warning). One SaveChanges for everything (the retrying execution strategy rejects user transactions).
/// </summary>
public static class ContentSeeder
{
    private sealed record ContentFile(List<SeedGuide>? Guides, List<SeedFaq>? Faqs, List<SeedTestimonial>? Testimonials);
    private sealed record SeedGuide(string Slug, string Title, string Type, string Excerpt, string Body, string? CoverKey,
        string? Video, string? Source, List<string>? RelatedProductSlugs, int SortOrder, bool IsPublished);
    private sealed record SeedFaq(string Q, string A, int SortOrder, bool IsPublished);
    private sealed record SeedTestimonial(string Name, string? Bike, string Quote, int Rating, int SortOrder, bool IsPublished);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static async Task ImportAsync(AppDbContext db, string path, ILogger log)
    {
        var needGuides = !await db.Guides.AnyAsync();
        var needFaqs = !await db.Faqs.AnyAsync();
        var needTestimonials = !await db.Testimonials.AnyAsync();
        if (!needGuides && !needFaqs && !needTestimonials) { log.LogInformation("Content: tables already have rows; skipping import"); return; }

        var file = JsonSerializer.Deserialize<ContentFile>(await File.ReadAllTextAsync(path), JsonOptions)
            ?? throw new InvalidOperationException($"Content file {path} is empty or invalid");
        var now = DateTimeOffset.UtcNow;

        if (needGuides && file.Guides is { Count: > 0 })
        {
            var ids = await db.Products.ToDictionaryAsync(p => p.Slug, p => p.Id);
            foreach (var g in file.Guides)
            {
                var related = new List<int>();
                foreach (var s in g.RelatedProductSlugs ?? [])
                {
                    if (ids.TryGetValue(s, out var id)) related.Add(id);
                    else log.LogWarning("Content: guide '{Guide}' relates to unknown product '{Slug}'; skipped", g.Slug, s);
                }
                db.Guides.Add(new Guide
                {
                    Slug = g.Slug, Title = g.Title, Type = g.Type, Excerpt = g.Excerpt, Body = g.Body,
                    CoverKey = g.CoverKey, Video = g.Video, Source = g.Source, RelatedProductIds = [.. related],
                    IsPublished = g.IsPublished, SortOrder = g.SortOrder, CreatedAt = now, UpdatedAt = now,
                });
            }
        }
        if (needFaqs && file.Faqs is { Count: > 0 })
            foreach (var f in file.Faqs)
                db.Faqs.Add(new Faq { Q = f.Q, A = f.A, IsPublished = f.IsPublished, SortOrder = f.SortOrder });
        if (needTestimonials && file.Testimonials is { Count: > 0 })
            foreach (var t in file.Testimonials)
                db.Testimonials.Add(new Testimonial { Name = t.Name, Bike = t.Bike, Quote = t.Quote, Rating = t.Rating, IsPublished = t.IsPublished, SortOrder = t.SortOrder });

        await db.SaveChangesAsync();
        log.LogInformation("Content import complete: {Guides} guides, {Faqs} FAQs, {Testimonials} testimonials",
            needGuides ? file.Guides?.Count ?? 0 : 0, needFaqs ? file.Faqs?.Count ?? 0 : 0, needTestimonials ? file.Testimonials?.Count ?? 0 : 0);
    }
}
