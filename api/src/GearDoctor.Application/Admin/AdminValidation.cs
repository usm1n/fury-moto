using System.Text.RegularExpressions;
using FluentValidation;
using GearDoctor.Application.Common;

namespace GearDoctor.Application.Admin;

internal static partial class AdminValidation
{
    [GeneratedRegex(@"(^|\.)([A-Z])")]
    private static partial Regex Pascal();

    /// <summary>Validates and maps failures to a camelCase field → messages error, or null when valid.</summary>
    public static async Task<Error?> CheckAsync<T>(IValidator<T> v, T value, CancellationToken ct, string prefix = "")
    {
        var r = await v.ValidateAsync(value, ct);
        if (r.IsValid) return null;
        var d = r.Errors.GroupBy(e => prefix + Pascal().Replace(e.PropertyName, m => m.Groups[1].Value + m.Groups[2].Value.ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
        return Error.Validation(d);
    }

    public static Error Stale(string what) =>
        Error.Conflict($"{what} was changed by someone else", "Reload and try again.", "/problems/stale");
}
