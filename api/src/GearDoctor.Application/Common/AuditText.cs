using System.Globalization;

namespace GearDoctor.Application.Common;

/// <summary>Builds the short human-readable audit summaries ("Price 45,000 → 42,000; status Draft → Published").</summary>
public sealed class AuditDiff
{
    private readonly List<string> _parts = [];
    public bool Any => _parts.Count > 0;

    public static string Money(int? n) => n is null ? "none" : n.Value.ToString("N0", CultureInfo.InvariantCulture);

    /// <summary>Short values are shown ("title 'A' → 'B'"), long ones only noted ("description changed").</summary>
    public AuditDiff Text(string name, string? before, string? after)
    {
        before ??= ""; after ??= "";
        if (before == after) return this;
        _parts.Add(before.Length <= 60 && after.Length <= 60 ? $"{name} '{before}' → '{after}'" : $"{name} changed");
        return this;
    }

    /// <summary>Records only that something changed (never the values).</summary>
    public AuditDiff Changed(string name, bool changed)
    {
        if (changed) _parts.Add($"{name} changed");
        return this;
    }

    public AuditDiff Price(string name, int? before, int? after)
    {
        if (before != after) _parts.Add($"{name} {Money(before)} → {Money(after)}");
        return this;
    }

    public AuditDiff Flag(string name, bool before, bool after)
    {
        if (before != after) _parts.Add($"{name} {(after ? "on" : "off")}");
        return this;
    }

    public AuditDiff Add(string part) { _parts.Add(part); return this; }

    /// <summary>Joined with "; " and capitalised.</summary>
    public override string ToString()
    {
        var s = string.Join("; ", _parts);
        return s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
    }
}
