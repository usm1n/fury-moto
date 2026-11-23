using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

public sealed class DashboardService(IAppDbContext db, IClock clock)
{
    public async Task<Result<DashboardDto>> GetAsync(CancellationToken ct = default)
    {
        var now = clock.Now.UtcDateTime;
        var monthStart = new DateTimeOffset(new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc));
        var nextMonth = monthStart.AddMonths(1);

        var newOrders = await db.Orders.CountAsync(o => o.Status == OrderStatus.New, ct);
        var month = db.Orders.AsNoTracking().Where(o => o.CreatedAt >= monthStart && o.CreatedAt < nextMonth);
        var ordersThisMonth = await month.CountAsync(ct);
        var revenue = await month.Where(o => o.Status == OrderStatus.Confirmed || o.Status == OrderStatus.Shipped || o.Status == OrderStatus.Delivered)
            .SumAsync(o => (long?)o.Total, ct) ?? 0;

        var thresholdRaw = await db.Settings.AsNoTracking().Where(s => s.Key == SettingKeys.LowStockThreshold).Select(s => s.Value).FirstOrDefaultAsync(ct);
        var threshold = thresholdRaw is not null && int.TryParse(thresholdRaw, out var n) ? n : 3;

        var low = await db.ProductVariants.AsNoTracking()
            .Where(v => v.IsActive && v.Stock <= threshold)
            .OrderBy(v => v.Stock).ThenBy(v => v.Id).Take(20)
            .Select(v => new DashboardLowStock(v.ProductId, v.Product.Title, v.Size, v.Color, v.Stock))
            .ToListAsync(ct);
        return new DashboardDto(newOrders, revenue, ordersThisMonth, low);
    }
}
