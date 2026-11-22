# Build Contracts — The Gear Doctor / Fury Moto

Every Phase 2 agent reads this first. If you need something that isn't here, **don't invent a shared API**: report it back to the orchestrator.

## 1. Stack rules
- Plain HTML + CSS + vanilla JS ES modules. No framework, no build step, no npm.
- CDN libraries (pinned, loaded as classic `<script defer>` in every page `<head>`, used via `window.*`):
  - `https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js`
  - `https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js`
  - `https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js`
- Code must work when GSAP/Lenis fail to load (check `window.gsap`).
- All paths are **relative** (`css/base.css`, not `/css/base.css`) so the site runs from any sub-folder or `file://`-style static host.
- **No user-facing text in HTML or JS.** Every string comes from `config` (`js/site.config.js`). HTML holds structure only. If you need a new string, add it under `config.ui` and list it in your report. That's the one exception to the "don't edit config" rule.

## 2. Folder structure & ownership

| Path | Owner | Notes |
|---|---|---|
| `js/site.config.js` | Orchestrator (schema). Placeholder-data agent fills `products`, `brands`, `guides`, `sizeGuides`, `testimonials`, `faqs` **arrays only** | Others: read only (may append keys under `config.ui`, and must report them) |
| `js/core/*` | Orchestrator; **backdrop.js → Orchestrator**; **video-bg.js, slots.js, manager.js → Video-engine agent** | Frozen API: read only for everyone else |
| `js/data/products.js`, `js/data/cart.js` | Orchestrator | Read only |
| `css/tokens.css`, `css/base.css` | Orchestrator | Read only. Use the variables; never hard-code colours |
| `css/video.css` | Video-engine agent (backdrop section: Orchestrator) | |
| `js/components/header.js`, `search.js`, `css/components/header.css` | Header agent | |
| `js/components/footer.js`, `css/components/footer.css` | About/Contact/Footer agent | |
| `js/components/cart-drawer.js`, `css/components/cart.css`, `js/pages/cart.js`, `cart.html` | Cart agent | |
| `js/components/product-card.js`, `js/components/size-guide.js`, `css/components/product.css` | Product-detail agent | `productCard(p)` is used by shop, home and related — build it first |
| `shop.html`, `js/pages/shop.js`, `css/pages/shop.css`, `js/components/quick-view.js` | Shop agent | |
| `product.html`, `js/pages/product.js`, `css/pages/product.css` | Product-detail agent | |
| `gear-doctor.html`, `guide.html`, `js/pages/gear-doctor.js`, `js/pages/guide.js`, `css/pages/gear-doctor.css`, `js/components/markdown.js` | Gear-Doctor agent | |
| `about.html`, `contact.html`, `js/pages/about.js`, `js/pages/contact.js`, `css/pages/about.css` | About/Contact/Footer agent | |
| `index.html`, `js/pages/home.js`, `css/pages/home.css`, `404.html`, `js/pages/404.js` | Orchestrator (Phase 3) | |
| `js/components/instagram-strip.js` | Gear-Doctor agent | Used on home + gear-doctor |
| `assets/video/*`, `assets/img/*` (except products), `docs/MEDIA.md` | Media-pipeline agent | |
| `assets/img/products/*` | Placeholder-images agent | |
| `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `assets/img/og/*`, `assets/img/icons/*`, `js/core/seo.js` | SEO agent | |
| `docs/BUILD_LOG.md` | Everyone appends; orchestrator edits | |
| `README.md` | Orchestrator | |

## 3. Page skeleton (every HTML page)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title></title>                         <!-- filled from config.seo by app/seo -->
  <meta name="description" content="">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/video.css">
  <link rel="stylesheet" href="css/components/header.css">
  <link rel="stylesheet" href="css/components/footer.css">
  <link rel="stylesheet" href="css/components/cart.css">
  <link rel="stylesheet" href="css/components/product.css">
  <link rel="stylesheet" href="css/pages/<page>.css">
  <script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
  <script type="module">import { boot } from "./js/core/app.js"; addEventListener("DOMContentLoaded", () => boot("<page>"));</script>
</head>
<body>
  <a class="skip-link" href="#main" data-bind="ui.skip">Skip to content</a>
  <div data-component="header"></div>
  <main id="main" data-page="<page>"> … page sections … </main>
  <div data-component="footer"></div>
  <div data-component="cart-drawer"></div>
</body>
</html>
```
(The skip-link fallback text is the only literal; JS replaces it.)

## 4. Module contracts

### Component / page module
```js
// js/components/<name>.js  or  js/pages/<page>.js
export default async function mount(el) { /* render into el using config */ }
```
Called by `boot()` (`js/core/app.js`). After re-rendering a region later (filters, etc.) call `refresh(region)` from `app.js` so reveals, video slots and placeholder marking re-run.

### Core imports you may use
```js
import { config, formatPrice, waLink, getVideo, getSlot, getCategory, getBrand, getGuide, isPlaceholder, markPlaceholders } from "../core/config.js";
import { html, raw, esc, renderTemplate, renderList, text, fill, picture } from "../core/render.js";
import { on, emit } from "../core/bus.js";
import { refresh, gsap, ScrollTrigger, getLenis } from "../core/app.js";
import { getProducts, getProduct, searchProducts, getRelated, getFacets, sortProducts } from "../data/products.js";
import cart from "../data/cart.js";          // items(), summary(), add(), setQty(), remove(), clear(), orderMessage()
import { mountSlot, mountSlots } from "../core/slots.js";
import { VideoBg } from "../core/video-bg.js"; // only for product gallery inline video
```
`html\`\`` escapes every interpolation. Use `raw()` only for markup you built yourself.

