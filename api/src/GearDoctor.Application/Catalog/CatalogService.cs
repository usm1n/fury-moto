using System.Text.Json;
using FluentValidation;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Catalog;

/// <summary>Public (storefront) catalog reads. Published, non-deleted products in active categories/brands only.</summary>
public sealed class CatalogService(IAppDbContext db, IFileStorage files, ITurnstileVerifier turnstile, IValidator<ProductListQuery> validator)
{
    private sealed record CardRow(int Id, string Slug, string Title, string BrandSlug, string BrandName,
        string CategorySlug, string CategoryName, int Price, int? CompareAtPrice, List<string> Badges);

    private IQueryable<Product> Visible() => db.Products.AsNoTracking()
        .Where(p => p.Status == ProductStatus.Published && p.Category.IsActive && p.Brand.IsActive);

    private static string[] Csv(string? s) => string.IsNullOrWhiteSpace(s) ? []
        : s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToArray();

    // ---------------------------------------------------------------- list
    public async Task<Result<PagedList<ProductCardDto>>> ListAsync(ProductListQuery q, CancellationToken ct)
    {
        var v = await validator.ValidateAsync(q, ct);
        if (!v.IsValid)
            return Error.Validation(v.Errors.GroupBy(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()));

        var query = Visible();
        if (!string.IsNullOrWhiteSpace(q.Category)) { var c = q.Category.Trim(); query = query.Where(p => p.Category.Slug == c); }
        var brands = Csv(q.Brand);
        if (brands.Length > 0) query = query.Where(p => brands.Contains(p.Brand.Slug));
        var sizes = Csv(q.Size);
        if (sizes.Length > 0) query = query.Where(p => p.Variants.Any(x => x.IsActive && sizes.Contains(x.Size)));
        var certs = Csv(q.Cert);
        if (certs.Length > 0) query = query.Where(p => p.Certifications.Any(c => certs.Contains(c.Code)));
        if (q.MinPrice is { } min) query = query.Where(p => p.Price >= min);
        if (q.MaxPrice is { } max) query = query.Where(p => p.Price <= max);
        if (q.InStock == true) query = query.Where(p => p.Variants.Any(x => x.IsActive && x.Stock > 0));
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            foreach (var term in q.Q.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var t = term.ToLower();
                query = query.Where(p => p.Title.ToLower().Contains(t) || p.Brand.Name.ToLower().Contains(t) || p.Category.Name.ToLower().Contains(t));
            }
        }

