using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using GearDoctor.Api.Infrastructure;
using GearDoctor.Infrastructure.Persistence;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace GearDoctor.Api.Endpoints;

/// <summary>
/// Admin authentication. Single "Admin" role, no registration endpoint.
///  - JWT (HS256, 8 h) in the httpOnly gd_auth cookie (Secure, SameSite=Strict, Path=/api)
///  - token carries the user's security stamp; every request re-checks it (Platform.ValidateSession),
///    so a password change, lockout or deletion kills existing sessions immediately
///  - lockout: 5 failures → 15 min (Identity); per-IP rate limit on login
///  - CSRF: GET /api/auth/csrf issues the antiforgery pair; admin echoes gd_csrf in X-CSRF-Token
/// </summary>
public static class AuthEndpoints
{
    public sealed record LoginRequest(string Email, string Password);
    public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public sealed record Me(string Email, string[] Roles, bool MustChangePassword);

    public static IEndpointRouteBuilder MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");
        g.MapGet("/csrf", IssueCsrf).AllowAnonymous();
        g.MapPost("/login", Login).AllowAnonymous().RequireRateLimiting(Platform.LoginLimiter);
        g.MapPost("/logout", Logout).AllowAnonymous();
        g.MapGet("/me", GetMe).RequireAuthorization();
        g.MapPost("/change-password", ChangePassword).RequireAuthorization().RequireRateLimiting(Platform.LoginLimiter)
            .AddEndpointFilter(async (ctx, next) =>
            {
                var af = ctx.HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
                return await af.IsRequestValidAsync(ctx.HttpContext)
                    ? await next(ctx)
                    : Results.Problem(title: "Missing or invalid CSRF token", statusCode: 403);
            });
        return app;
    }

    /// <summary>Sets the httpOnly antiforgery cookie and a readable gd_csrf cookie holding the request token.</summary>
    private static IResult IssueCsrf(HttpContext http, IAntiforgery af)
    {
        var tokens = af.GetAndStoreTokens(http);
        http.Response.Cookies.Append(Platform.CsrfCookie, tokens.RequestToken!, new CookieOptions
        {
            HttpOnly = false,          // the admin SPA reads it and sends it back in X-CSRF-Token
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/",
        });
        http.Response.Headers.CacheControl = "no-store";
        return Results.NoContent();
    }

    private static async Task<IResult> Login(LoginRequest req, UserManager<AppUser> users, JwtSettings jwt, HttpContext http)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrEmpty(req.Password) || req.Password.Length > 256)
            return Invalid();

        var user = await users.FindByEmailAsync(req.Email.Trim());
        if (user is null)
        {
            // same work + same response as a wrong password (no account enumeration)
            users.PasswordHasher.HashPassword(new AppUser(), req.Password);
            return Invalid();
        }
        if (await users.IsLockedOutAsync(user)) return Locked();

        if (!await users.CheckPasswordAsync(user, req.Password))
        {
            await users.AccessFailedAsync(user);
            return await users.IsLockedOutAsync(user) ? Locked() : Invalid();
        }
        await users.ResetAccessFailedCountAsync(user);

        var roles = await users.GetRolesAsync(user);
        if (!roles.Contains(Platform.AdminRole)) return Invalid();

        IssueSessionCookie(http, jwt, user, roles);
        return Results.Ok(new Me(user.Email!, [.. roles], user.MustChangePassword));

        static IResult Invalid() => Results.Problem(title: "Email or password is incorrect", statusCode: 401);
        static IResult Locked() => Results.Problem(title: "Too many failed attempts. Try again in 15 minutes.", statusCode: 423);
    }

    private static async Task<IResult> Logout(HttpContext http, UserManager<AppUser> users)
    {
        // Revoke server-side too: rotating the security stamp invalidates this JWT (and any copy of it)
        // immediately, instead of leaving it valid until expiry. Single-admin store, so ending other
        // sessions as well is the safer behaviour.
        var auth = await http.AuthenticateAsync(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme);
        if (auth.Succeeded && await users.FindByIdAsync(auth.Principal!.FindFirstValue("sub") ?? "") is { } user)
            await users.UpdateSecurityStampAsync(user);
        http.Response.Cookies.Delete(Platform.AuthCookie, new CookieOptions { Path = "/api", Secure = true, SameSite = SameSiteMode.Strict, HttpOnly = true });
        return Results.NoContent();
    }

    private static async Task<IResult> GetMe(ClaimsPrincipal principal, UserManager<AppUser> users, HttpResponse res)
    {
        res.Headers.CacheControl = "no-store";
        var user = await users.FindByIdAsync(principal.FindFirstValue("sub") ?? "");
        if (user is null) return Results.Problem(title: "Not signed in", statusCode: 401);
        var roles = await users.GetRolesAsync(user);
        return Results.Ok(new Me(user.Email!, [.. roles], user.MustChangePassword));
    }

    private static async Task<IResult> ChangePassword(ChangePasswordRequest req, ClaimsPrincipal principal,
        UserManager<AppUser> users, JwtSettings jwt, HttpContext http)
    {
        var user = await users.FindByIdAsync(principal.FindFirstValue("sub") ?? "");
        if (user is null) return Results.Problem(title: "Not signed in", statusCode: 401);
        if (req.NewPassword == req.CurrentPassword)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["newPassword"] = ["Choose a different password from the current one."] });

        var result = await users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded)
        {
            var errors = result.Errors.GroupBy(e => e.Code.Contains("Mismatch") ? "currentPassword" : "newPassword")
                .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
            return Results.ValidationProblem(errors);
        }
        user.MustChangePassword = false;
        await users.UpdateAsync(user);                 // ChangePasswordAsync already rotated the security stamp
        IssueSessionCookie(http, jwt, user, await users.GetRolesAsync(user));   // fresh token with the new stamp
        return Results.NoContent();
    }

    internal static void IssueSessionCookie(HttpContext http, JwtSettings jwt, AppUser user, IEnumerable<string> roles)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new("sub", user.Id),
            new("email", user.Email!),
            new("ss", user.SecurityStamp ?? ""),
            new("mcp", user.MustChangePassword ? "1" : "0"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };
        claims.AddRange(roles.Select(r => new Claim("role", r)));
        var token = new JwtSecurityToken(jwt.Issuer, jwt.Audience, claims, now, now.Add(jwt.Lifetime),
            new SigningCredentials(jwt.Key, SecurityAlgorithms.HmacSha256));
        http.Response.Cookies.Append(Platform.AuthCookie, new JwtSecurityTokenHandler().WriteToken(token), new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = "/api",
            MaxAge = jwt.Lifetime,
            IsEssential = true,
        });
    }
}