### Events (`js/core/bus.js`)
| Event | Detail | Who emits | Who listens |
|---|---|---|---|
| `cart:add` | `{ productId, size, color, qty }` | product page, quick-view, product card | `data/cart.js` (auto) |
| `cart:change` | `{ items, count, subtotal }` | `data/cart.js` | header badge, drawer, cart page |
| `cart:open` / `cart:close` | `{}` | header, after add-to-cart | cart drawer |
| `filter:change` | `{ cat, brand[], size[], cert[], min, max, sort, q }` | shop filters | shop grid |
| `search:open` / `search:close` | `{}` | header | search overlay |
| `video:play` / `video:pause` | `{ el }` | video engine | (optional analytics) |

## 5. Data shapes

### Product
```js
{
  id: "agv-pista-gp-rr-carbon",            // unique kebab-case; product.html?id=
  title: "AGV Pista GP RR Carbon",
  brand: "agv",                            // config.brands[].id
  category: "helmets",                     // config.categories[].id
  price: 385000,                           // PKR integer
  compareAtPrice: null,                    // or higher integer when on sale
  sizes: ["XS","S","M","L","XL"],
  colors: [{ name: "Carbon / Red", hex: "#1a1a1a" }],
  certifications: ["ECE 22.06", "FIM"],    // allowed: "DOT","ECE 22.06","FIM","SNELL","CE Level 1","CE Level 2"
  images: [{ src: "assets/img/products/helmets-1-1x1.webp", alt: "AGV Pista GP RR in carbon, side view" }],
  video: null,                             // or config.videos[].id -> extra gallery slide
  specs: { "Shell": "Carbon fibre", "Weight": "1.45 kg" },
  description: "…",
  inStock: true,
  badges: ["Rider's pick"],                // "New" | "Rider's pick" | "Sale"
  gearDoctorNote: "…"
}
```
### Brand `{ id, name, logo? }` · Category `{ id, title, image, videoSlot?, videoStart? }`
### Guide `{ id, title, type: "safety"|"myth"|"buying", excerpt, body, cover, video?, relatedProducts: [productId], source? }`
`body` is markdown-lite: blank line = paragraph, `## ` heading, `- ` bullet, `**bold**`, `[text](url)`.
### Size guide `config.sizeGuides[categoryId] = { note, columns: [..], rows: [[..]] }`
### Instagram post `{ image, url, caption, account }`
### Testimonial `{ name, bike, quote, rating }` · FAQ `{ q, a }`

## 6. Required data-attributes

