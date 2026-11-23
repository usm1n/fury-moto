using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Application;

public static class DependencyInjection
{
    /// <summary>Registers application services + all FluentValidation validators in this assembly.</summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);
        // One registration per service; the orchestrator owns this file.
        services.AddScoped<Catalog.CatalogService>();
        services.AddScoped<Orders.OrderService>();
        services.AddScoped<Admin.AdminProductService>();
        services.AddScoped<Admin.AdminCatalogService>();
        services.AddScoped<Admin.AdminOrderService>();
        services.AddScoped<Admin.SettingsService>();
        services.AddScoped<Admin.DashboardService>();
        return services;
    }
}
