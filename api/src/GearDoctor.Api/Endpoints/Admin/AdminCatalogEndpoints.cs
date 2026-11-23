using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Admin;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>Admin categories and brands (tag AdminCatalog). Group already enforces Admin + CSRF.</summary>
public static class AdminCatalogEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        const string tag = "AdminCatalog";
        admin.MapGet("/categories", async (AdminCatalogService s, CancellationToken ct) => Results.Ok(await s.ListCategoriesAsync(ct))).WithTags(tag);
        admin.MapPost("/categories", async (CategoryUpsert req, AdminCatalogService s, CancellationToken ct) =>
            (await s.CreateCategoryAsync(req, ct)).ToHttp(c => Results.Created($"/api/admin/categories/{c.Id}", c))).WithTags(tag);
        admin.MapPost("/categories/reorder", async (ReorderRequest req, AdminCatalogService s, CancellationToken ct) =>
            (await s.ReorderCategoriesAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/categories/{id:int}", async (int id, CategoryUpsert req, AdminCatalogService s, CancellationToken ct) =>
            (await s.UpdateCategoryAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/categories/{id:int}", async (int id, AdminCatalogService s, CancellationToken ct) =>
            (await s.DeleteCategoryAsync(id, ct)).ToHttp()).WithTags(tag);

        admin.MapGet("/brands", async (AdminCatalogService s, CancellationToken ct) => Results.Ok(await s.ListBrandsAsync(ct))).WithTags(tag);
        admin.MapPost("/brands", async (BrandUpsert req, AdminCatalogService s, CancellationToken ct) =>
            (await s.CreateBrandAsync(req, ct)).ToHttp(b => Results.Created($"/api/admin/brands/{b.Id}", b))).WithTags(tag);
        admin.MapPost("/brands/reorder", async (ReorderRequest req, AdminCatalogService s, CancellationToken ct) =>
            (await s.ReorderBrandsAsync(req, ct)).ToHttp()).WithTags(tag);
        admin.MapPut("/brands/{id:int}", async (int id, BrandUpsert req, AdminCatalogService s, CancellationToken ct) =>
            (await s.UpdateBrandAsync(id, req, ct)).ToHttp()).WithTags(tag);
        admin.MapDelete("/brands/{id:int}", async (int id, AdminCatalogService s, CancellationToken ct) =>
            (await s.DeleteBrandAsync(id, ct)).ToHttp()).WithTags(tag);
    }
}
