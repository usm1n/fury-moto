using System.Text.Json;
using GearDoctor.Domain;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GearDoctor.Infrastructure.Seed;

/// <summary>
/// `dotnet GearDoctor.Api.dll seed [--catalog path/to/catalog.json]`
/// Idempotent: safe to run on every deploy (CI runs it right after the migration bundle).
///   1. certifications (fixed list)
///   2. default settings (only keys that don't exist yet)
///   3. Admin role + admin user from ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD (only if no admin exists;
///      MustChangePassword = true so the initial password is single-use)
///   4. catalog import (categories, brands, products) only when the Products table is empty
///   5. content import (guides, FAQs, testimonials; seed/content.json), each only when its table is empty
/// </summary>
public static class SeedCommand
{
    public static async Task RunAsync(string[] args)
    {
        var config = new ConfigurationBuilder().AddEnvironmentVariables().Build();
        var services = new ServiceCollection()
            .AddLogging(l => l.AddSimpleConsole(o => o.SingleLine = true).AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning))
            .AddInfrastructure(config);
        await using var sp = services.BuildServiceProvider();
        await using var scope = sp.CreateAsyncScope();
        var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("seed");
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await SeedCertificationsAsync(db, log);
        await SeedSettingsAsync(db, log);
        await SeedAdminAsync(scope.ServiceProvider, config, log);

        var catalogPath = ArgValue(args, "--catalog") ?? Path.Combine(AppContext.BaseDirectory, "seed", "catalog.json");
        if (File.Exists(catalogPath)) await CatalogSeeder.ImportAsync(db, catalogPath, log);
        else log.LogInformation("No catalog file at {Path}; skipping catalog import", catalogPath);

        var contentPath = ArgValue(args, "--content") ?? Path.Combine(AppContext.BaseDirectory, "seed", "content.json");
        if (File.Exists(contentPath)) await ContentSeeder.ImportAsync(db, contentPath, log);
        else log.LogInformation("No content file at {Path}; skipping content import", contentPath);

        log.LogInformation("Seed complete");
    }

    private static string? ArgValue(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    public static readonly (string Code, string Name, string Description)[] Certifications =
    [
        ("DOT", "DOT", "US Department of Transportation FMVSS 218 helmet standard (self-certified by the maker)."),
        ("ECE_22_06", "ECE 22.06", "Current European helmet standard; tests impacts at more points and speeds, including rotational forces."),
        ("FIM", "FIM", "International racing homologation (FRHPhe); required for many track and race events."),
        ("SNELL", "SNELL", "Snell Memorial Foundation voluntary standard (M2020/M2025)."),
        ("CE_L1", "CE Level 1", "EN 1621 / EN 17092 armour or garment, level 1 impact protection."),
        ("CE_L2", "CE Level 2", "EN 1621 / EN 17092 armour or garment, level 2 (higher) impact protection."),
    ];

    private static async Task SeedCertificationsAsync(AppDbContext db, ILogger log)
    {
        var existing = await db.Certifications.Select(c => c.Code).ToListAsync();
        var added = 0;
        foreach (var (code, name, desc) in Certifications.Where(c => !existing.Contains(c.Code)))
        {
            db.Certifications.Add(new Certification { Code = code, Name = name, Description = desc });
            added++;
        }
        await db.SaveChangesAsync();
        log.LogInformation("Certifications: {Added} added", added);
    }

    private static async Task SeedSettingsAsync(AppDbContext db, ILogger log)
    {
        var defaults = new Dictionary<string, object?>
        {
            [SettingKeys.WhatsappNumber] = null,
            [SettingKeys.PhoneDisplay] = null,
            [SettingKeys.Email] = null,
            [SettingKeys.City] = null,
            [SettingKeys.Address] = null,
            [SettingKeys.Hours] = null,
            [SettingKeys.DeliveryFee] = 0,
            [SettingKeys.CodEnabled] = true,
            [SettingKeys.BankTransferEnabled] = false,
            [SettingKeys.BankDetails] = null,
            [SettingKeys.LowStockThreshold] = 3,
        };
        var existing = await db.Settings.Select(s => s.Key).ToListAsync();
        var added = 0;
        foreach (var (k, v) in defaults.Where(d => !existing.Contains(d.Key)))
        {
            db.Settings.Add(new Setting { Key = k, Value = JsonSerializer.Serialize(v), UpdatedAt = DateTimeOffset.UtcNow });
            added++;
        }
        await db.SaveChangesAsync();
        log.LogInformation("Settings: {Added} defaults added", added);
    }

    private static async Task SeedAdminAsync(IServiceProvider sp, IConfiguration config, ILogger log)
    {
        var roles = sp.GetRequiredService<RoleManager<IdentityRole>>();
        var users = sp.GetRequiredService<UserManager<AppUser>>();
        if (!await roles.RoleExistsAsync("Admin")) await roles.CreateAsync(new IdentityRole("Admin"));

        if ((await users.GetUsersInRoleAsync("Admin")).Count > 0) { log.LogInformation("Admin user already exists"); return; }

        var email = config["ADMIN_EMAIL"];
        var password = config["ADMIN_INITIAL_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            log.LogWarning("No admin exists and ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD are not set; skipping admin seed");
            return;
        }
        var user = new AppUser { UserName = email, Email = email, EmailConfirmed = true, MustChangePassword = true, LockoutEnabled = true };
        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded) throw new InvalidOperationException("Admin seed failed: " + string.Join("; ", created.Errors.Select(e => e.Description)));
        await users.AddToRoleAsync(user, "Admin");
        log.LogInformation("Admin user {Email} created (must change password on first login)", email);
    }
}
