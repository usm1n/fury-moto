namespace GearDoctor.Domain;

// All money is integer PKR. No floats anywhere.

public enum ProductStatus { Draft, Published, Archived }
public enum OrderStatus { New, Confirmed, Shipped, Delivered, Cancelled }
public enum PaymentMethod { COD, BankTransfer }

public sealed class Category
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public int SortOrder { get; set; }
    public string? ImageKey { get; set; }
    public bool IsActive { get; set; } = true;
    public List<Product> Products { get; } = [];
}

public sealed class Brand
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public int SortOrder { get; set; }
    public string? LogoKey { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class Certification
{
    public int Id { get; set; }
    /// <summary>DOT, ECE_22_06, FIM, SNELL, CE_L1, CE_L2</summary>
    public required string Code { get; set; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
}

/// <summary>One row of the ordered key/value spec table (stored as jsonb array).</summary>
public sealed record Spec(string Label, string Value);

public sealed class Product
{
    public int Id { get; set; }
    public required string Title { get; set; }
    public required string Slug { get; set; }
    public int BrandId { get; set; }
    public Brand Brand { get; set; } = null!;
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public string ShortDescription { get; set; } = "";
    public string Description { get; set; } = "";
    public string GearDoctorNote { get; set; } = "";
    public List<Spec> Specs { get; set; } = [];
    public int Price { get; set; }
    public int? CompareAtPrice { get; set; }
    public List<string> Badges { get; set; } = [];
    public ProductStatus Status { get; set; } = ProductStatus.Draft;
    public bool IsFeatured { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    /// <summary>Postgres xmin optimistic-concurrency token.</summary>
    public uint Version { get; set; }

    public List<ProductVariant> Variants { get; } = [];
    public List<ProductImage> Images { get; } = [];
    public List<Certification> Certifications { get; } = [];
}

public sealed class ProductVariant
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public required string Size { get; set; }
    public required string Color { get; set; }
    public string? ColorHex { get; set; }
    public required string Sku { get; set; }
    public int Stock { get; set; }
    public int? PriceOverride { get; set; }
    public bool IsActive { get; set; } = true;
    public uint Version { get; set; }

    public int EffectivePrice => PriceOverride ?? Product.Price;
}

public sealed class ProductImage
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public required string StorageKey { get; set; }
    public required string ThumbKey { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string Alt { get; set; } = "";
    public int SortOrder { get; set; }
}

public sealed class Order
{
    public int Id { get; set; }
    public required string OrderNumber { get; set; }
    public required string CustomerName { get; set; }
    public required string Phone { get; set; }
    public required string City { get; set; }
    public required string Address { get; set; }
    public string? Notes { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.New;
    /// <summary>True once stock was deducted (on Confirmed); makes deduct/restore idempotent.</summary>
    public bool StockDeducted { get; set; }
    public int Subtotal { get; set; }
    public int DeliveryFee { get; set; }
    public int Total { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public uint Version { get; set; }
    public List<OrderItem> Items { get; } = [];
    public List<OrderStatusEvent> History { get; } = [];

    /// <summary>Allowed status transitions (anything else is rejected).</summary>
    public static bool CanTransition(OrderStatus from, OrderStatus to) => (from, to) switch
    {
        (OrderStatus.New, OrderStatus.Confirmed or OrderStatus.Cancelled) => true,
        (OrderStatus.Confirmed, OrderStatus.Shipped or OrderStatus.Cancelled) => true,
        (OrderStatus.Shipped, OrderStatus.Delivered or OrderStatus.Cancelled) => true,
        _ => false,
    };
}

public sealed class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int VariantId { get; set; }
    public required string TitleSnapshot { get; set; }
    public required string SizeSnapshot { get; set; }
    public required string ColorSnapshot { get; set; }
    public int UnitPrice { get; set; }
    public int Quantity { get; set; }
}

public sealed class OrderStatusEvent
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public OrderStatus? FromStatus { get; set; }
    public OrderStatus ToStatus { get; set; }
    public string? Note { get; set; }
    public string? ChangedByUserId { get; set; }
    public DateTimeOffset At { get; set; }
}

public sealed class Setting
{
    public required string Key { get; set; }
    /// <summary>JSON value (jsonb).</summary>
    public required string Value { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>Well-known setting keys.</summary>
public static class SettingKeys
{
    public const string WhatsappNumber = "whatsappNumber";
    public const string PhoneDisplay = "phoneDisplay";
    public const string Email = "email";
    public const string City = "city";
    public const string Address = "address";
    public const string Hours = "hours";
    public const string DeliveryFee = "deliveryFee";
    public const string CodEnabled = "codEnabled";
    public const string BankTransferEnabled = "bankTransferEnabled";
    public const string BankDetails = "bankDetails";
    public const string LowStockThreshold = "lowStockThreshold";
}

public static class Slugs
{
    /// <summary>"AGV Pista GP RR — Carbon!" -> "agv-pista-gp-rr-carbon"</summary>
    public static string From(string text)
    {
        var sb = new System.Text.StringBuilder(text.Length);
        var dash = false;
        foreach (var ch in text.Normalize(System.Text.NormalizationForm.FormD))
        {
            var c = char.ToLowerInvariant(ch);
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9') { sb.Append(c); dash = false; }
            else if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.NonSpacingMark) { }
            else if (!dash && sb.Length > 0) { sb.Append('-'); dash = true; }
        }
        return sb.ToString().Trim('-');
    }
}
