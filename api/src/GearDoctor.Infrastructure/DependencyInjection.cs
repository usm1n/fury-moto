using Amazon.S3;
using GearDoctor.Application.Common;
using GearDoctor.Infrastructure.Persistence;
using GearDoctor.Infrastructure.Storage;
using GearDoctor.Infrastructure.Turnstile;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace GearDoctor.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers EF Core (Neon/Postgres), Identity stores, Data Protection keys in Postgres,
    /// R2 storage and Turnstile. Configuration comes from environment variables only
    /// (see /.env.example); nothing secret lives in appsettings.
    /// </summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var cs = ConnectionStrings.Normalize(config["NEON_DATABASE_URL"] ?? config.GetConnectionString("Default")
            ?? throw new InvalidOperationException("NEON_DATABASE_URL is not set"));

        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(cs, npg =>
        {
            // Neon scales to zero: the first query after idle can take a few hundred ms to resume.
            npg.EnableRetryOnFailure(maxRetryCount: 4, maxRetryDelay: TimeSpan.FromSeconds(3), errorCodesToAdd: null);
            npg.CommandTimeout(15);
        }));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddIdentityCore<AppUser>(o =>
            {
                o.Password.RequiredLength = 12;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = true;
                o.Password.RequireUppercase = true;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                o.Lockout.AllowedForNewUsers = true;
                o.User.RequireUniqueEmail = true;
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<AppDbContext>();

        // Serverless instances don't share memory: keys must be shared, or antiforgery
        // tokens issued by one instance fail on another.
        services.AddDataProtection()
            .SetApplicationName("GearDoctor")
            .PersistKeysToDbContext<AppDbContext>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IAuditLog, AuditLog>();

        // Cloudflare R2 (S3-compatible). Optional in local dev: without R2_* vars uploads are disabled.
        services.Configure<R2Options>(o =>
        {
            o.AccountId = config["R2_ACCOUNT_ID"] ?? "";
            o.AccessKeyId = config["R2_ACCESS_KEY_ID"] ?? "";
            o.SecretAccessKey = config["R2_SECRET_ACCESS_KEY"] ?? "";
            o.Bucket = config["R2_BUCKET"] ?? "";
            o.PublicBaseUrl = (config["R2_PUBLIC_BASE_URL"] ?? "").TrimEnd('/');
            o.ServiceUrl = config["R2_SERVICE_URL"];   // override for local S3-compatible testing
        });
        services.AddSingleton<IAmazonS3>(sp => R2FileStorage.CreateClient(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<R2Options>>().Value));
        services.AddSingleton<IFileStorage>(sp =>
        {
            var r2 = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<R2Options>>().Value;
            // Local development without a Cloudflare account: a disk-backed stand-in with the same
            // presigned-PUT flow. Never used outside Development.
            // Opt-in only (DEV_LOCAL_STORAGE=1) so tests and normal runs keep production URL behaviour.
            var dev = string.Equals(config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase)
                      && config["DEV_LOCAL_STORAGE"] == "1";
            return !r2.IsConfigured && dev
                ? new LocalDevFileStorage()
                : new R2FileStorage(sp.GetRequiredService<IAmazonS3>(), sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<R2Options>>());
        });

        services.Configure<TurnstileOptions>(o =>
        {
            o.SecretKey = config["TURNSTILE_SECRET"] ?? "";
            o.SiteKey = config["TURNSTILE_SITE_KEY"] ?? "";
        });
        services.AddHttpClient<ITurnstileVerifier, TurnstileVerifier>(c => c.Timeout = TimeSpan.FromSeconds(5));

        return services;
    }
}

public static class ConnectionStrings
{
    /// <summary>
    /// Neon hands out URIs (postgresql://user:pass@host/db?sslmode=require). Npgsql wants
    /// key=value pairs, so convert; key=value strings pass through unchanged.
    /// </summary>
    public static string Normalize(string raw)
    {
        if (!raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)) return raw;

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
            // serverless: short-lived instances, keep pools small; Neon pooler handles fan-in
            MaxPoolSize = 10,
            Timeout = 15,
        };
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        if (query["sslmode"] is { } ssl) b.SslMode = Enum.Parse<SslMode>(ssl, ignoreCase: true);
        else if (!uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) b.SslMode = SslMode.Require;
        return b.ConnectionString;
    }
}
