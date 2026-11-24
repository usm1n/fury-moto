# The Gear Doctor — Fury Moto riding-gear store

Umair's riding-gear store ([@fury__moto](https://www.instagram.com/fury__moto/) · [@fury_the_gear_doc](https://www.instagram.com/fury_the_gear_doc/)): a video-led storefront, an admin panel he runs from his phone, and an API with a Postgres database.

| Part | Folder | Tech | URL path |
|---|---|---|---|
| Storefront | [`web/`](web) | Plain HTML/CSS/JS modules (no build step), scroll-driven canvas background | `/` |
| Admin panel | [`admin/`](admin) | Angular 22 + Angular Material 22 (standalone, signals, zoneless; all MIT, no license keys) | `/admin` |
| API | [`api/`](api) | .NET 10 minimal APIs + EF Core (Npgsql) + ASP.NET Identity | `/api` |
| Database | Neon Postgres | products, variants, images, orders, settings, admin user | n/a |
| Product photos | Cloudflare R2 | uploaded straight from the admin (never through the API) | `images.<domain>` |

- **Products, stock, prices, orders and contact settings** live in the database and are edited in the admin.
- **Design, copy, the background video and guides** stay in [`web/js/site.config.js`](web/js/site.config.js).

Docs:
- **[ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md):** for Umair.
- **[DEPLOY.md](docs/DEPLOY.md):** deploying from scratch.
- **[backend/PLAN.md](docs/backend/PLAN.md):** architecture, schema and decisions.
- **[backend/CONTRACTS-API.md](docs/backend/CONTRACTS-API.md)** and **[backend/openapi.draft.yaml](docs/backend/openapi.draft.yaml):** API rules and contract.
- **[CONTRACTS.md](docs/CONTRACTS.md):** storefront rules.
- **[BUILD_LOG.md](docs/BUILD_LOG.md):** what was built, by whom.

---

## Performance notes (for developers)
- Every page `<head>` has a generated block (between `perf:start` and `perf:end`) with the font stylesheet, a preload of the first background frame for the visitor's orientation, and a `modulepreload` for every JS module the page needs. **After adding or removing a JS module, changing the default fonts or the frame folders, run `node tools/head.mjs`.**
- The background frames load in two phases. First the frames around the scroll position plus every 10th frame, at high priority. Then, after the page has loaded, the rest, nearest to where the visitor is first, at low priority.
- Category-card videos only download when they're about to play (hover, focus, or 60% in view on touch screens).
- Dev probe: open any page and run `await (await import('/dev/perf.js')).report()` in the console for LCP, CLS, requests and bytes.

## 1. Run it locally

You need the .NET 10 SDK, Node 22.22+ (or 24/26), and PostgreSQL 17. Local database `geardoctor` uses user `geardoctor` with password `geardoctor_dev` (see [CONTRACTS-API.md](docs/backend/CONTRACTS-API.md)).

```bash
# 1. API  (http://127.0.0.1:5080)
cd api
export NEON_DATABASE_URL="Host=localhost;Database=geardoctor;Username=geardoctor;Password=geardoctor_dev"
dotnet ef database update -p src/GearDoctor.Infrastructure -s src/GearDoctor.Infrastructure
ADMIN_EMAIL=admin@local.test ADMIN_INITIAL_PASSWORD='LocalDevPassw0rd!' dotnet run --project src/GearDoctor.Api --no-launch-profile -- seed
ASPNETCORE_ENVIRONMENT=Development DEV_LOCAL_STORAGE=1 PORT=5080 dotnet run --project src/GearDoctor.Api --no-launch-profile

# 2. Admin  (http://127.0.0.1:4200/admin/)
cd admin && npm ci && npm start

# 3. One origin for everything, like production  →  http://127.0.0.1:8080  (store)  and  /admin
node tools/dev-server.mjs
```
- `DEV_LOCAL_STORAGE=1` stores uploaded photos on local disk, so no Cloudflare account is needed. It only works in Development.
- Turnstile uses Cloudflare's always-pass test keys locally.
- Tests: `cd api && TEST_DATABASE_URL="Host=localhost;Database=geardoctor_test;Username=geardoctor;Password=geardoctor_dev" dotnet test`, and `cd admin && npx ng test --watch=false`.

## 2. Edit the config

Open `js/site.config.js`. Every field has a comment. Common edits:

