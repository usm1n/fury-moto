using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.AspNetCore.Http;

namespace GearDoctor.Infrastructure.Persistence;

/// <summary>
/// Adds an AuditEntry to the request's DbContext (same instance the service is using), so the entry
/// is written by the same SaveChanges as the change it describes. The IP is the already-forwarded
/// client address (UseForwardedHeaders handles X-Forwarded-For).
/// </summary>
public sealed class AuditLog(AppDbContext db, ICurrentUser user, IClock clock, IHttpContextAccessor http) : IAuditLog
{
    public void Record(string action, string entity, string? entityId, string summary, string? userId = null, string? userEmail = null)
    {
        db.AuditEntries.Add(new AuditEntry
        {
            At = clock.Now,
            UserId = userId is null ? user.UserId : userId.Length == 0 ? null : userId,   // "" = explicitly nobody
            UserEmail = Cut(userEmail is null ? user.Email : userEmail.Length == 0 ? null : userEmail, 256),
            Action = Cut(action, 40)!,
            Entity = Cut(entity, 40)!,
            EntityId = Cut(entityId, 40),
            Summary = Cut(summary, 1000)!,
            Ip = Cut(http.HttpContext?.Connection.RemoteIpAddress?.ToString(), 45),
        });
    }

    private static string? Cut(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..(max - 1)] + "…";
}
