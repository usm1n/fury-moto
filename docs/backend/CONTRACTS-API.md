# Backend contracts (read before touching /api, /admin or the storefront data layer)

The API contract is [`openapi.draft.yaml`](openapi.draft.yaml): routes, request/response shapes and status codes. **Implement exactly that.** If you need something it doesn't have, report it; don't invent it. Architecture and decisions are in [`PLAN.md`](PLAN.md).

## Layers (`/api`)
| Project | Contains | May reference |
|---|---|---|
| `GearDoctor.Domain` | entities, enums, domain rules (`Order.CanTransition`, `Slugs.From`) | nothing |
| `GearDoctor.Application` | services (plain classes, one per area), DTO records, FluentValidation validators, `Common/Common.cs` (Result, Error, PagedList, ports) | Domain, EF Core abstractions (`IAppDbContext`) |
| `GearDoctor.Infrastructure` | `AppDbContext`, migrations, Identity, R2, Turnstile, seed | Application, Domain |
| `GearDoctor.Api` | endpoint files (minimal APIs), auth/CSRF/rate limit/ProblemDetails platform | all |

## Rules
1. **Services return `Result<T>` / `Result`**, never throw for expected failures. Endpoints call `.ToHttp()` (`Api/Infrastructure/ResultHttp.cs`), so every error is RFC 9457 ProblemDetails.
2. **Validation**: a FluentValidation validator per request DTO (in Application, picked up automatically by `AddValidatorsFromAssembly`). Services call `validator.ValidateAsync` and return `Error.Validation(dict)`.
3. **Money is `int` PKR.** No floats or decimals anywhere.
4. **Reads use `AsNoTracking()` and projections (`Select`) to DTOs.** Never return entities from endpoints.
5. **Public GETs** call `res.CachePublic()`: browsers get `Cache-Control: public, no-cache` (always revalidate, so admin edits show on the next load) and the Vercel edge gets `Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=600`. Admin and auth responses are never cached.
6. **Image URLs** always go through `IFileStorage.GetPublicUrl(key)` (legacy `assets/...` keys pass through unchanged).
7. **Admin endpoints** are mapped inside `Admin/*Endpoints.Map(RouteGroupBuilder admin)`. The group already applies the Admin policy and CSRF, so don't add them again.
8. **Concurrency**: entities with `Version` (xmin) use it for optimistic concurrency. A `DbUpdateConcurrencyException` becomes `Error.Conflict`.
9. **No in-memory state** as a source of truth (serverless: instances don't share memory, and they scale to zero).
10. **Register services** in `Application/DependencyInjection.cs` (`services.AddScoped<XService>()`). Only the agent that owns that file in a phase edits it; others report the line to add.
11. JSON is camelCase and enums are strings (configured globally).

## File ownership (who may edit what)
Listed per phase in `docs/BUILD_LOG.md` when agents are spawned. The orchestrator owns `Domain/`, `Common/Common.cs`, `AppDbContext`, migrations, `Program.cs`, `Api/Infrastructure/*`, `Endpoints/Groups.cs`, `vercel.json` and `Dockerfile.vercel`. **Never change the schema, auth or the platform**; report what you need instead.

## Run locally
Local PostgreSQL 17 is installed on this machine: database `geardoctor` (dev) and `geardoctor_test` (tests), user `geardoctor`, password `geardoctor_dev`.
```bash
export PATH="/c/Program Files/dotnet:$PATH"          # Git Bash; .NET 10 SDK
cd api
export NEON_DATABASE_URL="Host=localhost;Database=geardoctor;Username=geardoctor;Password=geardoctor_dev"
dotnet ef database update -p src/GearDoctor.Infrastructure -s src/GearDoctor.Infrastructure   # migrations
dotnet run --project src/GearDoctor.Api --no-launch-profile -- seed                           # seed (idempotent)
ASPNETCORE_ENVIRONMENT=Development PORT=5080 dotnet run --project src/GearDoctor.Api --no-launch-profile
# http://127.0.0.1:5080/api/health   http://127.0.0.1:5080/api/openapi.json
```

## Tests (`tests/GearDoctor.Tests`)
- xUnit integration tests through `WebApplicationFactory<Program>` against a real Postgres.
- Database: `TEST_DATABASE_URL` if set (local: `Host=localhost;Database=geardoctor_test;Username=geardoctor;Password=geardoctor_dev`; CI: the Actions `postgres` service). Otherwise Testcontainers (needs Docker, which this machine doesn't have).
- The shared fixture (`ApiFactory`) applies migrations once and resets data between test classes.
- `dotnet test` must pass before reporting done.

## Phase 4: content, audit, alerts, SEO
- **Audit rule: every admin mutation records an audit entry** via `IAuditLog.Record(action, entity, entityId, summary)` (Application port, `Infrastructure/Persistence/AuditLog.cs`). It only adds the row to the request's DbContext, so it is saved by the same `SaveChanges` as the change. For creates the id exists only after the first save, so they save twice. Entities (PascalCase): Product, Variant, Image, Category, Brand, Order, Settings, Guide, Faq, Testimonial, Auth. Actions are `entity.verb`. Summaries are short human text (`Price 45,000 → 42,000`); never log secrets (settings log key names only, bank details become "bank details changed"). Auth failures use entity `Auth` with no user id and the tried email in the summary. A new admin endpoint without an audit call is a bug.
- Guides carry xmin `version` (409 `/problems/stale`); FAQs and testimonials are last-write-wins. `coverKey`/`video`/`source`: null = unchanged, "" = clear.
- **SEO env**: `SITE_URL` (absolute origin, no trailing slash; required for `/api/seo/*`, absent = 503 ProblemDetails, the app still starts) and `STORE_NAME` (default "The Gear Doctor"). The API fetches `{SITE_URL}/product.html` through the named HttpClient `seo-template` (3 s timeout) and caches it 10 min in `IMemoryCache` (a cache only). Fetch failure = 302 to `/product.html?slug=`. Vercel rewrites `/products/:slug` and `/sitemap.xml` to the API (also in `tools/dev-server.mjs`).
- Seed: only certifications, default settings and the admin user. The catalog (categories, brands, products) and content (guides, FAQs, testimonials) start empty and are created in the admin.