| I want to… | Edit |
|---|---|
| Change name, tagline, WhatsApp, email, hours | `store` |
| Change colours / fonts / corner radius / film grain | `theme` |
| Add a product | append an object to `products` (copy an existing one; `id` must be unique kebab-case). It then appears in the shop, search, filters and its own `product.html?id=` page. |
| Put a product on sale | set `compareAtPrice` higher than `price`, add `"Sale"` to `badges` |
| Feature products on the homepage | add their ids to `home.featuredIds` (empty = all "Rider's pick") |
| Add a Gear Doctor guide | append to `guides` (`body` uses `## headings`, `- bullets`, `**bold**`, `[link](url)`) |
| Change a size chart | `sizeGuides.<category>` |
| Change nav / footer links | `nav`, `footer` |
| Change any button/label text | `ui`, or the page's section (`home`, `about`, `contact`, `gearDoctor`, `notFound`) |
| Show Instagram posts | add `{ url, account, date, caption, image }` to `instagramPosts`. Posts without an `image` show as Instagram's official embed (the real post, reels play). Once you add a downloaded `image`, they become fast image tiles. `instagram.embeds: false` turns embeds off. With no posts at all, the site shows "follow" cards. |

**Placeholders.** Anything still unknown is written `"[PLACEHOLDER: …]"`. With `devMode: true` (top of the config) every placeholder on the page gets a yellow dashed outline, and the browser console lists the remaining ones. **Set `devMode: false` before launch.**

## 3. Add a video, or change the background

### Small videos (category cards, product gallery)
These use `videos` and `videoSlots`.
1. Drop the clip in `assets/source/<name>.mp4` (9:16 works best) and run the media script. It needs ffmpeg (`winget install Gyan.FFmpeg`):
   ```bash
   bash tools/media.sh <name>
   ```
   It writes 720/1080 MP4 + WebM, a poster still and a short card clip into `assets/video/`. Full commands and options are in [`docs/MEDIA.md`](docs/MEDIA.md).
2. Add an entry to `videos` in the config. Copy the `rider-hero` entry and replace `rider-hero` with `<name>` in every path.
3. Assign it in `videoSlots`: set `videoId: "<name>"` on the slot. `mode` is `card` (plays on hover or when in view), `inline` (gallery slide with a play button) or `none`. `overlayOpacity`, `focalPoint`, `start` and `playbackRate` are here too. No code edits are needed.

Video sections: `category-cards` · `product-gallery` (uses `product.video`).

### The site background (scroll-driven)
The background is a fixed, full-screen canvas behind every page, drawn from WebP frame sequences of the rider clips. Nothing autoplays. Your scroll position picks the frame: the top of the page shows frame 1, the bottom shows the last frame, and scrolling down or up moves forward or backward through the clip. Stop scrolling and it holds.

There are **two sequences, picked by screen orientation**:
- **Landscape screens** (wider than tall: laptops, desktops, ultrawide) use the **16:9 clip** (`assets/source/rider-hero-16x9.mp4`, 240 frames = every frame, 1920×1080 and a smaller 1280×720 set).
- **Portrait screens** (phones, portrait tablets) use the **9:16 clip** (`assets/source/rider-hero.mp4`, 188 frames = every frame, 1080×1920 and a smaller 720×1280 set).
- Only the active sequence loads. Rotating the phone or resizing the window across square switches sequence at the same scroll progress, so you stay at the same point in the animation.

To change a background clip:
1. Drop the clip in `assets/source/<name>.mp4` and run `bash tools/media.sh <name>`. The script detects whether the clip is landscape or portrait and writes both sizes into `assets/frames/16x9/…` or `assets/frames/9x16/…` (see `docs/MEDIA.md`).
2. In `config.backdrop.sequences.landscape` or `.portrait`, set `path`, `pathSmall` and `count`, and update `alt`. No code edits are needed.

How it looks:
- The frame **fills the whole screen** (cover), with no bars and no side panels. Because each screen shape gets a clip of matching shape, there's almost no crop. The small crop on odd shapes (ultrawide, very tall phones) is centred on each sequence's `focalPoint` `{ x, y }` (default `{ x: 0.5, y: 0.5 }`).
- Mouse parallax on desktop nudges that point slightly (`motion.pointerParallax`, max about 0.02). The frame is drawn at `overscale` (1.04), so that movement never shows an edge.
- Motion is smooth at any scroll speed: the canvas blends between neighbouring frames instead of jumping from one to the next, and nothing heavy (CSS blur filters, frosted-glass panels, blend modes) is recalculated over the moving background. This holds a steady 60 fps on a normal laptop.
- Sections change only the look of the frame: brightness, blur, dim and a red tint. Pick a look per section with `data-scene="hero" | "feature" | "content" | "shelf" | "footer"` in the HTML. Sections without one use `defaultScene`. Product grids use `shelf` automatically. Text sections keep their own dark translucent panels, so text stays readable over the full-screen frame.
- Resolution: each sequence has a full-size `path` and a smaller `pathSmall`. The small set is used on slow connections or when it already covers the screen at its pixel density without being enlarged. Otherwise the full-size set loads. A 1920-wide desktop shows the 16:9 frames at their native 1920 px. Wider screens (2560) enlarge them about 1.4×.
- Visitors with reduced motion or Save-Data get one still frame (`stillFrame`) and no movement.

