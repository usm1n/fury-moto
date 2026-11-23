using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Admin;
using GearDoctor.Application.Orders;
using GearDoctor.Domain;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>/api/admin/orders*, /api/admin/dashboard.</summary>
public static class AdminOrderEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapGet("/orders", async (OrderStatus? status, DateOnly? from, DateOnly? to, string? q, int? page, int? pageSize,
                AdminOrderService svc, CancellationToken ct) =>
            (await svc.ListAsync(status, from, to, q, page ?? 1, pageSize ?? 25, ct)).ToHttp()).WithTags("AdminOrders");
        admin.MapGet("/orders/{id:int}", async (int id, AdminOrderService svc, CancellationToken ct) =>
            (await svc.GetAsync(id, ct)).ToHttp()).WithTags("AdminOrders");
        admin.MapPost("/orders/{id:int}/status", async (int id, ChangeStatusRequest req, AdminOrderService svc, CancellationToken ct) =>
            (await svc.ChangeStatusAsync(id, req, ct)).ToHttp()).WithTags("AdminOrders");
        admin.MapPost("/orders/{id:int}/notes", async (int id, AddNoteRequest req, AdminOrderService svc, CancellationToken ct) =>
            (await svc.AddNoteAsync(id, req, ct)).ToHttp()).WithTags("AdminOrders");
        admin.MapGet("/dashboard", async (DashboardService svc, CancellationToken ct) =>
            (await svc.GetAsync(ct)).ToHttp()).WithTags("AdminOrders");
    }
}
