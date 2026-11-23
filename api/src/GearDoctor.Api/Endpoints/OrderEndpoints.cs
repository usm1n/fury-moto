using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Orders;

namespace GearDoctor.Api.Endpoints;

/// <summary>Public order placement + cart re-validation (never cached).</summary>
public static class OrderEndpoints
{
    public static IEndpointRouteBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cart/validate", async (CartValidateRequest req, OrderService orders, HttpResponse res, CancellationToken ct) =>
        {
            res.Headers.CacheControl = "no-store";
            return (await orders.ValidateCartAsync(req, ct)).ToHttp();
        }).WithTags("Orders").AllowAnonymous();

        app.MapPost("/api/orders", async (CreateOrderRequest req, OrderService orders, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var result = await orders.CreateAsync(req, Platform.ClientIp(http), ct);
            return result.ToHttp(created => Results.Created($"/api/orders/{created.OrderNumber}", created));
        }).WithTags("Orders").AllowAnonymous().RequireRateLimiting(Platform.OrdersLimiter);

        return app;
    }
}
