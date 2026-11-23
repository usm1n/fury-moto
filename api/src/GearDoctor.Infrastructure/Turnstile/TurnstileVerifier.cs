using System.Net.Http.Json;
using System.Text.Json.Serialization;
using GearDoctor.Application.Common;
using Microsoft.Extensions.Options;

namespace GearDoctor.Infrastructure.Turnstile;

public sealed class TurnstileOptions
{
    public string SecretKey { get; set; } = "";
    public string SiteKey { get; set; } = "";
}

/// <summary>
/// Server-side check of a Cloudflare Turnstile token. With no secret configured (local dev)
/// it accepts only Cloudflare's documented "always passes" dummy token flow, i.e. any token
/// is verified against the dummy secret 1x0000000000000000000000000000000AA.
/// </summary>
public sealed class TurnstileVerifier(HttpClient http, IOptions<TurnstileOptions> options) : ITurnstileVerifier
{
    // Cloudflare's published test secret: always passes. Used only when TURNSTILE_SECRET is unset.
    private const string DummySecretAlwaysPasses = "1x0000000000000000000000000000000AA";
    private const string DummySiteKeyAlwaysPasses = "1x00000000000000000000AA";
    private readonly TurnstileOptions _o = options.Value;

    public string SiteKey => string.IsNullOrEmpty(_o.SiteKey) ? DummySiteKeyAlwaysPasses : _o.SiteKey;

    public async Task<bool> VerifyAsync(string token, string? remoteIp, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 2048) return false;
        var form = new Dictionary<string, string>
        {
            ["secret"] = string.IsNullOrEmpty(_o.SecretKey) ? DummySecretAlwaysPasses : _o.SecretKey,
            ["response"] = token,
        };
        if (!string.IsNullOrEmpty(remoteIp)) form["remoteip"] = remoteIp;
        try
        {
            using var res = await http.PostAsync("https://challenges.cloudflare.com/turnstile/v0/siteverify", new FormUrlEncodedContent(form), ct);
            if (!res.IsSuccessStatusCode) return false;
            var body = await res.Content.ReadFromJsonAsync<SiteVerify>(ct);
            return body?.Success == true;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return false;   // fail closed
        }
    }

    private sealed record SiteVerify([property: JsonPropertyName("success")] bool Success);
}
