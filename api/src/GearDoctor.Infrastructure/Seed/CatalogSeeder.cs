using GearDoctor.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;

namespace GearDoctor.Infrastructure.Seed;

/// <summary>
/// Imports categories, brands and products from seed/catalog.json (exported from the
/// storefront's old site.config.js by tools/export-seed.mjs). STUB — implemented by the
/// Phase 1 seed agent. Must be idempotent: do nothing when Products already has rows.
/// </summary>
public static class CatalogSeeder
{
    public static Task ImportAsync(AppDbContext db, string path, ILogger log)
    {
        log.LogInformation("Catalog import not implemented yet ({Path})", path);
        return Task.CompletedTask;
    }
}