        var total = await query.CountAsync(ct);
        var ordered = q.Sort switch
        {
            "price-asc" => query.OrderBy(p => p.Price).ThenBy(p => p.Id),
            "price-desc" => query.OrderByDescending(p => p.Price).ThenBy(p => p.Id),
            "new" => query.OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id),
            "name" => query.OrderBy(p => p.Title).ThenBy(p => p.Id),
            _ => query.OrderByDescending(p => p.IsFeatured).ThenBy(p => p.SortOrder).ThenBy(p => p.Id),
        };
        var rows = await Rows(ordered.Skip((q.Page - 1) * q.PageSize).Take(q.PageSize), ct);
        var items = await BuildCards(rows, ct);
        return new PagedList<ProductCardDto>(items, q.Page, q.PageSize, total);
    }

    private Task<List<CardRow>> Rows(IQueryable<Product> ordered, CancellationToken ct) => ordered
        .Select(p => new CardRow(p.Id, p.Slug, p.Title, p.Brand.Slug, p.Brand.Name, p.Category.Slug, p.Category.Name,
            p.Price, p.CompareAtPrice, p.Badges))
        .ToListAsync(ct);

    /// <summary>Three batched queries (images, variants, certs) for the given rows; order preserved.</summary>
    private async Task<List<ProductCardDto>> BuildCards(List<CardRow> rows, CancellationToken ct)
    {
        if (rows.Count == 0) return [];
        var ids = rows.Select(r => r.Id).ToArray();

        var images = (await db.ProductImages.AsNoTracking().Where(i => ids.Contains(i.ProductId))
            .OrderBy(i => i.ProductId).ThenBy(i => i.SortOrder).ThenBy(i => i.Id)
            .Select(i => new { i.ProductId, i.Id, i.StorageKey, i.ThumbKey, i.Width, i.Height, i.Alt }).ToListAsync(ct))
            .GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Take(2)
                .Select(i => new ImageDto(i.Id, files.GetPublicUrl(i.StorageKey), files.GetPublicUrl(i.ThumbKey), i.Width, i.Height, i.Alt)).ToList());

        var variants = (await db.ProductVariants.AsNoTracking().Where(x => ids.Contains(x.ProductId) && x.IsActive)
            .Select(x => new { x.ProductId, x.Size, x.Stock }).ToListAsync(ct))
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key,
                g => (Sizes: SortSizes(g.Select(x => x.Size).Distinct()), InStock: g.Any(x => x.Stock > 0)));

        var certs = (await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id))
            .SelectMany(p => p.Certifications.Select(c => new { ProductId = p.Id, c.Id, c.Name })).ToListAsync(ct))
            .GroupBy(c => c.ProductId).ToDictionary(g => g.Key, g => g.OrderBy(c => c.Id).Select(c => c.Name).ToList());

        return rows.Select(r =>
        {
            var hasVars = variants.TryGetValue(r.Id, out var vi);
            return new ProductCardDto(r.Slug, r.Title, new(r.BrandSlug, r.BrandName), new(r.CategorySlug, r.CategoryName),
                r.Price, r.CompareAtPrice, r.Badges,
                certs.GetValueOrDefault(r.Id) ?? [],
                images.GetValueOrDefault(r.Id) ?? [],
                hasVars && vi.InStock,
                hasVars ? vi.Sizes : []);
        }).ToList();
    }

    private static readonly string[] SizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
    private static List<string> SortSizes(IEnumerable<string> sizes) => sizes
        .OrderBy(s => { var i = Array.IndexOf(SizeOrder, s.ToUpperInvariant()); return i < 0 ? int.MaxValue : i; })
        .ThenBy(s => double.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : double.MaxValue)
        .ThenBy(s => s, StringComparer.OrdinalIgnoreCase).ToList();

    /// <summary>Cards for the given product ids, in the given order. Unpublished/deleted/inactive-category products are dropped.</summary>
    public async Task<List<ProductCardDto>> CardsByIdsAsync(IReadOnlyList<int> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        var arr = ids.Distinct().ToArray();
        var rows = await Rows(Visible().Where(p => arr.Contains(p.Id)), ct);
        var order = arr.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        return await BuildCards(rows.OrderBy(r => order[r.Id]).ToList(), ct);
    }

    // ---------------------------------------------------------------- featured
    public async Task<List<ProductCardDto>> FeaturedAsync(CancellationToken ct)
    {
        var rows = await Rows(Visible().Where(p => p.IsFeatured).OrderBy(p => p.SortOrder).ThenBy(p => p.Id).Take(8), ct);
        if (rows.Count == 0)
            rows = await Rows(Visible().OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id).Take(8), ct);
        return await BuildCards(rows, ct);
    }

    // ---------------------------------------------------------------- facets
    public async Task<FacetsDto> FacetsAsync(string? category, CancellationToken ct)
    {
        var query = Visible();
        if (!string.IsNullOrWhiteSpace(category)) { var c = category.Trim(); query = query.Where(p => p.Category.Slug == c); }

        var brands = await query.GroupBy(p => new { p.Brand.Slug, p.Brand.Name })
            .Select(g => new FacetBrand(g.Key.Slug, g.Key.Name, g.Count())).ToListAsync(ct);
        var sizes = await db.ProductVariants.AsNoTracking()
            .Where(x => x.IsActive && query.Any(p => p.Id == x.ProductId)).Select(x => x.Size).Distinct().ToListAsync(ct);
        var certs = await query.SelectMany(p => p.Certifications).Select(c => new { c.Id, c.Code, c.Name }).Distinct().OrderBy(c => c.Id)
            .ToListAsync(ct);
        var range = await query.GroupBy(_ => 1).Select(g => new { Min = g.Min(p => p.Price), Max = g.Max(p => p.Price) }).FirstOrDefaultAsync(ct);

        return new FacetsDto(brands.OrderBy(b => b.Name, StringComparer.OrdinalIgnoreCase).ToList(), SortSizes(sizes),
            certs.Select(c => new FacetCert(c.Code, c.Name)).ToList(), range?.Min ?? 0, range?.Max ?? 0);
    }

    // ---------------------------------------------------------------- detail
    public async Task<Result<ProductDetailDto>> GetAsync(string slug, CancellationToken ct)
    {
        var p = await Visible().Where(x => x.Slug == slug).Select(x => new
        {
            x.Id, x.CategoryId, x.Slug, x.Title, BrandSlug = x.Brand.Slug, BrandName = x.Brand.Name,
            CategorySlug = x.Category.Slug, CategoryName = x.Category.Name, x.Price, x.CompareAtPrice, x.Badges,
            x.ShortDescription, x.Description, x.GearDoctorNote, x.Specs,
        }).FirstOrDefaultAsync(ct);
        if (p is null) return Error.NotFound("Product");

        var images = (await db.ProductImages.AsNoTracking().Where(i => i.ProductId == p.Id)
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Id).ToListAsync(ct))
            .Select(i => new ImageDto(i.Id, files.GetPublicUrl(i.StorageKey), files.GetPublicUrl(i.ThumbKey), i.Width, i.Height, i.Alt)).ToList();
        var vars = await db.ProductVariants.AsNoTracking().Where(v => v.ProductId == p.Id && v.IsActive)
            .OrderBy(v => v.Id).Select(v => new { v.Size, v.Color, v.ColorHex, v.PriceOverride, v.Stock }).ToListAsync(ct);
        var certs = await db.Products.AsNoTracking().Where(x => x.Id == p.Id).SelectMany(x => x.Certifications)
            .OrderBy(c => c.Id).Select(c => new CertificationDto(c.Id, c.Code, c.Name, c.Description)).ToListAsync(ct);
        var threshold = await LowStockThresholdAsync(ct);

        var sizeOrder = SortSizes(vars.Select(v => v.Size).Distinct());
        var detailVariants = vars
            .OrderBy(v => sizeOrder.IndexOf(v.Size)).ThenBy(v => v.Color)
            .Select(v => new DetailVariantDto(v.Size, v.Color, v.ColorHex, v.PriceOverride ?? p.Price,
                Math.Min(v.Stock, 10), v.Stock > 0 && v.Stock <= threshold)).ToList();

        // related: same category first, then others; published only; exclude self; max 4
        var same = await Rows(Visible().Where(x => x.Id != p.Id && x.CategoryId == p.CategoryId)
            .OrderByDescending(x => x.IsFeatured).ThenBy(x => x.SortOrder).ThenBy(x => x.Id).Take(4), ct);
        if (same.Count < 4)
        {
            var other = await Rows(Visible().Where(x => x.Id != p.Id && x.CategoryId != p.CategoryId)
                .OrderByDescending(x => x.IsFeatured).ThenBy(x => x.SortOrder).ThenBy(x => x.Id).Take(4 - same.Count), ct);
            same.AddRange(other);
        }
        var related = await BuildCards(same, ct);

        return new ProductDetailDto(p.Slug, p.Title, new(p.BrandSlug, p.BrandName), new(p.CategorySlug, p.CategoryName),
            p.Price, p.CompareAtPrice, p.Badges, certs.Select(c => c.Name).ToList(), images,
            vars.Any(v => v.Stock > 0), sizeOrder,
            p.ShortDescription, p.Description, p.GearDoctorNote, p.Specs.Select(s => new SpecDto(s.Label, s.Value)).ToList(),
            certs, detailVariants, related);
    }

    private async Task<int> LowStockThresholdAsync(CancellationToken ct)
    {
        var raw = await db.Settings.AsNoTracking().Where(s => s.Key == SettingKeys.LowStockThreshold).Select(s => s.Value).FirstOrDefaultAsync(ct);
        return raw is not null && int.TryParse(raw, out var n) ? n : 3;
    }

    // ---------------------------------------------------------------- lookups
    public async Task<List<CategoryDto>> CategoriesAsync(CancellationToken ct)
    {
        var rows = await db.Categories.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.SortOrder).ThenBy(c => c.Id)
            .Select(c => new
            {
                c.Id, c.Name, c.Slug, c.ImageKey, c.SortOrder, c.IsActive,
                Count = c.Products.Count(p => p.Status == ProductStatus.Published && p.DeletedAt == null),
            }).ToListAsync(ct);
        return rows.Select(c => new CategoryDto(c.Id, c.Name, c.Slug, c.ImageKey is null ? null : files.GetPublicUrl(c.ImageKey),
            c.SortOrder, c.IsActive, c.Count)).ToList();
    }

    public async Task<List<BrandDto>> BrandsAsync(CancellationToken ct)
    {
        var rows = await db.Brands.AsNoTracking().Where(b => b.IsActive).OrderBy(b => b.SortOrder).ThenBy(b => b.Name).ToListAsync(ct);
        return rows.Select(b => new BrandDto(b.Id, b.Name, b.Slug, b.LogoKey is null ? null : files.GetPublicUrl(b.LogoKey), b.IsActive)).ToList();
    }

    public Task<List<CertificationDto>> CertificationsAsync(CancellationToken ct) => db.Certifications.AsNoTracking()
        .OrderBy(c => c.Id).Select(c => new CertificationDto(c.Id, c.Code, c.Name, c.Description)).ToListAsync(ct);

    // ---------------------------------------------------------------- settings
    public async Task<PublicSettingsDto> PublicSettingsAsync(CancellationToken ct)
    {
        var map = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        JsonElement? Get(string k)
        {
            if (!map.TryGetValue(k, out var raw)) return null;
            try { return JsonDocument.Parse(raw).RootElement.Clone(); } catch (JsonException) { return null; }
        }
        string? Str(string k) => Get(k) is { ValueKind: JsonValueKind.String } e ? e.GetString() : null;
        int Int(string k, int d) => Get(k) is { ValueKind: JsonValueKind.Number } e && e.TryGetInt32(out var n) ? n : d;
        bool Bool(string k, bool d) => Get(k) is { ValueKind: JsonValueKind.True or JsonValueKind.False } e ? e.GetBoolean() : d;

        return new PublicSettingsDto(Str(SettingKeys.WhatsappNumber), Str(SettingKeys.PhoneDisplay), Str(SettingKeys.Email),
            Str(SettingKeys.City), Str(SettingKeys.Address), Str(SettingKeys.Hours),
            Int(SettingKeys.DeliveryFee, 0), Bool(SettingKeys.CodEnabled, true), Bool(SettingKeys.BankTransferEnabled, false),
            turnstile.SiteKey);
    }
}
