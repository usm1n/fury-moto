using GearDoctor.Infrastructure.Turnstile;
using Microsoft.Extensions.Options;

namespace GearDoctor.Tests.Orders;

/// <summary>
/// The real Turnstile verifier against Cloudflare's documented dummy secret. Needs network: if
/// challenges.cloudflare.com is unreachable the test logs a SKIP line and returns (xUnit 2.x has no
/// runtime skip). Offline-safe assertions (pre-network rejection) always run.
/// </summary>
public sealed class TurnstileNetworkTests
{
    [Fact]
    public async Task Real_verifier_accepts_cloudflare_dummy_token_and_rejects_malformed_tokens_without_network()
    {
        var verifier = new TurnstileVerifier(new HttpClient { Timeout = TimeSpan.FromSeconds(10) }, Options.Create(new TurnstileOptions()));

        // pre-network rejections: always run
        Assert.False(await verifier.VerifyAsync("   ", null));
        Assert.False(await verifier.VerifyAsync(new string('a', 2049), null));

        if (!await NetworkAvailableAsync())
        {
            Console.WriteLine("SKIP Real_verifier_accepts_cloudflare_dummy_token: challenges.cloudflare.com unreachable");
            return;
        }
        Assert.True(await verifier.VerifyAsync("XXXX.DUMMY.TOKEN.XXXX", null));
    }

    private static async Task<bool> NetworkAvailableAsync()
    {
        try
        {
            using var c = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            using var r = await c.GetAsync("https://challenges.cloudflare.com/turnstile/v0/api.js");
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
