namespace GearDoctor.Tests.Infrastructure;

/// <summary>Fake product.html for the SEO endpoint (no network). Set Fail to simulate an unreachable storefront.</summary>
public static class SeoStub
{
    public const string Template =
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>old</title>" +
        "<meta name=\"description\" content=\"old\"><meta property=\"og:type\" content=\"website\">" +
        "<meta property=\"og:image\" content=\"assets/img/og/og-default.jpg\"></head><body>shell</body></html>";
    public static volatile bool Fail;

    public sealed class Handler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(Fail
                ? new HttpResponseMessage(System.Net.HttpStatusCode.InternalServerError)
                : new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent(Template) });
    }
}
