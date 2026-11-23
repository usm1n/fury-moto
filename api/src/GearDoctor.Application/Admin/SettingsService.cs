using System.Text.Json;
using FluentValidation;
using GearDoctor.Application.Common;
using GearDoctor.Domain;
using Microsoft.EntityFrameworkCore;

namespace GearDoctor.Application.Admin;

public sealed class SettingsService(IAppDbContext db, IClock clock, IValidator<AdminSettingsDto> validator)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<Result<AdminSettingsDto>> GetAsync(CancellationToken ct = default)
    {
        var map = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        JsonElement? Get(string k)
        {
            if (!map.TryGetValue(k, out var raw)) return null;
            try { return JsonDocument.Parse(raw).RootElement.Clone(); } catch (JsonException) { return null; }
        }
        string? Str(string k) => Get(k) is { ValueKind: JsonValueKind.String } e ? e.GetString() : null;
        int Int(string k, int d) => Get(k) is { ValueKind: JsonValueKind.Number } e && e.TryGetInt32(out var n) ? n : d;
        bool Bool(string k, bool d) => Get(k) is { ValueKind: JsonValueKind.True or JsonValueKind.False } e ? e.GetBoolean() : d;
        BankDetailsDto? bank = null;
        if (Get(SettingKeys.BankDetails) is { ValueKind: JsonValueKind.Object } b)
            try { bank = b.Deserialize<BankDetailsDto>(Json); } catch (JsonException) { }

        return new AdminSettingsDto(Str(SettingKeys.WhatsappNumber), Str(SettingKeys.PhoneDisplay), Str(SettingKeys.Email),
            Str(SettingKeys.City), Str(SettingKeys.Address), Str(SettingKeys.Hours), Int(SettingKeys.DeliveryFee, 0),
            Bool(SettingKeys.CodEnabled, true), Bool(SettingKeys.BankTransferEnabled, false), bank, Int(SettingKeys.LowStockThreshold, 3));
    }

    public async Task<Result<AdminSettingsDto>> UpdateAsync(AdminSettingsDto req, CancellationToken ct = default)
    {
        var v = await validator.ValidateAsync(req, ct);
        if (!v.IsValid)
            return Error.Validation(v.Errors.GroupBy(e => string.IsNullOrEmpty(e.PropertyName) ? "settings" : char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()));

        static string? N(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        var bank = req.BankDetails is null ? null : new BankDetailsDto(N(req.BankDetails.BankName), N(req.BankDetails.AccountTitle), N(req.BankDetails.Iban));
        var values = new Dictionary<string, object?>
        {
            [SettingKeys.WhatsappNumber] = N(req.WhatsappNumber),
            [SettingKeys.PhoneDisplay] = N(req.PhoneDisplay),
            [SettingKeys.Email] = N(req.Email),
            [SettingKeys.City] = N(req.City),
            [SettingKeys.Address] = N(req.Address),
            [SettingKeys.Hours] = N(req.Hours),
            [SettingKeys.DeliveryFee] = req.DeliveryFee,
            [SettingKeys.CodEnabled] = req.CodEnabled,
            [SettingKeys.BankTransferEnabled] = req.BankTransferEnabled,
            [SettingKeys.BankDetails] = bank,
            [SettingKeys.LowStockThreshold] = req.LowStockThreshold,
        };
        var keys = values.Keys.ToList();
        var existing = await db.Settings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, ct);
        var now = clock.Now;
        foreach (var (key, val) in values)
        {
            var json = JsonSerializer.Serialize(val, Json);
            if (existing.TryGetValue(key, out var row)) { row.Value = json; row.UpdatedAt = now; }
            else db.Settings.Add(new Setting { Key = key, Value = json, UpdatedAt = now });
        }
        await db.SaveChangesAsync(ct);
        return await GetAsync(ct);
    }
}
