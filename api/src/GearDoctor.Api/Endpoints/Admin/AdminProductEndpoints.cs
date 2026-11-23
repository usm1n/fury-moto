using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Admin;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>Admin products, variants grid and stock (tag AdminProducts). Group already enforces Admin + CSRF.</summary>
public static class AdminProductEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        const string tag = "AdminProducts";
        admin.MapGet("/products", async ([AsParameters] AdminProductQuery q, AdminProductService s, CancellationToken ct) =>
            (await s.ListAsync(q, ct)).ToHttp()).WithTags(tag);
        admin.MapPost("/products", async (ProductUpsert req, AdminProductService s, CancellationToken ct) =>
            (await s.CreateAsync(req, ct)).ToHttp(p => Results.Created($"/api/admin/products/{p.Id}", p))).WithTags(tag);
        admin.MapPost("/products/reorder", async (ReorderRequest req, AdminProductService s, CancellationToken ct) =>
            (await s.ReorderAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapGet("/products/{id:int}", async (int id, AdminProductService s, CancellationToken ct) =>
            (await s.GetAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/products/{id:int}", async (int id, ProductUpsert req, AdminProductService s, CancellationToken ct) =>
            (await s.UpdateAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/products/{id:int}", async (int id, AdminProductService s, CancellationToken ct) =>
            (await s.DeleteAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPost("/products/{id:int}/duplicate", async (int id, AdminProductService s, CancellationToken ct) =>
            (await s.DuplicateAsync(id, ct)).ToHttp(p => Results.Created($"/api/admin/products/{p.Id}", p))).WithTags(tag);
        admin.MapPost("/products/{id:int}/publish", async (int id, AdminProductService s, CancellationToken ct) =>
            (await s.PublishAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPost("/products/{id:int}/unpublish", async (int id, AdminProductService s, CancellationToken ct) =>
            (await s.UnpublishAsync(id, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/products/{id:int}/variants", async (int id, List<VariantUpsert> rows, AdminProductService s, CancellationToken ct) =>
            (await s.UpsertVariantsAsync(id, rows, ct)).ToHttp()).WithTags(tag);
        admin.MapPost("/variants/{id:int}/stock", async (int id, StockAdjust req, AdminProductService s, CancellationToken ct) =>
            (await s.AdjustStockAsync(id, req, ct)).ToHttp()).WithTags(tag);
    }
}
