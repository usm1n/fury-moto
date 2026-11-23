using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using GearDoctor.Application.Common;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

namespace GearDoctor.Api.Infrastructure;

/// <summary>Cross-cutting HTTP concerns shared by every endpoint group.</summary>
public static class Platform
{
    public const string AuthCookie = "gd_auth";
    public const string CsrfCookie = "gd_csrf";
    public const string CsrfHeader = "X-CSRF-Token";
    public const string AdminPolicy = "Admin";
    public const string AdminRole = "Admin";
    public const string LoginLimiter = "login";
    public const string OrdersLimiter = "orders";

    public static IServiceCollection AddApiPlatform(this IServiceCollection s, IConfiguration config, IWebHostEnvironment env)
    {
        s.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
        {
            ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
            ctx.ProblemDetails.Extensions.Remove("exception");   // never leak stack traces
        });
        s.AddOpenApi();
        s.AddHttpContextAccessor();
        s.AddScoped<ICurrentUser, HttpCurrentUser>();

        // ---- auth: JWT carried in an httpOnly cookie (not a header) ----
        var signingKey = config["JWT_SIGNING_KEY"];
        if (string.IsNullOrEmpty(signingKey))
        {
            if (!env.IsDevelopment()) throw new InvalidOperationException("JWT_SIGNING_KEY is not set");
            signingKey = "dev-only-signing-key-change-me-0123456789abcdef";   // local dev only
        }
        if (Encoding.UTF8.GetByteCount(signingKey) < 32) throw new InvalidOperationException("JWT_SIGNING_KEY must be ≥ 32 bytes");
        // Without a real secret the verifier would use Cloudflare's always-pass test key: fail closed
        // by refusing to start outside Development (bot protection must never be silently off).
        if (!env.IsDevelopment() && string.IsNullOrEmpty(config["TURNSTILE_SECRET"]))
            throw new InvalidOperationException("TURNSTILE_SECRET is not set");
        s.AddSingleton(new JwtSettings(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), "geardoctor", "geardoctor-admin", TimeSpan.FromHours(8)));

        s.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = "geardoctor",
                    ValidAudience = "geardoctor-admin",
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                    ClockSkew = TimeSpan.FromMinutes(1),
                    RoleClaimType = "role",
                    NameClaimType = "email",
                };
                o.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx => { ctx.Token = ctx.Request.Cookies[AuthCookie]; return Task.CompletedTask; },
                    // Stateless JWT + one cheap lookup: the token is only valid while the user still exists,
                    // isn't locked out and has the same security stamp (rotated on password change).
                    OnTokenValidated = async ctx =>
                    {
                        var users = ctx.HttpContext.RequestServices.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<GearDoctor.Infrastructure.Persistence.AppUser>>();
                        var user = await users.FindByIdAsync(ctx.Principal?.FindFirst("sub")?.Value ?? "");
                        if (user is null || await users.IsLockedOutAsync(user) || user.SecurityStamp != ctx.Principal?.FindFirst("ss")?.Value)
                            ctx.Fail("Session is no longer valid");
                    },
                };
            });
        s.AddAuthorizationBuilder().AddPolicy(AdminPolicy, p => p.RequireAuthenticatedUser().RequireRole(AdminRole));

        // ---- CSRF: ASP.NET antiforgery, request token echoed in X-CSRF-Token ----
        s.AddAntiforgery(o =>
        {
            o.HeaderName = CsrfHeader;
            o.Cookie.Name = "gd_af";
            o.Cookie.HttpOnly = true;
            o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.Path = "/api";
        });

        // ---- rate limits (per instance; Turnstile/lockout are the real gates) ----
        s.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(LoginLimiter, ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
            o.AddPolicy(OrdersLimiter, ctx => RateLimitPartition.GetFixedWindowLimiter(ClientIp(ctx),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
            o.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.ContentType = "application/problem+json";
                await ctx.HttpContext.Response.WriteAsJsonAsync(new { type = "about:blank", title = "Too many requests", status = 429 }, ct);
            };
        });

        s.Configure<ForwardedHeadersOptions>(o =>
        {
            // Behind Vercel's edge: trust its X-Forwarded-* (the container is only reachable through it).
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
            o.KnownIPNetworks.Clear();
            o.KnownProxies.Clear();
        });
        return s;
    }

    public static WebApplication UseApiPlatform(this WebApplication app)
    {
        app.UseForwardedHeaders();
        app.UseExceptionHandler();
        app.UseStatusCodePages();
        app.Use(async (ctx, next) =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "strict-origin-when-cross-origin";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            h["Cross-Origin-Opener-Policy"] = "same-origin";
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            if (ctx.Request.IsHttps || ctx.Request.Headers["X-Forwarded-Proto"] == "https")
                h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            await next();
        });
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }

    public static string ClientIp(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    /// <summary>Public, CDN-cacheable GET (Vercel edge honours s-maxage).</summary>
    public static void CachePublic(this HttpResponse res) =>
        res.Headers.CacheControl = "public, s-maxage=60, stale-while-revalidate=600";

    /// <summary>Endpoint filter: validate the antiforgery token on state-changing admin requests.</summary>
    public static RouteGroupBuilder RequireCsrf(this RouteGroupBuilder g) => g.AddEndpointFilter(async (ctx, next) =>
    {
        var http = ctx.HttpContext;
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            var af = http.RequestServices.GetRequiredService<IAntiforgery>();
            if (!await af.IsRequestValidAsync(http))
                return Results.Problem(title: "Missing or invalid CSRF token", statusCode: StatusCodes.Status403Forbidden);
        }
        return await next(ctx);
    });
}

public sealed record JwtSettings(SymmetricSecurityKey Key, string Issuer, string Audience, TimeSpan Lifetime);

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? User => accessor.HttpContext?.User;
    public string? UserId => User?.FindFirst("sub")?.Value;
    public string? Email => User?.FindFirst("email")?.Value;
}
