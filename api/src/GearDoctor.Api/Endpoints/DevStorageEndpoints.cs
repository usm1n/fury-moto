using GearDoctor.Infrastructure.Storage;

namespace GearDoctor.Api.Endpoints;

/// <summary>
/// DEVELOPMENT ONLY: PUT/GET for LocalDevFileStorage (local stand-in for R2 presigned uploads).
/// Mapped only when the environment is Development and R2 isn't configured.
/// </summary>
public static class DevStorageEndpoints
{
    public static IEndpointRouteBuilder MapDevStorage(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/dev-storage/{**key}", async (string key, long exp, string ct, long max, string sig, HttpRequest req) =>
        {
            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return Results.StatusCode(403);
            if (!string.Equals(sig, LocalDevFileStorage.Sign(key, exp, ct, max), StringComparison.OrdinalIgnoreCase)) return Results.StatusCode(403);
            if (!string.Equals(req.ContentType, ct, StringComparison.OrdinalIgnoreCase)) return Results.StatusCode(403);
            var path = LocalDevFileStorage.PathFor(key);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await using (var f = File.Create(path)) await req.Body.CopyToAsync(f);
            await File.WriteAllTextAsync(path + ".type", ct);
            return Results.Ok();
        }).ExcludeFromDescription().AllowAnonymous().DisableAntiforgery();

        app.MapGet("/api/dev-storage/{**key}", (string key) =>
        {
            var path = LocalDevFileStorage.PathFor(key);
            if (!File.Exists(path)) return Results.NotFound();
            var type = File.Exists(path + ".type") ? File.ReadAllText(path + ".type") : "application/octet-stream";
            return Results.File(path, type);
        }).ExcludeFromDescription().AllowAnonymous();
        return app;
    }
}
