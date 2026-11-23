using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using GearDoctor.Infrastructure.Persistence;
using GearDoctor.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace GearDoctor.Tests.AdminCatalog;

/// <summary>Logged-in admin HTTP client (cookies + CSRF header) for the admin API tests.</summary>
public sealed class AdminHttp
{
    public const string Email = "admin-catalog-tests@example.com";
    public const string Password = "Test-Passw0rd!x";
    public HttpClient Client { get; }
    private string _csrf = "";

    private AdminHttp(HttpClient c) => Client = c;

    public static HttpClient NewClient(ApiFactory f) =>
        f.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });

    private static Task<AdminHttp>? _shared;
    /// <summary>Logs in once per test run (login is rate limited to 5/min per IP).</summary>
    public static Task<AdminHttp> LoginAsync(ApiFactory f) => _shared ??= LoginCoreAsync(f);

    private static async Task<AdminHttp> LoginCoreAsync(ApiFactory f)
    {
        await using (var scope = f.Services.CreateAsyncScope())
        {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (!await roles.RoleExistsAsync("Admin")) await roles.CreateAsync(new IdentityRole("Admin"));
            var u = await users.FindByEmailAsync(Email);
            if (u is null)
            {
                u = new AppUser { UserName = Email, Email = Email, EmailConfirmed = true, MustChangePassword = false };
                var r = await users.CreateAsync(u, Password);
                Assert.True(r.Succeeded, string.Join(";", r.Errors.Select(e => e.Description)));
                await users.AddToRoleAsync(u, "Admin");
            }
            else { u.MustChangePassword = false; await users.UpdateAsync(u); await users.ResetAccessFailedCountAsync(u); }
        }
        var a = new AdminHttp(NewClient(f));
        var login = await a.Client.PostAsJsonAsync("/api/auth/login", new { email = Email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await a.RefreshCsrfAsync();
        return a;
    }

    public async Task RefreshCsrfAsync()
    {
        var res = await Client.GetAsync("/api/auth/csrf");
        var cookie = res.Headers.GetValues("Set-Cookie").First(c => c.StartsWith("gd_csrf="));
        _csrf = Uri.UnescapeDataString(cookie["gd_csrf=".Length..].Split(';')[0]);
    }

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task<HttpResponseMessage> Send(HttpMethod m, string url, object? body = null, bool csrf = true)
    {
        var req = new HttpRequestMessage(m, url);
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);
        if (csrf && m != HttpMethod.Get) req.Headers.Add("X-CSRF-Token", _csrf);
        return Client.SendAsync(req);
    }

    public Task<HttpResponseMessage> Get(string url) => Send(HttpMethod.Get, url);
    public Task<HttpResponseMessage> Post(string url, object? body = null) => Send(HttpMethod.Post, url, body ?? new { });
    public Task<HttpResponseMessage> Put(string url, object body) => Send(HttpMethod.Put, url, body);
    public Task<HttpResponseMessage> Delete(string url) => Send(HttpMethod.Delete, url);

    public static async Task<JsonElement> Body(HttpResponseMessage r, HttpStatusCode expect)
    {
        var text = await r.Content.ReadAsStringAsync();
        Assert.True(expect == r.StatusCode, $"expected {expect} got {r.StatusCode}: {text}");
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }
}
