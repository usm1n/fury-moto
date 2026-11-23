using GearDoctor.Api.Infrastructure;

namespace GearDoctor.Api.Endpoints;

/// <summary>
/// Route-group wiring. Each area lives in its own file (one owner per file, see docs/CONTRACTS.md):
///   PublicCatalogEndpoints.cs   GET /api/products …, categories, brands, certifications, settings/public
///   OrderEndpoints.cs           POST /api/orders, POST /api/cart/validate
///   AuthEndpoints.cs            /api/auth/*
///   Admin/*.cs                  /api/admin/* (Admin role + CSRF applied here, once)
/// </summary>
public static class Groups
{
    public static IEndpointRouteBuilder MapAdmin(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin")
            .RequireAuthorization(Platform.AdminPolicy)
            .RequireCsrf()
            .WithTags("Admin");
        Admin.AdminCatalogEndpoints.Map(admin);
        Admin.AdminProductEndpoints.Map(admin);
        Admin.AdminImageEndpoints.Map(admin);
        Admin.AdminOrderEndpoints.Map(admin);
        Admin.AdminSettingsEndpoints.Map(admin);
        return app;
    }
}
