using FluentValidation;
using GearDoctor.Application.Catalog;

namespace GearDoctor.Application.Admin;

public sealed record ProductUpsert(
    string Title, string? Slug, int BrandId, int CategoryId,
    string? ShortDescription, string? Description, string? GearDoctorNote,
    List<SpecDto>? Specs, int Price, int? CompareAtPrice, List<string>? Badges,
    List<int>? CertificationIds, bool IsFeatured, string? Version);

public sealed record VariantDto(int Id, string Size, string Color, string? ColorHex, string Sku, int Stock,
    int? PriceOverride, bool IsActive, string Version);

public sealed record VariantUpsert(int? Id, string Size, string Color, string? ColorHex, string? Sku, int Stock,
    int? PriceOverride, bool? IsActive, string? Version);

public sealed record AdminProductDto(
    int Id, string Title, string Slug, int BrandId, int CategoryId,
    string ShortDescription, string Description, string GearDoctorNote,
    IReadOnlyList<SpecDto> Specs, int Price, int? CompareAtPrice, IReadOnlyList<string> Badges,
    IReadOnlyList<int> CertificationIds, bool IsFeatured, string Version, string Status,
    IReadOnlyList<VariantDto> Variants, IReadOnlyList<ImageDto> Images,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string StorefrontUrl);

public sealed record AdminProductRow(int Id, string Title, string Slug, string Status, string Brand, string Category,
    int Price, int TotalStock, string? ThumbUrl, bool IsFeatured, DateTimeOffset UpdatedAt);

public sealed record AdminProductQuery(string? Q = null, string? Status = null, int? Category = null, int? Brand = null,
    int Page = 1, int PageSize = 25);

public sealed record StockAdjust(int Delta, string? Reason);
public sealed record ReorderRequest(List<int>? Ids);

public sealed record CategoryUpsert(string Name, string? Slug, string? ImageKey, bool? IsActive);
public sealed record BrandUpsert(string Name, string? Slug, string? LogoKey, bool? IsActive);

public sealed class ProductUpsertValidator : AbstractValidator<ProductUpsert>
{
    public static readonly string[] AllowedBadges = ["New", "Rider's pick", "Sale"];
    public ProductUpsertValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(140);
        RuleFor(x => x.Slug).MaximumLength(160);
        RuleFor(x => x.BrandId).GreaterThan(0);
        RuleFor(x => x.CategoryId).GreaterThan(0);
        RuleFor(x => x.ShortDescription).MaximumLength(300);
        RuleFor(x => x.Description).MaximumLength(8000);
        RuleFor(x => x.GearDoctorNote).MaximumLength(500);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CompareAtPrice).GreaterThan(x => x.Price).When(x => x.CompareAtPrice.HasValue)
            .WithMessage("Compare-at price must be higher than the price.");
        RuleFor(x => x.Specs).Must(s => s is null || s.Count <= 30).WithMessage("At most 30 spec rows.");
        RuleForEach(x => x.Specs).ChildRules(s =>
        {
            s.RuleFor(y => y.Label).NotEmpty().MaximumLength(80);
            s.RuleFor(y => y.Value).NotEmpty().MaximumLength(300);
        });
        RuleForEach(x => x.Badges).Must(b => AllowedBadges.Contains(b))
            .WithMessage("Badge must be one of: New, Rider's pick, Sale.");
    }
}

public sealed class VariantUpsertValidator : AbstractValidator<VariantUpsert>
{
    public VariantUpsertValidator()
    {
        RuleFor(x => x.Size).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Color).NotEmpty().MaximumLength(40);
        RuleFor(x => x.ColorHex).Matches("^#[0-9A-Fa-f]{6}$").When(x => !string.IsNullOrEmpty(x.ColorHex));
        RuleFor(x => x.Sku).MaximumLength(64);
        RuleFor(x => x.Stock).GreaterThanOrEqualTo(0);
        RuleFor(x => x.PriceOverride).GreaterThanOrEqualTo(0).When(x => x.PriceOverride.HasValue);
    }
}

public sealed class StockAdjustValidator : AbstractValidator<StockAdjust>
{
    public StockAdjustValidator()
    {
        RuleFor(x => x.Delta).NotEqual(0).InclusiveBetween(-100000, 100000);
        RuleFor(x => x.Reason).MaximumLength(200);
    }
}

public sealed class CategoryUpsertValidator : AbstractValidator<CategoryUpsert>
{
    public CategoryUpsertValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Slug).MaximumLength(80);
        RuleFor(x => x.ImageKey).MaximumLength(300);
    }
}

public sealed class BrandUpsertValidator : AbstractValidator<BrandUpsert>
{
    public BrandUpsertValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Slug).MaximumLength(80);
        RuleFor(x => x.LogoKey).MaximumLength(300);
    }
}