Config fields in `config.backdrop`:
- `enabled`, `pages`: turn it on or off, and choose the pages that get it.
- `sequences.landscape` / `sequences.portrait`: `path`, `pathSmall` (folder patterns with `%04d` numbering), `count`, `focalPoint`.
- `scroll.mapping`: `"page"` (default) plays the whole clip once, top to bottom. `"distance"` makes one pass every `screensPerLoop` screens, and `pingpong` reverses at the end.
- `scroll.smoothing` (0.05 floaty … 1 no easing), `scroll.startOffset` and `scroll.endOffset` (px).
- `overscale`, `stillFrame`.
- `scenes`, `defaultScene`, and `motion` (scene blend time, pointer parallax, light sweep, red progress line, word-by-word headlines, tagline ticker).

## 4. Orders

1. **Checkout:** the customer fills in name, phone, city and address, chooses cash on delivery or bank transfer, and passes a Turnstile check.
2. **Pricing:** the API prices the order from the database (client prices are never trusted) and creates **GD-####**.
3. **WhatsApp:** the customer's WhatsApp opens with the order summary.
4. **Fulfilment in the admin:** **Confirm** deducts stock atomically (the last item can't be sold twice), then Shipped and Delivered. **Cancel** after confirming puts the stock back.

The cart re-checks prices and stock with the API whenever it's opened and before checkout, and tells the customer what changed.

## 5. Before launch: placeholders still to fill

**In the admin → Settings:** WhatsApp number (digits, e.g. `923001234567`), phone, email, city, address, hours, delivery fee, COD and bank transfer.

**In `web/js/site.config.js`:**
- `store.*` contact fields are only an offline fallback now. Also set `store.deliveryNote`, `store.siteUrl` and `store.mapEmbedUrl` (optional).
- `store.name`: currently the brief's default "The Gear Doctor". Confirm it.
- `footer.legal`: legal business name
- `about.intro`, `about.story` (3 paragraphs), `about.stats[2]` (track days)
- `about.image`: currently a still from the hero video. Replace with a real portrait.
- **Products, categories, brands, guides, FAQs and testimonials** start empty. Add them in the admin (see [ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)). Add categories and brands first, then products.
- `instagramPosts`: 14 posts shown as official embeds (7 per account). Add `image` paths after downloading the media (see below).

**Media:**
- `assets/source/fury_moto_2026-05-21_1.jpg`, `_2.jpg`, `fury_moto_2026-03-23_1–3.jpg`: the studio and haze photos from the brief haven't been added yet.
- Instagram media couldn't be downloaded automatically (the browser tool blocks Instagram's media links). The site shows the posts as official embeds for now. To use the files across the site (tiles, About, guide covers, reels), follow [`docs/INSTAGRAM_TODO.md`](docs/INSTAGRAM_TODO.md): export or save the media into `assets/instagram/<account>/`, then ask Claude to process it.

**SEO:** after setting `store.siteUrl`, run `API=https://<domain> node web/tools/sitemap.mjs` (rebuilds `sitemap.xml`, `robots.txt`, `manifest.webmanifest`) and make the `og:image` URL in each page's `<head>` absolute.

## 6. Project layout

```
web/                     storefront (static): index/shop/product/cart/… .html, js/, css/, assets/, tools/
  js/site.config.js      design, copy, background video, guides  ← edit me (not products)
  js/data/               api.js (fetch wrapper), products.js + settings.js (API data), cart.js (cart + checkout data)
admin/                   Angular admin → dist/admin/browser, served at /admin
  src/app/api/           generated API client (npm run gen:api, from docs/backend/openapi.draft.yaml)
api/                     .NET 10 solution: Domain / Application / Infrastructure / Api + tests
tools/                   dev-server.mjs (one local origin)
docs/                    ADMIN_GUIDE, DEPLOY, backend/ (PLAN, CONTRACTS-API, OpenAPI), CONTRACTS, MEDIA, BUILD_LOG
vercel.json              one Vercel project: /api → container, /admin → Angular, / → storefront
.github/workflows/       ci.yml (build, test, migrate + seed on main), pages.yml (manual preview)
```
Storefront libraries (CDN, pinned): GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13. The site still works if they fail to load.
