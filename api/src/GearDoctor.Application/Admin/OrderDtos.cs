using FluentValidation;
using GearDoctor.Domain;

namespace GearDoctor.Application.Admin;

public sealed record OrderRowDto(int Id, string OrderNumber, string CustomerName, string Phone, string City, int Total,
    int ItemCount, OrderStatus Status, PaymentMethod PaymentMethod, DateTimeOffset CreatedAt);

public sealed record OrderRowPage(IReadOnlyList<OrderRowDto> Items, int Page, int PageSize, int Total,
    IReadOnlyDictionary<string, int> CountsByStatus);

public sealed record AdminOrderItemDto(int ProductId, int VariantId, string Title, string Size, string Color, int UnitPrice, int Quantity, int LineTotal);

/// <summary>By = user email (resolved from the user id).</summary>
public sealed record OrderHistoryDto(OrderStatus? From, OrderStatus To, string? Note, string? By, DateTimeOffset At);

public sealed record AdminOrderDto(int Id, string OrderNumber, string CustomerName, string Phone, string City, int Total,
    int ItemCount, OrderStatus Status, PaymentMethod PaymentMethod, DateTimeOffset CreatedAt,
    string Address, string? Notes, int Subtotal, int DeliveryFee,
    IReadOnlyList<AdminOrderItemDto> Items, IReadOnlyList<OrderHistoryDto> History,
    string WhatsappUrl, bool StockDeducted, string Version);

public sealed record AddNoteRequest(string? Note);

public sealed class AddNoteValidator : AbstractValidator<AddNoteRequest>
{
    public AddNoteValidator()
    {
        RuleFor(x => x.Note).NotEmpty().WithMessage("Note is required.").MaximumLength(500);
    }
}

public sealed record DashboardLowStock(int ProductId, string Title, string Size, string Color, int Stock);
public sealed record DashboardDto(int NewOrders, long RevenueThisMonth, int OrdersThisMonth, IReadOnlyList<DashboardLowStock> LowStock);
