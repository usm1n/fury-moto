using Amazon.S3;
using Amazon.S3.Model;
using GearDoctor.Application.Common;
using Microsoft.Extensions.Options;

namespace GearDoctor.Infrastructure.Storage;

public sealed class R2Options
{
    public string AccountId { get; set; } = "";
    public string AccessKeyId { get; set; } = "";
    public string SecretAccessKey { get; set; } = "";
    public string Bucket { get; set; } = "";
    /// <summary>e.g. https://images.example.com (custom domain) or https://pub-xxxx.r2.dev (dev only).</summary>
    public string PublicBaseUrl { get; set; } = "";
    /// <summary>Optional endpoint override (local S3-compatible server in tests).</summary>
    public string? ServiceUrl { get; set; }
    public bool IsConfigured => !string.IsNullOrEmpty(Bucket) && !string.IsNullOrEmpty(AccessKeyId) && (!string.IsNullOrEmpty(AccountId) || !string.IsNullOrEmpty(ServiceUrl));
}

/// <summary>
/// Cloudflare R2 through the S3 API. Uploads never pass through the API: the admin
/// gets a presigned PUT URL and sends the (already resized, WebP) file straight to R2.
/// </summary>
public sealed class R2FileStorage(IAmazonS3 s3, IOptions<R2Options> options) : IFileStorage
{
    private readonly R2Options _o = options.Value;

    public static IAmazonS3 CreateClient(R2Options o)
    {
        var cfg = new AmazonS3Config
        {
            ServiceURL = o.ServiceUrl ?? (string.IsNullOrEmpty(o.AccountId) ? "https://invalid.local" : $"https://{o.AccountId}.r2.cloudflarestorage.com"),
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            // R2 doesn't support the newer default checksum headers on presigned PUTs
            RequestChecksumCalculation = Amazon.Runtime.RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = Amazon.Runtime.ResponseChecksumValidation.WHEN_REQUIRED,
        };
        return new AmazonS3Client(o.AccessKeyId, o.SecretAccessKey, cfg);
    }

    private void EnsureConfigured()
    {
        if (!_o.IsConfigured) throw new InvalidOperationException("R2 storage is not configured (R2_* environment variables).");
    }

    public PresignedUpload GetPresignedUpload(string key, string contentType, long maxBytes, TimeSpan expiry)
    {
        EnsureConfigured();
        var expires = DateTimeOffset.UtcNow.Add(expiry);
        var req = new GetPreSignedUrlRequest
        {
            BucketName = _o.Bucket,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = expires.UtcDateTime,
            ContentType = contentType,
            Protocol = Protocol.HTTPS,
        };
        // Keys are content-addressed (new GUID per upload) so objects can be cached forever.
        req.Headers.CacheControl = "public, max-age=31536000, immutable";
        var url = s3.GetPreSignedURL(req);
        var headers = new Dictionary<string, string>
        {
            ["Content-Type"] = contentType,
            ["Cache-Control"] = "public, max-age=31536000, immutable",
        };
        // Size is enforced after upload by StatAsync (presigned PUT can't carry a size condition);
        // the register step rejects and deletes anything over maxBytes.
        return new PresignedUpload(url, key, headers, expires);
    }

    public async Task<StoredObject?> StatAsync(string key, CancellationToken ct = default)
    {
        EnsureConfigured();
        try
        {
            var meta = await s3.GetObjectMetadataAsync(_o.Bucket, key, ct);
            return new StoredObject(key, meta.ContentLength, meta.Headers.ContentType);
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        EnsureConfigured();
        await s3.DeleteObjectAsync(_o.Bucket, key, ct);
    }

    public string GetPublicUrl(string key) =>
        string.IsNullOrEmpty(key) ? "" :
        key.StartsWith("http", StringComparison.OrdinalIgnoreCase) || key.StartsWith('/')
            ? key
            : key.StartsWith("assets/", StringComparison.Ordinal) ? "/" + key   // legacy static asset: root-relative
            : $"{_o.PublicBaseUrl}/{key}";
}
