using System.Text.Json.Serialization;
using GearDoctor.Api.Endpoints;
using GearDoctor.Api.Infrastructure;
using GearDoctor.Application;
using GearDoctor.Infrastructure;
using GearDoctor.Infrastructure.Seed;

// ---------------------------------------------------------------------------
// CLI mode: `dotnet GearDoctor.Api.dll seed` runs the idempotent seeder (catalog
// import + admin user) and exits. Used by CI after the EF migration bundle.
// Migrations NEVER run on app startup (serverless cold start + concurrent instances).
// ---------------------------------------------------------------------------
if (args.Length > 0 && args[0] == "seed")
{
    await SeedCommand.RunAsync(args[1..]);
    return;
}

var builder = WebApplication.CreateSlimBuilder(args);

// Vercel routes to $PORT (default 80). Local dev uses launchSettings / ASPNETCORE_URLS.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});

builder.Services
    .AddInfrastructure(builder.Configuration)
    .AddApplication()
    .AddApiPlatform(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseApiPlatform();          // forwarded headers, errors → ProblemDetails, security headers, auth, rate limits

app.MapGet("/api/health", HealthEndpoint.Handle).WithTags("Public").AllowAnonymous();
app.MapPublicCatalog();        // GET products / categories / brands / certifications / settings
app.MapOrders();               // POST /api/orders, POST /api/cart/validate
app.MapAuth();                 // /api/auth/*
app.MapAdmin();                // /api/admin/* (Admin role + CSRF)
app.MapOpenApi("/api/openapi.json");
if (app.Environment.IsDevelopment() && app.Services.GetRequiredService<GearDoctor.Application.Common.IFileStorage>() is GearDoctor.Infrastructure.Storage.LocalDevFileStorage)
    app.MapDevStorage();   // local stand-in for R2 uploads (dev only)

app.Run();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
