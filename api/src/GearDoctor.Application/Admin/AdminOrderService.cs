using FluentValidation;
using GearDoctor.Application.Common;
using GearDoctor.Application.Orders;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

/// <summary>Admin order list/detail/notes. Status changes delegate to <see cref="OrderService.ChangeStatusAsync"/>.</summary>
public sealed class AdminOrderService(IAppDbContext db, OrderService orders, ICurrentUser currentUser, IClock clock,
    IValidator<AddNoteRequest> noteValidator)
{
    public async Task<Result<OrderRowPage>> ListAsync(OrderStatus? status, DateOnly? from, DateOnly? to, string? q, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        IQueryable<Order> baseQ = db.Orders.AsNoTracking();
        if (from is { } f) { var start = new DateTimeOffset(f.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero); baseQ = baseQ.Where(o => o.CreatedAt >= start); }
        if (to is { } t) { var end = new DateTimeOffset(t.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero); baseQ = baseQ.Where(o => o.CreatedAt < end); }
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            baseQ = baseQ.Where(o => o.OrderNumber.ToLower().Contains(term) || o.CustomerName.ToLower().Contains(term) || o.Phone.Contains(term));
        }

        var counts = await baseQ.GroupBy(o => o.Status).Select(g => new { g.Key, N = g.Count() }).ToListAsync(ct);
        var countsByStatus = Enum.GetValues<OrderStatus>().ToDictionary(s => s.ToString(), s => counts.FirstOrDefault(c => c.Key == s)?.N ?? 0);

        var filtered = status is { } st ? baseQ.Where(o => o.Status == st) : baseQ;
        var total = await filtered.CountAsync(ct);
        var rows = await filtered.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(o => new OrderRowDto(o.Id, o.OrderNumber, o.CustomerName, o.Phone, o.City, o.Total,
                o.Items.Sum(i => i.Quantity), o.Status, o.PaymentMethod, o.CreatedAt))
            .ToListAsync(ct);
        return new OrderRowPage(rows, page, pageSize, total, countsByStatus);
    }

    public async Task<Result<AdminOrderDto>> GetAsync(int id, CancellationToken ct = default)
    {
        var o = await db.Orders.AsNoTracking().Include(x => x.Items).Include(x => x.History).AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return o is null ? Error.NotFound("Order") : await MapAsync(o, ct);
    }

    public async Task<Result<AdminOrderDto>> ChangeStatusAsync(int id, ChangeStatusRequest req, CancellationToken ct = default)
    {
        if (req.Note is { Length: > 500 }) return Error.Validation("note", "Note is at most 500 characters.");
        var r = await orders.ChangeStatusAsync(id, req, ct);
        if (!r.IsSuccess) return r.Error!;
        return await GetAsync(id, ct);
    }

    public async Task<Result<AdminOrderDto>> AddNoteAsync(int id, AddNoteRequest req, CancellationToken ct = default)
    {
        var v = await noteValidator.ValidateAsync(req, ct);
        if (!v.IsValid)
            return Error.Validation(v.Errors.GroupBy(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()));
        var status = await db.Orders.Where(o => o.Id == id).Select(o => (OrderStatus?)o.Status).FirstOrDefaultAsync(ct);
        if (status is null) return Error.NotFound("Order");
        db.OrderStatusEvents.Add(new OrderStatusEvent
        {
            OrderId = id, FromStatus = status, ToStatus = status.Value, Note = req.Note!.Trim(),
            ChangedByUserId = currentUser.UserId, At = clock.Now,
        });
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    private async Task<AdminOrderDto> MapAsync(Order o, CancellationToken ct)
    {
        var userIds = o.History.Select(h => h.ChangedByUserId).Where(x => x is not null).Distinct().ToArray();
        var emails = new Dictionary<string, string>();
        if (userIds.Length > 0)
        {
            var rows = await db.Database.SqlQuery<UserEmail>($"SELECT \"Id\", \"Email\" FROM \"AspNetUsers\" WHERE \"Id\" = ANY({userIds})").ToListAsync(ct);
            foreach (var u in rows) if (u.Email is not null) emails[u.Id] = u.Email;
        }
        var items = o.Items.OrderBy(i => i.Id)
            .Select(i => new AdminOrderItemDto(i.ProductId, i.VariantId, i.TitleSnapshot, i.SizeSnapshot, i.ColorSnapshot, i.UnitPrice, i.Quantity, i.UnitPrice * i.Quantity)).ToList();
        var history = o.History.OrderBy(h => h.At).ThenBy(h => h.Id)
            .Select(h => new OrderHistoryDto(h.FromStatus, h.ToStatus, h.Note,
                h.ChangedByUserId is { } uid ? emails.GetValueOrDefault(uid) : null, h.At)).ToList();
        var wa = OrderService.WhatsappUrl(OrderService.ToInternational(o.Phone), OrderService.BuildAdminMessage(o));
        return new AdminOrderDto(o.Id, o.OrderNumber, o.CustomerName, o.Phone, o.City, o.Total, items.Sum(i => i.Quantity), o.Status,
            o.PaymentMethod, o.CreatedAt, o.Address, o.Notes, o.Subtotal, o.DeliveryFee, items, history, wa, o.StockDeducted, o.Version.ToString());
    }

    private sealed record UserEmail(string Id, string? Email);
}
