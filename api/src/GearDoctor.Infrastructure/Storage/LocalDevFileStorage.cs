using System.Security.Cryptography;
using System.Text;
using GearDoctor.Application.Common;

namespace GearDoctor.Infrastructure.Storage;

/// <summary>
/// DEVELOPMENT ONLY stand-in for R2 so the whole upload flow (presign → PUT → register → serve)
/// can be exercised locally without a Cloudflare account. Never registered in Production
/// (see DependencyInjection: only when ASPNETCORE_ENVIRONMENT=Development and R2 isn't configured).
///   presigned URL = /api/dev-storage/{key}?exp=…&sig=HMAC(key|exp|contentType)
///   files live under {LocalAppData or /tmp}/geardoctor-dev-uploads/
/// </summary>
public sealed class LocalDevFileStorage : IFileStorage
{
    public static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) is { Length: > 0 } d ? d : Path.GetTempPath(),
        "geardoctor-dev-uploads");
    private static readonly byte[] Secret = RandomNumberGenerator.GetBytes(32);   // per process; dev only

    public PresignedUpload GetPresignedUpload(string key, string contentType, long maxBytes, TimeSpan expiry)
    {
        var exp = DateTimeOffset.UtcNow.Add(expiry);
        var url = $"/api/dev-storage/{key}?exp={exp.ToUnixTimeSeconds()}&ct={Uri.EscapeDataString(contentType)}&max={maxBytes}&sig={Sign(key, exp.ToUnixTimeSeconds(), contentType, maxBytes)}";
        return new PresignedUpload(url, key, new Dictionary<string, string> { ["Content-Type"] = contentType }, exp);
    }

    public static string Sign(string key, long exp, string contentType, long max) =>
        Convert.ToHexString(HMACSHA256.HashData(Secret, Encoding.UTF8.GetBytes($"{key}|{exp}|{contentType}|{max}")));

    public static string PathFor(string key)
    {
        var full = Path.GetFullPath(Path.Combine(Root, key.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(Path.GetFullPath(Root), StringComparison.Ordinal)) throw new InvalidOperationException("Bad key");
        return full;
    }

    public Task<StoredObject?> StatAsync(string key, CancellationToken ct = default)
    {
        var p = PathFor(key);
        if (!File.Exists(p)) return Task.FromResult<StoredObject?>(null);
        var ctFile = p + ".type";
        var type = File.Exists(ctFile) ? File.ReadAllText(ctFile) : null;
        return Task.FromResult<StoredObject?>(new StoredObject(key, new FileInfo(p).Length, type));
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var p = PathFor(key);
        File.Delete(p);
        File.Delete(p + ".type");
        return Task.CompletedTask;
    }

    public string GetPublicUrl(string key) =>
        string.IsNullOrEmpty(key) ? "" :
        key.StartsWith("http", StringComparison.OrdinalIgnoreCase) || key.StartsWith('/') || key.StartsWith("assets/", StringComparison.Ordinal)
            ? key
            : $"/api/dev-storage/{key}";
}
