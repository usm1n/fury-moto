using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GearDoctor.Infrastructure.Persistence;

/// <summary>
/// Used by `dotnet ef` (migrations add / bundle). Reads NEON_DIRECT_URL (direct, non-pooled —
/// migrations need session-level features the pooler doesn't give), then NEON_DATABASE_URL,
/// then the local dev database.
/// </summary>
public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var raw = Environment.GetEnvironmentVariable("NEON_DIRECT_URL")
                  ?? Environment.GetEnvironmentVariable("NEON_DATABASE_URL")
                  ?? "Host=localhost;Port=5432;Database=geardoctor;Username=geardoctor;Password=geardoctor_dev";
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionStrings.Normalize(raw), o => o.MigrationsHistoryTable("__ef_migrations_history"))
            .Options;
        return new AppDbContext(opts);
    }
}
