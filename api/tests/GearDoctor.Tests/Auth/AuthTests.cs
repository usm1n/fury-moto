using System.Net;
using System.Net.Http.Json;
using GearDoctor.Api.Infrastructure;
using System.Text.Json;
using GearDoctor.Tests.Infrastructure;

namespace GearDoctor.Tests.Auth;

[Collection(ApiCollection.Name)]
public sealed class AuthTests(ApiFactory f)
{
    private const string Password = "Correct-Horse-42battery";
    private const string NewPassword = "Rotated-Horse-43battery";
    private const string InvalidTitle = "Email or password is incorrect";

    private static async Task<JsonElement> Json(HttpResponseMessage res) =>
        JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<string> NewAdmin(string prefix, bool mustChange = false)
    {
        var email = AuthHelpers.UniqueEmail(prefix);
        await AuthHelpers.CreateAdminAsync(f, email, Password, mustChange);
        return email;
    }

    [Fact]
    public async Task Login_success_sets_httponly_secure_strict_path_api_cookie()
    {
        var email = await NewAdmin("login");
        using var s = new ApiSession(f);
        using var res = await s.LoginAsync(email, Password);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var cookie = AuthHelpers.SetCookies(res).Single(c => c.StartsWith("gd_auth=", StringComparison.Ordinal)).ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api", cookie);

        var me = await Json(res);
        Assert.Equal(email, me.GetProperty("email").GetString());
        Assert.Equal(["Admin"], me.GetProperty("roles").EnumerateArray().Select(r => r.GetString()!).ToArray());
        Assert.False(me.GetProperty("mustChangePassword").GetBoolean());
    }

    [Fact]
    public async Task Wrong_password_and_unknown_email_return_the_same_401()
    {
        var email = await NewAdmin("enum");
        using var s = new ApiSession(f);
        using var wrong = await s.LoginAsync(email, "Wrong-Password-99x");
        using var unknown = await s.LoginAsync(AuthHelpers.UniqueEmail("ghost"), Password);

        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        var a = await Json(wrong);
        var b = await Json(unknown);
        Assert.Equal(InvalidTitle, a.GetProperty("title").GetString());
        Assert.Equal(a.GetProperty("title").GetString(), b.GetProperty("title").GetString());
        Assert.Equal(a.GetProperty("status").GetInt32(), b.GetProperty("status").GetInt32());
        Assert.Equal(a.TryGetProperty("detail", out var da) ? da.GetString() : null,
                     b.TryGetProperty("detail", out var db) ? db.GetString() : null);
        Assert.Equal(AuthHelpers.SetCookies(wrong).Any(), AuthHelpers.SetCookies(unknown).Any());
        Assert.Null(s.AuthCookie);
    }

