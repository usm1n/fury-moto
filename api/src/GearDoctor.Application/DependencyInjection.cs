using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Application;

public static class DependencyInjection
{
    /// <summary>Registers application services + all FluentValidation validators in this assembly.</summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);
        // Services register themselves here as phases add them, e.g.:
        // services.AddScoped<CatalogService>();
        return services;
    }
}
