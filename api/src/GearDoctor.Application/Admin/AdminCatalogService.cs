using FluentValidation;
using GearDoctor.Application.Catalog;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

/// <summary>Admin CRUD + ordering for categories and brands.</summary>
public sealed class AdminCatalogService(IAppDbContext db, IFileStorage files, IAuditLog audit,
    IValidator<CategoryUpsert> catVal, IValidator<BrandUpsert> brandVal)
{
    private string? Url(string? key) => key is null ? null : files.GetPublicUrl(key);

    // ---------------------------------------------------------------- categories
    public async Task<List<CategoryDto>> ListCategoriesAsync(CancellationToken ct)
    {
        var rows = await db.Categories.AsNoTracking().OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new { c.Id, c.Name, c.Slug, c.ImageKey, c.SortOrder, c.IsActive, Count = c.Products.Count })
            .ToListAsync(ct);
        return rows.Select(c => new CategoryDto(c.Id, c.Name, c.Slug, Url(c.ImageKey), c.SortOrder, c.IsActive, c.Count)).ToList();
    }

    public async Task<Result<CategoryDto>> CreateCategoryAsync(CategoryUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(catVal, req, ct) is { } bad) return bad;
        var slug = Unique(await db.Categories.Select(x => x.Slug).ToListAsync(ct), req.Slug, req.Name);
        var next = await db.Categories.Select(x => (int?)x.SortOrder).MaxAsync(ct) ?? -1;
        var c = new Category { Name = req.Name.Trim(), Slug = slug, ImageKey = Blank(req.ImageKey), IsActive = req.IsActive ?? true, SortOrder = next + 1 };
        db.Categories.Add(c);
        await db.SaveChangesAsync(ct);
        audit.Record("category.create", "Category", c.Id.ToString(), $"Created category \"{c.Name}\"");
        await db.SaveChangesAsync(ct);
        return new CategoryDto(c.Id, c.Name, c.Slug, Url(c.ImageKey), c.SortOrder, c.IsActive, 0);
    }

    public async Task<Result<CategoryDto>> UpdateCategoryAsync(int id, CategoryUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(catVal, req, ct) is { } bad) return bad;
        var c = await db.Categories.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error.NotFound("Category");
        var (oName, oSlug, oImg, oActive) = (c.Name, c.Slug, c.ImageKey, c.IsActive);
        c.Name = req.Name.Trim();
        if (!string.IsNullOrWhiteSpace(req.Slug))
            c.Slug = Unique(await db.Categories.Where(x => x.Id != id).Select(x => x.Slug).ToListAsync(ct), req.Slug, req.Name);
        if (req.ImageKey is not null) c.ImageKey = Blank(req.ImageKey);   // null = leave unchanged, "" = clear
        c.IsActive = req.IsActive ?? true;
        var diff = new AuditDiff().Text("name", oName, c.Name).Text("slug", oSlug, c.Slug)
            .Changed("image", oImg != c.ImageKey).Flag("active", oActive, c.IsActive);
        audit.Record("category.update", "Category", id.ToString(), diff.Any ? $"\"{c.Name}\": {diff}" : $"\"{c.Name}\": saved with no field changes");
        await db.SaveChangesAsync(ct);
        var count = await db.Products.CountAsync(p => p.CategoryId == id, ct);
        return new CategoryDto(c.Id, c.Name, c.Slug, Url(c.ImageKey), c.SortOrder, c.IsActive, count);
    }

    public async Task<Result> DeleteCategoryAsync(int id, CancellationToken ct)
    {
        var c = await db.Categories.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null) return Error.NotFound("Category");
        if (await db.Products.IgnoreQueryFilters().AnyAsync(p => p.CategoryId == id, ct))
            return Error.Conflict("Category is in use", "Products still use this category. Deactivate it instead of deleting.");
        db.Categories.Remove(c);
        audit.Record("category.delete", "Category", id.ToString(), $"Deleted category \"{c.Name}\"");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result> ReorderCategoriesAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Categories.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        audit.Record("category.reorder", "Category", null, $"Reordered {rows.Count} categories");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    // ---------------------------------------------------------------- brands
    public async Task<List<BrandDto>> ListBrandsAsync(CancellationToken ct)
    {
        var rows = await db.Brands.AsNoTracking().OrderBy(b => b.SortOrder).ThenBy(b => b.Id).ToListAsync(ct);
        return rows.Select(b => new BrandDto(b.Id, b.Name, b.Slug, Url(b.LogoKey), b.IsActive)).ToList();
    }

    public async Task<Result<BrandDto>> CreateBrandAsync(BrandUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(brandVal, req, ct) is { } bad) return bad;
        var slug = Unique(await db.Brands.Select(x => x.Slug).ToListAsync(ct), req.Slug, req.Name);
        var next = await db.Brands.Select(x => (int?)x.SortOrder).MaxAsync(ct) ?? -1;
        var b = new Brand { Name = req.Name.Trim(), Slug = slug, LogoKey = Blank(req.LogoKey), IsActive = req.IsActive ?? true, SortOrder = next + 1 };
        db.Brands.Add(b);
        await db.SaveChangesAsync(ct);
        audit.Record("brand.create", "Brand", b.Id.ToString(), $"Created brand \"{b.Name}\"");
        await db.SaveChangesAsync(ct);
        return new BrandDto(b.Id, b.Name, b.Slug, Url(b.LogoKey), b.IsActive);
    }

    public async Task<Result<BrandDto>> UpdateBrandAsync(int id, BrandUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(brandVal, req, ct) is { } bad) return bad;
        var b = await db.Brands.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b is null) return Error.NotFound("Brand");
        var (oName, oSlug, oLogo, oActive) = (b.Name, b.Slug, b.LogoKey, b.IsActive);
        b.Name = req.Name.Trim();
        if (!string.IsNullOrWhiteSpace(req.Slug))
            b.Slug = Unique(await db.Brands.Where(x => x.Id != id).Select(x => x.Slug).ToListAsync(ct), req.Slug, req.Name);
        if (req.LogoKey is not null) b.LogoKey = Blank(req.LogoKey);      // null = leave unchanged, "" = clear
        b.IsActive = req.IsActive ?? true;
        var diff = new AuditDiff().Text("name", oName, b.Name).Text("slug", oSlug, b.Slug)
            .Changed("logo", oLogo != b.LogoKey).Flag("active", oActive, b.IsActive);
        audit.Record("brand.update", "Brand", id.ToString(), diff.Any ? $"\"{b.Name}\": {diff}" : $"\"{b.Name}\": saved with no field changes");
        await db.SaveChangesAsync(ct);
        return new BrandDto(b.Id, b.Name, b.Slug, Url(b.LogoKey), b.IsActive);
    }

    public async Task<Result> DeleteBrandAsync(int id, CancellationToken ct)
    {
        var b = await db.Brands.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b is null) return Error.NotFound("Brand");
        if (await db.Products.IgnoreQueryFilters().AnyAsync(p => p.BrandId == id, ct))
            return Error.Conflict("Brand is in use", "Products still use this brand. Deactivate it instead of deleting.");
        db.Brands.Remove(b);
        audit.Record("brand.delete", "Brand", id.ToString(), $"Deleted brand \"{b.Name}\"");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result> ReorderBrandsAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Brands.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        audit.Record("brand.reorder", "Brand", null, $"Reordered {rows.Count} brands");
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    // ---------------------------------------------------------------- helpers
    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string Unique(List<string> existing, string? slug, string name)
    {
        var taken = existing.ToHashSet();
        var baseSlug = Slugs.From(string.IsNullOrWhiteSpace(slug) ? name : slug);
        if (baseSlug.Length == 0) baseSlug = "item";
        var candidate = baseSlug;
        for (var n = 2; taken.Contains(candidate); n++) candidate = $"{baseSlug}-{n}";
        return candidate;
    }
}