| Attribute | Meaning |
|---|---|
| `data-component="header\|footer\|cart-drawer"` | mount point for shared component |
| `data-video-slot="<section>"` | wired by `slots.js` from `config.videoSlots` (sections: `category-cards`, `product-gallery`; modes `card`, `inline`, `none`) |
| `data-video-start`, `data-video-id`, `data-video-src="crop"` | per-element slot overrides |
| `data-scene="<hero\|feature\|content\|shelf\|footer>"` | backdrop look for a section (see §6a) |
| `data-reveal`, `data-reveal-delay="0.1"` | GSAP fade-up on scroll (handled by app.js) |
| `data-magnetic` | magnetic hover on primary buttons |
| `data-cart-open`, `data-cart-count` | any button that opens the drawer / shows count |
| `data-search-open` | opens search overlay |
| `data-product-id` | on every product card root |

## 6a. Scroll-driven backdrop (`js/core/backdrop.js`)
- One fixed full-screen `<canvas`> behind every page, drawing a WebP frame sequence of the rider clip. It is not a video slot and is owned by the orchestrator.
- `boot()` calls `mountBackdrop(page)` before the page module renders (sets `html.has-backdrop`). It calls `initMotionLayer(page)` after render (scenes, headline splits, progress line, tagline marquee).
- Frame is chosen by scroll: page top = frame 1, page bottom = last frame (`config.backdrop.scroll.mapping: "page"`). Never cropped; desktop uses `desktopAlign`, the rest of the screen is a blurred fill of the same frame.
- `config.backdrop`: `enabled`, `pages`, `frames {desktop, mobile, count}`, `alt`, `scroll {mapping, smoothing, startOffset, endOffset, screensPerLoop, pingpong}`, `desktopAlign`, `blurFill {blur, darken}`, `stillFrame`, `defaultScene`, `scenes {hero, feature, content, shelf, footer}`, `motion {…}`.
- Scenes may change only brightness, blur, dim and red tint. Never zoom or crop.
- `data-scene="<hero|feature|content|shelf|footer>"` on a section picks its scene. Sections without it use `defaultScene`. Any element containing `.pcard` (product grids) uses `shelf` automatically.
- backdrop.js adds `.bd-scene bd-scene--<name>` to every section; CSS (`css/video.css`) uses these classes for the readability panels.
- Reduced motion / Save-Data: only `stillFrame` is loaded and drawn.

## 7. Shared UI classes (from `css/base.css`)
`.container .section .stack .grid .btn .btn--primary .btn--ghost .btn--block .pill .pill--cert .pill--badge .pill-row .price .price__compare .eyebrow .muted .visually-hidden`.
Certification badges are always `<span class="pill pill--cert">ECE 22.06</span>`; product badges are `.pill--badge`.

## 8. Naming
- Files: kebab-case. CSS classes: BEM-ish `block__el--mod`. One CSS file per owner as listed above.
- Images: `assets/img/<group>/<name>-<width>.(webp|jpg)` (widths 800/1600/2400). Product placeholders: `assets/img/products/<category>-<n>-1x1.webp` and `-4x5.webp`.
- Videos: `assets/video/<id>-720.mp4|webm`, `-1080.*`, `-crop.mp4`, `-poster.webp|jpg`. Backdrop frames: `assets/frames/desktop|mobile/frame_0001.webp` (other clips: `assets/frames/<name>/desktop|mobile/`).

## 9. Accessibility & motion (every agent)
- Keyboard reachable; visible focus; drawers/modals trap focus, ESC closes, focus returns to the opener.
- Every `<img>` has alt (decorative = `alt=""`). Icon buttons have `aria-label` from config.
- Respect `html.reduced-motion` (no movement, just appear).
- Mobile first. Tap targets ≥ 44px. Test at 375 / 768 / 1440.
- No layout shift: set `aspect-ratio` on media boxes.

## 10. Agent report format
Return: (1) files created/changed, (2) what you did, (3) remaining `[PLACEHOLDER]`s, (4) keys you added to `config.ui`, (5) any contract you needed but didn't have. Append one line to `docs/BUILD_LOG.md`.
