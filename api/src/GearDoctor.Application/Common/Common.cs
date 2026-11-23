using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Common;

/* ============================================================================
 * Result types. Services return Result / Result<T>; the API maps Error.Kind to
 * an HTTP status + RFC 9457 ProblemDetails (see Api/Infrastructure/ResultHttp.cs).
 * Never throw for expected failures.
 * ========================================================================== */

public enum ErrorKind { Validation, NotFound, Conflict, Unauthorized, Forbidden, Locked, TooManyRequests, Unprocessable }

public sealed record Error(ErrorKind Kind, string Title, string? Detail = null,
    IReadOnlyDictionary<string, string[]>? Errors = null, string? Type = null, object? Extensions = null)
{
    public static Error NotFound(string what) => new(ErrorKind.NotFound, $"{what} not found");
    public static Error Conflict(string title, string? detail = null, string? type = null, object? ext = null) => new(ErrorKind.Conflict, title, detail, Type: type, Extensions: ext);
    public static Error Validation(IReadOnlyDictionary<string, string[]> errors) => new(ErrorKind.Validation, "One or more fields are invalid", Errors: errors);
    public static Error Validation(string field, string message) => Validation(new Dictionary<string, string[]> { [field] = [message] });
    public static Error Unprocessable(string title, string? detail = null) => new(ErrorKind.Unprocessable, title, detail);
}

public readonly struct Result
{
    public Error? Error { get; }
    public bool IsSuccess => Error is null;
    private Result(Error? e) => Error = e;
    public static Result Ok() => new(null);
    public static implicit operator Result(Error e) => new(e);
}

public readonly struct Result<T>
{
    public T? Value { get; }
    public Error? Error { get; }
    public bool IsSuccess => Error is null;
    private Result(T? v, Error? e) { Value = v; Error = e; }
    public static Result<T> Ok(T value) => new(value, null);
    public static implicit operator Result<T>(T value) => new(value, null);
    public static implicit operator Result<T>(Error e) => new(default, e);
}

/// <summary>Paged list envelope: { items, page, pageSize, total }.</summary>
public sealed record PagedList<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

/* ============================================================================
 * Ports implemented in Infrastructure.
 * ========================================================================== */

/// <summary>EF Core context surface the services use (implemented by AppDbContext).</summary>
public interface IAppDbContext
{
    DbSet<Category> Categories { get; }
    DbSet<Brand> Brands { get; }
    DbSet<Certification> Certifications { get; }
    DbSet<Product> Products { get; }
    DbSet<ProductVariant> ProductVariants { get; }
    DbSet<ProductImage> ProductImages { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderItem> OrderItems { get; }
    DbSet<OrderStatusEvent> OrderStatusEvents { get; }
    DbSet<Setting> Settings { get; }
    Microsoft.EntityFrameworkCore.Infrastructure.DatabaseFacade Database { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
    /// <summary>Next value of order_number_seq (starts at 1001).</summary>
    Task<long> NextOrderNumberAsync(CancellationToken ct = default);
}

/// <summary>Object storage (Cloudflare R2 via the S3 API). Keys like products/{id}/{guid}.webp.</summary>
public interface IFileStorage
{
    /// <summary>Presigned PUT URL. The client must send the returned headers (Content-Type).</summary>
    PresignedUpload GetPresignedUpload(string key, string contentType, long maxBytes, TimeSpan expiry);
    /// <summary>HEAD the object: null if missing.</summary>
    Task<StoredObject?> StatAsync(string key, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    string GetPublicUrl(string key);
}
public sealed record PresignedUpload(string Url, string Key, IReadOnlyDictionary<string, string> Headers, DateTimeOffset ExpiresAt);
public sealed record StoredObject(string Key, long Size, string? ContentType);

/// <summary>Cloudflare Turnstile server-side verification.</summary>
public interface ITurnstileVerifier
{
    Task<bool> VerifyAsync(string token, string? remoteIp, CancellationToken ct = default);
    string SiteKey { get; }
}

/// <summary>The signed-in admin (null id for anonymous).</summary>
public interface ICurrentUser
{
    string? UserId { get; }
    string? Email { get; }
}

public interface IClock { DateTimeOffset Now { get; } }
public sealed class SystemClock : IClock { public DateTimeOffset Now => DateTimeOffset.UtcNow; }
