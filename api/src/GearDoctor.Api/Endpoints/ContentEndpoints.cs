using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Content;

namespace GearDoctor.Api.Endpoints;

/// <summary>Public content GETs (guides, FAQs, testimonials). Published only; CDN-cacheable.</summary>
public static class ContentEndpoints
{
    public static IEndpointRouteBuilder MapContent(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/content").WithTags("Content").AllowAnonymous();

        g.MapGet("/guides", async (ContentService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.GuidesAsync(ct));
        });
        g.MapGet("/guides/{slug}", async (string slug, ContentService svc, HttpResponse res, CancellationToken ct) =>
        {
            var r = await svc.GuideAsync(slug, ct);
            if (r.IsSuccess) res.CachePublic();
            return r.ToHttp();
        });
        g.MapGet("/faqs", async (ContentService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.FaqsAsync(ct));
        });
        g.MapGet("/testimonials", async (ContentService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.TestimonialsAsync(ct));
        });
        return app;
    }
}
