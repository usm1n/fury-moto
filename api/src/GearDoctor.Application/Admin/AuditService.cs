using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

public sealed record AuditEntryDto(long Id, DateTimeOffset At, string? By, string Action, string Entity, string? EntityId, string Summary, string? Ip);
public sealed record AlertsDto(int NewOrders, int LowStock, int SoldOut);

/// <summary>GET /api/admin/audit (filters, paging, newest first) and GET /api/admin/alerts (cheap shell-badge counts).</summary>
public sealed class AuditService(IAppDbContext db)
{
    public async Task<Result<PagedList<AuditEntryDto>>> ListAsync(string? entity, string? entityId, int? page, int? pageSize, CancellationToken ct)
    {
        var pg = Math.Max(1, page ?? 1);
        var size = Math.Clamp(pageSize ?? 50, 1, 100);
        var q = db.AuditEntries.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) { var e = entity.Trim().ToLower(); q = q.Where(a => a.Entity.ToLower() == e); }
        if (!string.IsNullOrWhiteSpace(entityId)) { var i = entityId.Trim(); q = q.Where(a => a.EntityId == i); }
        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(a => a.At).ThenByDescending(a => a.Id).Skip((pg - 1) * size).Take(size)
            .Select(a => new AuditEntryDto(a.Id, a.At, a.UserEmail, a.Action, a.Entity, a.EntityId, a.Summary, a.Ip)).ToListAsync(ct);
        return new PagedList<AuditEntryDto>(items, pg, size, total);
    }

    public async Task<AlertsDto> AlertsAsync(CancellationToken ct)
    {
        var newOrders = await db.Orders.CountAsync(o => o.Status == OrderStatus.New, ct);
        var raw = await db.Settings.AsNoTracking().Where(s => s.Key == SettingKeys.LowStockThreshold).Select(s => s.Value).FirstOrDefaultAsync(ct);
        var threshold = raw is not null && int.TryParse(raw, out var n) ? n : 3;
        var low = await db.ProductVariants.CountAsync(v => v.IsActive && v.Product.Status == ProductStatus.Published
            && v.Stock > 0 && v.Stock <= threshold, ct);
        var soldOut = await db.Products.CountAsync(p => p.Status == ProductStatus.Published
            && p.Variants.Any(v => v.IsActive) && !p.Variants.Any(v => v.IsActive && v.Stock > 0), ct);
        return new AlertsDto(newOrders, low, soldOut);
    }
}
