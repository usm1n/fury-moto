using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Catalog;

namespace GearDoctor.Api.Endpoints;

/// <summary>Public catalog GETs (storefront). All responses are CDN-cacheable.</summary>
public static class PublicCatalogEndpoints
{
    public static IEndpointRouteBuilder MapPublicCatalog(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").WithTags("Public").AllowAnonymous();

        g.MapGet("/products", async ([AsParameters] ProductListQuery q, CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            var r = await svc.ListAsync(q, ct);
            if (r.IsSuccess) res.CachePublic();
            return r.ToHttp();
        });

        g.MapGet("/products/featured", async (CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.FeaturedAsync(ct));
        });

        g.MapGet("/products/facets", async (string? category, CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.FacetsAsync(category, ct));
        });

        g.MapGet("/products/{slug}", async (string slug, CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            var r = await svc.GetAsync(slug, ct);
            if (r.IsSuccess) res.CachePublic();
            return r.ToHttp();
        });

        g.MapGet("/categories", async (CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.CategoriesAsync(ct));
        });

        g.MapGet("/brands", async (CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.BrandsAsync(ct));
        });

        g.MapGet("/certifications", async (CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.CertificationsAsync(ct));
        });

        g.MapGet("/settings/public", async (CatalogService svc, HttpResponse res, CancellationToken ct) =>
        {
            res.CachePublic();
            return Results.Ok(await svc.PublicSettingsAsync(ct));
        });

        return app;
    }
}
