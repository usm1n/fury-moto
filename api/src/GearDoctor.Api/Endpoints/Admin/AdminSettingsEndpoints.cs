using GearDoctor.Api.Infrastructure;
using GearDoctor.Application.Admin;

namespace GearDoctor.Api.Endpoints.Admin;

/// <summary>GET/PUT /api/admin/settings.</summary>
public static class AdminSettingsEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapGet("/settings", async (SettingsService svc, CancellationToken ct) => (await svc.GetAsync(ct)).ToHttp()).WithTags("AdminSettings");
        admin.MapPut("/settings", async (AdminSettingsDto req, SettingsService svc, CancellationToken ct) => (await svc.UpdateAsync(req, ct)).ToHttp()).WithTags("AdminSettings");
    }
}
