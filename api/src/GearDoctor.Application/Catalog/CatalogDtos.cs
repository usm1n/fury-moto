namespace GearDoctor.Application.Catalog;

public sealed record ProductListQuery(
    string? Category = null, string? Brand = null, string? Size = null, string? Cert = null,
    int? MinPrice = null, int? MaxPrice = null, bool? InStock = null, string? Q = null, string? Sort = null,
    int Page = 1, int PageSize = 24);

public sealed record ImageDto(int Id, string Url, string ThumbUrl, int Width, int Height, string Alt);
public sealed record SlugName(string Slug, string Name);

public sealed record ProductCardDto(
    string Slug, string Title, SlugName Brand, SlugName Category, int Price, int? CompareAtPrice,
    IReadOnlyList<string> Badges, IReadOnlyList<string> Certifications, IReadOnlyList<ImageDto> Images,
    bool InStock, IReadOnlyList<string> Sizes);

public sealed record SpecDto(string Label, string Value);
public sealed record CertificationDto(int Id, string Code, string Name, string Description);
public sealed record DetailVariantDto(string Size, string Color, string? ColorHex, int Price, int Available, bool LowStock);

public sealed record ProductDetailDto(
    string Slug, string Title, SlugName Brand, SlugName Category, int Price, int? CompareAtPrice,
    IReadOnlyList<string> Badges, IReadOnlyList<string> Certifications, IReadOnlyList<ImageDto> Images,
    bool InStock, IReadOnlyList<string> Sizes,
    string ShortDescription, string Description, string GearDoctorNote,
    IReadOnlyList<SpecDto> Specs, IReadOnlyList<CertificationDto> CertificationDetails,
    IReadOnlyList<DetailVariantDto> Variants, IReadOnlyList<ProductCardDto> Related);

public sealed record FacetBrand(string Slug, string Name, int Count);
public sealed record FacetCert(string Code, string Name);
public sealed record FacetsDto(IReadOnlyList<FacetBrand> Brands, IReadOnlyList<string> Sizes,
    IReadOnlyList<FacetCert> Certifications, int MinPrice, int MaxPrice);

public sealed record CategoryDto(int Id, string Name, string Slug, string? ImageUrl, int SortOrder, bool IsActive, int ProductCount);
public sealed record BrandDto(int Id, string Name, string Slug, string? LogoUrl, bool IsActive);

public sealed record PublicSettingsDto(
    string? WhatsappNumber, string? PhoneDisplay, string? Email, string? City, string? Address, string? Hours,
    int DeliveryFee, bool CodEnabled, bool BankTransferEnabled, string TurnstileSiteKey);