    [Fact]
    public async Task Five_failures_lock_the_account_and_the_right_password_is_refused_while_locked()
    {
        var email = await NewAdmin("lock");
        using var s = new ApiSession(f);
        for (var i = 1; i <= 4; i++)
        {
            using var r = await s.LoginAsync(email, "Wrong-Password-99x");
            Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        }
        using var fifth = await s.LoginAsync(email, "Wrong-Password-99x");
        Assert.Equal((HttpStatusCode)423, fifth.StatusCode);

        // lockout is per account, so a fresh client (fresh IP partition: login limiter is 5/min/IP) proves it
        using var right = await new ApiSession(f).LoginAsync(email, Password);
        Assert.Equal((HttpStatusCode)423, right.StatusCode);
        Assert.Null(s.AuthCookie);
        Assert.DoesNotContain(AuthHelpers.SetCookies(right), c => c.StartsWith("gd_auth=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Me_without_cookie_is_401()
    {
        using var s = new ApiSession(f);
        using var res = await s.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Non_admin_user_cannot_log_in_even_with_the_right_password()
    {
        var email = AuthHelpers.UniqueEmail("plain");
        await AuthHelpers.CreateUserAsync(f, email, Password, admin: false);
        using var s = new ApiSession(f);
        using var res = await s.LoginAsync(email, Password);

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(InvalidTitle, (await Json(res)).GetProperty("title").GetString());
        Assert.Null(s.AuthCookie);
    }

    [Fact]
    public async Task There_is_no_registration_endpoint()
    {
        using var s = new ApiSession(f);
        using var post = await s.Http.PostAsJsonAsync("/api/auth/register", new { email = AuthHelpers.UniqueEmail("new"), password = Password });
        Assert.True(post.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"got {(int)post.StatusCode}");
    }

    [Fact]
    public async Task Change_password_without_csrf_token_is_403()
    {
        var email = await NewAdmin("csrf");
        using var s = new ApiSession(f);
        using (await s.LoginAsync(email, Password)) { }
        using var res = await s.SendAsync(HttpMethod.Post, "/api/auth/change-password",
            new { currentPassword = Password, newPassword = NewPassword }, withCsrf: false);
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Seeded_admin_must_change_password_then_change_password_unlocks_the_session()
    {
        var email = await NewAdmin("seed", mustChange: true);
        using var s = new ApiSession(f);
        using (var login = await s.LoginAsync(email, Password))
            Assert.True((await Json(login)).GetProperty("mustChangePassword").GetBoolean());

        await s.FetchCsrfAsync();
        using var change = await s.SendAsync(HttpMethod.Post, "/api/auth/change-password",
            new { currentPassword = Password, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        using var me = await s.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.False((await Json(me)).GetProperty("mustChangePassword").GetBoolean());

        using var oldPw = await new ApiSession(f).LoginAsync(email, Password);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPw.StatusCode);
        using var newPw = await new ApiSession(f).LoginAsync(email, NewPassword);
        Assert.Equal(HttpStatusCode.OK, newPw.StatusCode);
    }

    [Fact]
    public async Task Change_password_invalidates_the_old_cookie_via_security_stamp()
    {
        var email = await NewAdmin("stamp");
        using var s = new ApiSession(f);
        using (await s.LoginAsync(email, Password))
        {
        }
        var oldCookie = s.AuthCookie;
        Assert.NotNull(oldCookie);

        await s.FetchCsrfAsync();
        using (var change = await s.SendAsync(HttpMethod.Post, "/api/auth/change-password",
                   new { currentPassword = Password, newPassword = NewPassword }))
            Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        // replay the pre-change cookie on a cookie-less client
        using var raw = ApiSession.Raw(f);
        raw.DefaultRequestHeaders.Add("Cookie", $"{Platform.AuthCookie}={oldCookie}");
        using (var replay = await raw.GetAsync("/api/auth/me"))
            Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);

        // the re-issued cookie in the session still works
        using (var fresh = await s.Http.GetAsync("/api/auth/me"))
            Assert.Equal(HttpStatusCode.OK, fresh.StatusCode);
    }

    [Fact]
    public async Task Logout_clears_the_auth_cookie()
    {
        var email = await NewAdmin("logout");
        using var s = new ApiSession(f);
        using (await s.LoginAsync(email, Password)) { }
        Assert.NotNull(s.AuthCookie);

        using var res = await s.Http.PostAsync("/api/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        var cleared = AuthHelpers.SetCookies(res).Single(c => c.StartsWith("gd_auth=", StringComparison.Ordinal));
        Assert.Contains("1970", cleared);                   // expired immediately
        Assert.Null(s.AuthCookie);
        using var me = await s.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    // ---- admin API (/api/admin/*): the group applies Admin role + CSRF + forced password change ----

    [Fact]
    public async Task Admin_routes_are_401_for_anonymous_requests()
    {
        using var raw = ApiSession.Raw(f);
        using var res = await raw.GetAsync("/api/admin/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Admin_mutation_without_csrf_token_is_403_and_with_token_passes_the_filter()
    {
        var email = await NewAdmin("csrf");
        using var s = new ApiSession(f);
        (await s.LoginAsync(email, Password)).Dispose();
        await s.FetchCsrfAsync();
        var body = new { name = "Csrf Test " + Guid.NewGuid().ToString("N")[..6] };
        using var without = await s.SendAsync(HttpMethod.Post, "/api/admin/brands", body, withCsrf: false);
        Assert.Equal(HttpStatusCode.Forbidden, without.StatusCode);
        using var with = await s.SendAsync(HttpMethod.Post, "/api/admin/brands", body, withCsrf: true);
        Assert.Equal(HttpStatusCode.Created, with.StatusCode);
    }

    [Fact]
    public async Task Admin_settings_is_403_password_change_required_while_must_change()
    {
        var email = await NewAdmin("mcp-admin", mustChange: true);
        using var s = new ApiSession(f);
        (await s.LoginAsync(email, Password)).Dispose();
        using var res = await s.SendAsync(HttpMethod.Get, "/api/admin/settings");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("/problems/password-change-required", (await Json(res)).GetProperty("type").GetString());
    }

    [Fact]
    public async Task Logout_revokes_the_token_server_side()
    {
        var email = await NewAdmin("logout-revoke");
        using var s = new ApiSession(f);
        (await s.LoginAsync(email, Password)).Dispose();
        var stolen = s.AuthCookie!;                      // a copy taken before logout
        await s.FetchCsrfAsync();
        (await s.SendAsync(HttpMethod.Post, "/api/auth/logout")).Dispose();

        using var raw = ApiSession.Raw(f);
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        req.Headers.Add("Cookie", $"{Platform.AuthCookie}={stolen}");
        using var res = await raw.SendAsync(req);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
