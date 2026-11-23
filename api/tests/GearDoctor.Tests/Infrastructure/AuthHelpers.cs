using System.Net;
using System.Net.Http.Json;
using GearDoctor.Api.Infrastructure;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Tests.Infrastructure;

/// <summary>Identity seeding + a cookie-aware client for the admin auth flow.</summary>
public static class AuthHelpers
{
    public const string AdminRole = "Admin";
    public static readonly Uri BaseAddress = new("https://localhost");   // cookies are Secure

    public static string UniqueEmail(string prefix) => $"{prefix}-{Guid.NewGuid():N}@test.local";

    public static Task<AppUser> CreateAdminAsync(ApiFactory f, string email, string password, bool mustChange = false) =>
        CreateUserAsync(f, email, password, mustChange, admin: true);

    /// <summary>Creates a user via UserManager (lockout enabled, like the seeder). Non-admin unless <paramref name="admin"/>.</summary>
    public static async Task<AppUser> CreateUserAsync(ApiFactory f, string email, string password, bool mustChange = false, bool admin = false)
    {
        await using var scope = f.Services.CreateAsyncScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        if (!await roles.RoleExistsAsync(AdminRole)) await roles.CreateAsync(new IdentityRole(AdminRole));

        var user = new AppUser
        {
            UserName = email, Email = email, EmailConfirmed = true,
            MustChangePassword = mustChange, LockoutEnabled = true,
        };
        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded)
            throw new InvalidOperationException("CreateUser failed: " + string.Join("; ", created.Errors.Select(e => e.Description)));
        if (admin) await users.AddToRoleAsync(user, AdminRole);
        return user;
    }

    public static IEnumerable<string> SetCookies(HttpResponseMessage res) =>
        res.Headers.TryGetValues("Set-Cookie", out var values) ? values : [];

    internal static string NextForwardedIp()
    {
        var n = Interlocked.Increment(ref _ipSeq);
        return $"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}";
    }
    private static int _ipSeq;
}

/// <summary>
/// Minimal cookie jar for TestServer clients: stores Set-Cookie responses and replays them.
/// (WebApplicationFactory's HandleCookies hides the jar; we need to read cookie values.)
/// </summary>
public sealed class CookieJarHandler(CookieContainer jar) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var header = jar.GetCookieHeader(request.RequestUri!);
        if (header.Length > 0) request.Headers.TryAddWithoutValidation("Cookie", header);
        var res = await base.SendAsync(request, ct);
        if (res.Headers.TryGetValues("Set-Cookie", out var values))
            foreach (var v in values) jar.SetCookies(request.RequestUri!, v);
        return res;
    }
}

/// <summary>
/// One browser-like client: its own cookie jar, its own client IP (X-Forwarded-For, so the per-IP
/// login/order rate-limit partitions don't interfere across tests).
/// </summary>
public sealed class ApiSession : IDisposable
{
    private readonly CookieContainer _jar = new();
    public HttpClient Http { get; }

    public ApiSession(ApiFactory f)
    {
        Http = f.CreateDefaultClient(AuthHelpers.BaseAddress, new CookieJarHandler(_jar));
        Http.DefaultRequestHeaders.Add("X-Forwarded-For", AuthHelpers.NextForwardedIp());
    }

    /// <summary>Client with no cookie handling: used to replay a captured cookie by hand.</summary>
    public static HttpClient Raw(ApiFactory f)
    {
        var c = f.CreateDefaultClient(AuthHelpers.BaseAddress);
        c.DefaultRequestHeaders.Add("X-Forwarded-For", AuthHelpers.NextForwardedIp());
        return c;
    }

    public string? Cookie(string name) => _jar.GetCookies(new Uri(AuthHelpers.BaseAddress, "/api/"))[name]?.Value;
    public string? AuthCookie => Cookie(Platform.AuthCookie);
    public string? CsrfToken => Cookie(Platform.CsrfCookie);

    public Task<HttpResponseMessage> LoginAsync(string email, string password) =>
        Http.PostAsJsonAsync("/api/auth/login", new { email, password });

    /// <summary>GET /api/auth/csrf (204) sets the antiforgery cookies.</summary>
    public async Task FetchCsrfAsync()
    {
        using var res = await Http.GetAsync("/api/auth/csrf");
        res.EnsureSuccessStatusCode();
    }

    /// <summary>Sends a request, echoing the gd_csrf cookie in X-CSRF-Token when <paramref name="withCsrf"/>.</summary>
    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null, bool withCsrf = true)
    {
        var req = new HttpRequestMessage(method, url);
        if (body is not null) req.Content = JsonContent.Create(body);
        if (withCsrf && CsrfToken is { } token) req.Headers.TryAddWithoutValidation(Platform.CsrfHeader, token);
        return Http.SendAsync(req);
    }

    public void Dispose() => Http.Dispose();
}
