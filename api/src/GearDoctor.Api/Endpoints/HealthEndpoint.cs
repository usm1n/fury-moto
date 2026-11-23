using GearDoctor.Infrastructure.Persistence;

namespace GearDoctor.Api.Endpoints;

public static class HealthEndpoint
{
    /// <summary>GET /api/health → { status, db }. db = "ok" | "down". Never cached.</summary>
    public static async Task<IResult> Handle(AppDbContext db, HttpResponse res, CancellationToken ct)
    {
        res.Headers.CacheControl = "no-store";
        bool dbOk;
        try { dbOk = await db.Database.CanConnectAsync(ct); }
        catch { dbOk = false; }
        return Results.Json(new { status = dbOk ? "ok" : "degraded", db = dbOk ? "ok" : "down" },
            statusCode: dbOk ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    }
}
