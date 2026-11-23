using System.Text.RegularExpressions;
using FluentValidation;
using GearDoctor.Application.Catalog;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

/// <summary>Admin products, variants grid and stock adjustments.</summary>
public sealed partial class AdminProductService(IAppDbContext db, IFileStorage files, IClock clock,
    IValidator<ProductUpsert> productVal, IValidator<VariantUpsert> variantVal, IValidator<StockAdjust> stockVal)
{
    [GeneratedRegex("[^A-Z0-9-]+")] private static partial Regex NonSku();

    // ---------------------------------------------------------------- reads
    public async Task<Result<PagedList<AdminProductRow>>> ListAsync(AdminProductQuery q, CancellationToken ct)
    {
        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, 100);
        var query = db.Products.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.Status))
        {
            if (!Enum.TryParse<ProductStatus>(q.Status, true, out var st)) return Error.Validation("status", "Status must be Draft, Published or Archived.");
            query = query.Where(p => p.Status == st);
        }
        if (q.Category is { } c) query = query.Where(p => p.CategoryId == c);
        if (q.Brand is { } b) query = query.Where(p => p.BrandId == b);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = q.Q.Trim().ToLower();
            query = query.Where(p => p.Title.ToLower().Contains(like) || p.Slug.Contains(like));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(p => p.SortOrder).ThenByDescending(p => p.Id)
            .Skip((page - 1) * size).Take(size)
            .Select(p => new
            {
                p.Id, p.Title, p.Slug, p.Status, Brand = p.Brand.Name, Category = p.Category.Name, p.Price,
                Stock = p.Variants.Where(v => v.IsActive).Sum(v => (int?)v.Stock) ?? 0,
                Thumb = p.Images.OrderBy(i => i.SortOrder).Select(i => i.ThumbKey).FirstOrDefault(),
                p.IsFeatured, p.UpdatedAt,
            }).ToListAsync(ct);
        var items = rows.Select(r => new AdminProductRow(r.Id, r.Title, r.Slug, r.Status.ToString(), r.Brand, r.Category,
            r.Price, r.Stock, r.Thumb is null ? null : files.GetPublicUrl(r.Thumb), r.IsFeatured, r.UpdatedAt)).ToList();
        return new PagedList<AdminProductRow>(items, page, size, total);
    }

    public async Task<Result<AdminProductDto>> GetAsync(int id, CancellationToken ct) =>
        await LoadDtoAsync(id, ct) is { } dto ? dto : Error.NotFound("Product");

    // ---------------------------------------------------------------- create / update
    public async Task<Result<AdminProductDto>> CreateAsync(ProductUpsert req, CancellationToken ct)
    {
        if (await ValidateAsync(req, ct) is { } bad) return bad;
        var certIds = req.CertificationIds ?? [];
        var certs = await db.Certifications.Where(c => certIds.Contains(c.Id)).ToListAsync(ct);
        var now = clock.Now;
        var next = await db.Products.Select(p => (int?)p.SortOrder).MaxAsync(ct) ?? -1;
        var p = new Product
        {
            Title = req.Title.Trim(), Slug = await UniqueProductSlugAsync(req.Slug, req.Title, null, ct),
            BrandId = req.BrandId, CategoryId = req.CategoryId, Status = ProductStatus.Draft,
            SortOrder = next + 1, CreatedAt = now, UpdatedAt = now,
        };
        Apply(p, req, certs);
        db.Products.Add(p);
        await db.SaveChangesAsync(ct);
        return (await LoadDtoAsync(p.Id, ct))!;
    }

    public async Task<Result<AdminProductDto>> UpdateAsync(int id, ProductUpsert req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Version)) return Error.Validation("version", "Version is required when updating.");
        if (!uint.TryParse(req.Version, out var version)) return Error.Validation("version", "Version is not valid.");
        if (await ValidateAsync(req, ct) is { } bad) return bad;
        var p = await db.Products.Include(x => x.Certifications).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Error.NotFound("Product");
        if (p.Version != version) return AdminValidation.Stale("Product");

        var certIds = req.CertificationIds ?? [];
        var certs = await db.Certifications.Where(c => certIds.Contains(c.Id)).ToListAsync(ct);
        p.Title = req.Title.Trim();
        if (!string.IsNullOrWhiteSpace(req.Slug) && req.Slug.Trim() != p.Slug)
            p.Slug = await UniqueProductSlugAsync(req.Slug, req.Title, id, ct);
        Apply(p, req, certs);
        p.UpdatedAt = clock.Now;
        ((DbContext)db).Entry(p).Property(x => x.Version).OriginalValue = version;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AdminValidation.Stale("Product"); }
        return (await LoadDtoAsync(id, ct))!;
    }

    private static void Apply(Product p, ProductUpsert req, List<Certification> certs)
    {
        p.BrandId = req.BrandId;
        p.CategoryId = req.CategoryId;
        p.ShortDescription = req.ShortDescription?.Trim() ?? "";
        p.Description = req.Description?.Trim() ?? "";
        p.GearDoctorNote = req.GearDoctorNote?.Trim() ?? "";
        p.Specs = (req.Specs ?? []).Select(s => new Spec(s.Label.Trim(), s.Value.Trim())).ToList();
        p.Price = req.Price;
        p.CompareAtPrice = req.CompareAtPrice;
        p.Badges = (req.Badges ?? []).Distinct().ToList();
        p.IsFeatured = req.IsFeatured;
        p.Certifications.Clear();
        p.Certifications.AddRange(certs);
    }

    private async Task<Error?> ValidateAsync(ProductUpsert req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(productVal, req, ct) is { } bad) return bad;
        var errors = new Dictionary<string, string[]>();
        if (!await db.Brands.AnyAsync(b => b.Id == req.BrandId, ct)) errors["brandId"] = ["Brand does not exist."];
        if (!await db.Categories.AnyAsync(c => c.Id == req.CategoryId, ct)) errors["categoryId"] = ["Category does not exist."];
        var ids = (req.CertificationIds ?? []).Distinct().ToList();
        if (ids.Count > 0 && await db.Certifications.CountAsync(c => ids.Contains(c.Id), ct) != ids.Count)
            errors["certificationIds"] = ["One or more certifications do not exist."];
        return errors.Count > 0 ? Error.Validation(errors) : null;
    }

    private async Task<string> UniqueProductSlugAsync(string? slug, string title, int? selfId, CancellationToken ct)
    {
        var baseSlug = Slugs.From(string.IsNullOrWhiteSpace(slug) ? title : slug);
        if (baseSlug.Length == 0) baseSlug = "product";
        if (baseSlug.Length > 150) baseSlug = baseSlug[..150].Trim('-');
        var taken = await db.Products.Where(p => p.Id != selfId && p.Slug.StartsWith(baseSlug)).Select(p => p.Slug).ToListAsync(ct);
        var set = taken.ToHashSet();
        var candidate = baseSlug;
        for (var n = 2; set.Contains(candidate); n++) candidate = $"{baseSlug}-{n}";
        return candidate;
    }

    // ---------------------------------------------------------------- delete / status / reorder
    public async Task<Result> DeleteAsync(int id, CancellationToken ct)
    {
        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Error.NotFound("Product");
        p.DeletedAt = p.UpdatedAt = clock.Now;
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result<AdminProductDto>> PublishAsync(int id, CancellationToken ct)
    {
        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Error.NotFound("Product");
        var errors = new Dictionary<string, string[]>();
        if (!await db.ProductImages.AnyAsync(i => i.ProductId == id, ct)) errors["images"] = ["Add at least one image before publishing."];
        if (!await db.ProductVariants.AnyAsync(v => v.ProductId == id && v.IsActive, ct)) errors["variants"] = ["Add at least one active variant before publishing."];
        if (errors.Count > 0) return Error.Validation(errors);
        p.Status = ProductStatus.Published;
        p.UpdatedAt = clock.Now;
        await db.SaveChangesAsync(ct);
        return (await LoadDtoAsync(id, ct))!;
    }

    public async Task<Result<AdminProductDto>> UnpublishAsync(int id, CancellationToken ct)
    {
        var p = await db.Products.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return Error.NotFound("Product");
        p.Status = ProductStatus.Draft;
        p.UpdatedAt = clock.Now;
        await db.SaveChangesAsync(ct);
        return (await LoadDtoAsync(id, ct))!;
    }

    public async Task<Result> ReorderAsync(ReorderRequest req, CancellationToken ct)
    {
        if (req.Ids is null) return Error.Validation("ids", "ids is required.");
        var rows = await db.Products.Where(x => req.Ids.Contains(x.Id)).ToListAsync(ct);
        for (var i = 0; i < req.Ids.Count; i++) { var r = rows.FirstOrDefault(x => x.Id == req.Ids[i]); if (r is not null) r.SortOrder = i; }
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result<AdminProductDto>> DuplicateAsync(int id, CancellationToken ct)
    {
        var src = await db.Products.Include(x => x.Certifications).Include(x => x.Variants).Include(x => x.Brand)
            .AsSplitQuery().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (src is null) return Error.NotFound("Product");
        var now = clock.Now;
        const string suffix = " (copy)";
        var title = src.Title.Length + suffix.Length > 140 ? src.Title[..(140 - suffix.Length)] + suffix : src.Title + suffix;
        var next = await db.Products.Select(p => (int?)p.SortOrder).MaxAsync(ct) ?? -1;
        var copy = new Product
        {
            Title = title, Slug = await UniqueProductSlugAsync(null, title, null, ct), BrandId = src.BrandId, CategoryId = src.CategoryId,
            ShortDescription = src.ShortDescription, Description = src.Description, GearDoctorNote = src.GearDoctorNote,
            Specs = src.Specs.Select(s => new Spec(s.Label, s.Value)).ToList(), Price = src.Price, CompareAtPrice = src.CompareAtPrice,
            Badges = [.. src.Badges], Status = ProductStatus.Draft, IsFeatured = false, SortOrder = next + 1, CreatedAt = now, UpdatedAt = now,
        };
        copy.Certifications.AddRange(src.Certifications);
        var used = new HashSet<string>();
        foreach (var v in src.Variants)
            copy.Variants.Add(new ProductVariant
            {
                Size = v.Size, Color = v.Color, ColorHex = v.ColorHex, PriceOverride = v.PriceOverride, IsActive = v.IsActive, Stock = 0,
                Sku = await UniqueSkuAsync(src.Brand.Slug, copy.Slug, v.Size, v.Color, used, null, ct),
            });
        db.Products.Add(copy);
        await db.SaveChangesAsync(ct);
        return (await LoadDtoAsync(copy.Id, ct))!;
    }

    // ---------------------------------------------------------------- variants
    public async Task<Result<List<VariantDto>>> UpsertVariantsAsync(int productId, List<VariantUpsert>? rows, CancellationToken ct)
    {
        if (rows is null) return Error.Validation("body", "Send an array of variants.");
        var p = await db.Products.Include(x => x.Brand).Include(x => x.Variants).FirstOrDefaultAsync(x => x.Id == productId, ct);
        if (p is null) return Error.NotFound("Product");

        var errors = new Dictionary<string, string[]>();
        for (var i = 0; i < rows.Count; i++)
            if (await AdminValidation.CheckAsync(variantVal, rows[i], ct, $"[{i}].") is { Errors: { } e })
                foreach (var kv in e) errors[kv.Key] = kv.Value;
        if (errors.Count > 0) return Error.Validation(errors);

        var dupes = rows.GroupBy(r => (r.Size.Trim().ToLowerInvariant(), r.Color.Trim().ToLowerInvariant())).Where(g => g.Count() > 1).ToList();
        if (dupes.Count > 0)
            return Error.Validation("variants", $"Duplicate size/colour combination: {string.Join(", ", dupes.Select(g => g.First().Size + " / " + g.First().Color))}.");
        var ids = rows.Where(r => r.Id.HasValue).Select(r => r.Id!.Value).ToList();
        if (ids.Distinct().Count() != ids.Count) return Error.Validation("variants", "A variant id appears more than once.");
        var existing = p.Variants.ToDictionary(v => v.Id);
        var missing = ids.FirstOrDefault(i => !existing.ContainsKey(i));
        if (missing != 0) return Error.Validation("variants", $"Variant {missing} does not belong to this product.");

        // Match rows to existing variants: by id, else by (size, colour) so re-sending a grid reactivates old rows.
        var matched = new Dictionary<VariantUpsert, ProductVariant>(ReferenceEqualityComparer.Instance);
        foreach (var r in rows.Where(r => r.Id.HasValue)) matched[r] = existing[r.Id!.Value];
        var claimed = matched.Values.ToHashSet();
        foreach (var r in rows.Where(r => !r.Id.HasValue))
        {
            var hit = p.Variants.FirstOrDefault(v => !claimed.Contains(v) &&
                string.Equals(v.Size, r.Size.Trim(), StringComparison.OrdinalIgnoreCase) && string.Equals(v.Color, r.Color.Trim(), StringComparison.OrdinalIgnoreCase));
            if (hit is not null) { matched[r] = hit; claimed.Add(hit); }
        }

        var ctx = (DbContext)db;
        foreach (var (r, v) in matched.Where(m => m.Key.Id.HasValue))
        {
            if (string.IsNullOrWhiteSpace(r.Version)) continue;
            if (!uint.TryParse(r.Version, out var ver) || ver != v.Version) return AdminValidation.Stale("Variant");
            ctx.Entry(v).Property(x => x.Version).OriginalValue = ver;
        }

        var used = new HashSet<string>();
        foreach (var v in p.Variants.Where(v => !claimed.Contains(v))) used.Add(v.Sku);
        var created = new List<ProductVariant>();
        foreach (var r in rows)
        {
            var size = r.Size.Trim(); var color = r.Color.Trim();
            ProductVariant v;
            var isNew = !matched.TryGetValue(r, out var found);
            if (isNew)
            {
                v = new ProductVariant { Size = size, Color = color, Sku = "" };
                created.Add(v);
            }
            else v = found!;
            v.Size = size; v.Color = color;
            if (!string.IsNullOrWhiteSpace(r.Sku))
            {
                var sku = await ExplicitSkuAsync(r.Sku, v.Id, used, ct);
                if (sku is null) return Error.Validation("sku", $"SKU {r.Sku.Trim()} is already used.");
                v.Sku = sku; used.Add(sku);
            }
            else if (isNew || string.IsNullOrEmpty(v.Sku))
                v.Sku = await UniqueSkuAsync(p.Brand.Slug, p.Slug, size, color, used, v.Id == 0 ? null : v.Id, ct);
            else used.Add(v.Sku);
            v.ColorHex = string.IsNullOrWhiteSpace(r.ColorHex) ? null : r.ColorHex;
            v.Stock = r.Stock;
            v.PriceOverride = r.PriceOverride;
            v.IsActive = r.IsActive ?? true;
        }
        foreach (var v in p.Variants.Where(v => !claimed.Contains(v))) v.IsActive = false;
        foreach (var v in created) p.Variants.Add(v);

        p.UpdatedAt = clock.Now;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return AdminValidation.Stale("Variant"); }
        var saved = await db.ProductVariants.AsNoTracking().Where(v => v.ProductId == productId).OrderBy(v => v.Id).ToListAsync(ct);
        return saved.Select(ToDto).ToList();
    }

    private async Task<string?> ExplicitSkuAsync(string sku, int selfId, HashSet<string> used, CancellationToken ct)
    {
        sku = sku.Trim();
        if (used.Contains(sku)) return null;
        return await db.ProductVariants.IgnoreQueryFilters().AnyAsync(v => v.Sku == sku && v.Id != selfId, ct) ? null : sku;
    }

    private async Task<string> UniqueSkuAsync(string brandSlug, string productSlug, string size, string color,
        HashSet<string> used, int? selfId, CancellationToken ct)
    {
        var raw = NonSku().Replace($"{brandSlug}-{productSlug}-{size}-{color}".ToUpperInvariant(), "-").Trim('-');
        if (raw.Length > 64) raw = raw[..64].Trim('-');
        if (raw.Length == 0) raw = "SKU";
        var candidate = raw;
        for (var n = 2; ; n++)
        {
            var c = candidate;
            if (!used.Contains(c) && !await db.ProductVariants.IgnoreQueryFilters().AnyAsync(v => v.Sku == c && v.Id != selfId, ct))
            { used.Add(c); return c; }
            var suffix = "-" + n;
            candidate = (raw.Length + suffix.Length > 64 ? raw[..(64 - suffix.Length)] : raw) + suffix;
        }
    }

    public async Task<Result<VariantDto>> AdjustStockAsync(int variantId, StockAdjust req, CancellationToken ct)
    {
        if (await AdminValidation.CheckAsync(stockVal, req, ct) is { } bad) return bad;
        if (!await db.ProductVariants.AnyAsync(v => v.Id == variantId, ct)) return Error.NotFound("Variant");
        var delta = req.Delta;
        var n = await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE \"ProductVariants\" SET \"Stock\" = \"Stock\" + {delta} WHERE \"Id\" = {variantId} AND \"Stock\" + {delta} >= 0", ct);
        if (n == 0) return Error.Validation("delta", "Stock cannot go below zero.");
        var v = await db.ProductVariants.AsNoTracking().FirstAsync(x => x.Id == variantId, ct);
        var now = clock.Now;
        await db.Products.Where(x => x.Id == v.ProductId).ExecuteUpdateAsync(s => s.SetProperty(x => x.UpdatedAt, now), ct);
        return ToDto(v);
    }

    // ---------------------------------------------------------------- mapping
    private static VariantDto ToDto(ProductVariant v) =>
        new(v.Id, v.Size, v.Color, v.ColorHex, v.Sku, v.Stock, v.PriceOverride, v.IsActive, v.Version.ToString());

    private async Task<AdminProductDto?> LoadDtoAsync(int id, CancellationToken ct)
    {
        var p = await db.Products.AsNoTracking().AsSplitQuery()
            .Include(x => x.Variants).Include(x => x.Images).Include(x => x.Certifications)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (p is null) return null;
        return new AdminProductDto(p.Id, p.Title, p.Slug, p.BrandId, p.CategoryId, p.ShortDescription, p.Description, p.GearDoctorNote,
            p.Specs.Select(s => new SpecDto(s.Label, s.Value)).ToList(), p.Price, p.CompareAtPrice, p.Badges,
            p.Certifications.Select(c => c.Id).OrderBy(x => x).ToList(), p.IsFeatured, p.Version.ToString(), p.Status.ToString(),
            p.Variants.OrderBy(v => v.Id).Select(ToDto).ToList(),
            p.Images.OrderBy(i => i.SortOrder).Select(i => new ImageDto(i.Id, files.GetPublicUrl(i.StorageKey), files.GetPublicUrl(i.ThumbKey), i.Width, i.Height, i.Alt)).ToList(),
            p.CreatedAt, p.UpdatedAt, $"/product.html?slug={p.Slug}");
    }
}
