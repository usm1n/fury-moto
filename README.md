# The Gear Doctor — Fury Moto riding-gear store (frontend)

A static, video-led storefront for Umair's riding-gear store ([@fury__moto](https://www.instagram.com/fury__moto/) · [@fury_the_gear_doc](https://www.instagram.com/fury_the_gear_doc/)).
Plain HTML + CSS + vanilla JS modules. **No build step, no framework.** It runs on any static host.

> **Almost every change is made in one file: [`js/site.config.js`](js/site.config.js).**
> Store name, text, products, prices, colours, fonts, videos and the sections that show them, contact details, nav and footer all live there.

---

## 1. Run it locally

You need any static web server; opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`.

```bash
# from the project folder
npx http-server . -p 8080 -c-1
# then open http://127.0.0.1:8080/index.html
```
Alternatives: `python -m http.server 8080` or the VS Code "Live Server" extension.

Pages: `index.html` · `shop.html` (`?cat=helmets`, filters in the URL) · `product.html?id=…` · `cart.html` · `gear-doctor.html` · `guide.html?id=…` · `about.html` · `contact.html` · `404.html`.

Dev helpers: `dev/viewports.html?page=shop.html` previews any page at 375 px and 768 px side by side.

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
| Show Instagram posts | fill `instagramPosts` with `{ image, url, caption, account }`. While it's empty, the site shows "follow" cards for both accounts instead. |

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
The background is a fixed, full-screen canvas behind every page, drawn from a sequence of WebP frames of the rider clip. Nothing autoplays. Your scroll position picks the frame: the top of the page shows frame 1, the bottom shows the last frame, and scrolling down or up moves forward or backward through the clip. Stop scrolling and it holds.

To change the background clip:
1. Drop the clip in `assets/source/<name>.mp4` and run `bash tools/media.sh <name>`. The script writes the frame sequence (150 frames by default, `FRAME_COUNT`) as 1080×1920 desktop and 720×1280 mobile WebP into `assets/frames/`. Other clips go into `assets/frames/<name>/`.
2. In `config.backdrop`, point `frames.desktop`, `frames.mobile` and `frames.count` at the new set, and update `alt`. No code edits are needed.

How it looks:
- The frame **fills the whole screen on every device** (cover), with no bars and no side panels. Where the screen's shape differs from 9:16 (desktop and ultrawide especially), the frame is cropped around `focalPoint` `{ x, y }` (fractions of the frame, default `{ x: 0.5, y: 0.35 }`, the helmet and upper chest). That point is kept centred on screen, so the rider stays in shot. `focalPointMobile` can override it on phones.
- Mouse parallax on desktop nudges the focal point slightly (`motion.pointerParallax`, max about 0.02). The frame is drawn at `overscale` (1.04), so that movement never shows an edge.
- Sections change only the look of the frame: brightness, blur, dim and a red tint. Pick a look per section with `data-scene="hero" | "feature" | "content" | "shelf" | "footer"` in the HTML. Sections without one use `defaultScene`. Product grids use `shelf` automatically. Text sections keep their own dark translucent panels, so text stays readable over the full-screen frame.
- Resolution: the 1080×1920 set is loaded whenever the 720 set would have to be enlarged to cover the screen. On wide desktops even the 1080 set is enlarged about 1.9× (1920 px) to 2.5× (2560 px), so it looks softer there. Sharper desktop frames need a higher-resolution source clip (see `docs/MEDIA.md`).
- Visitors with reduced motion or Save-Data get one still frame (`stillFrame`) and no movement.

Config fields in `config.backdrop`:
- `enabled`, `pages`: turn it on or off, and choose the pages that get it.
- `frames`: `desktop` and `mobile` folder patterns (`%04d` numbering) and `count`.
- `scroll.mapping`: `"page"` (default) plays the whole clip once, top to bottom. `"distance"` makes one pass every `screensPerLoop` screens, and `pingpong` reverses at the end.
- `scroll.smoothing` (0.05 floaty … 1 no easing), `scroll.startOffset` and `scroll.endOffset` (px).
- `focalPoint`, `focalPointMobile`, `overscale`, `stillFrame`.
- `scenes`, `defaultScene`, and `motion` (scene blend time, pointer parallax, light sweep, red progress line, word-by-word headlines, tagline ticker).

## 4. Orders

Checkout is **"Order on WhatsApp"**. The cart (saved in the browser) builds a message with items, sizes, quantities and the PKR total, and opens `wa.me/<store.whatsapp>`. Until `store.whatsapp` holds a real number, the link opens WhatsApp with no recipient, on purpose.
Product data is read only through `js/data/products.js` (`getProducts()`, `getProduct(id)`), so a backend API can replace the config later by changing that one file.

## 5. Before launch: placeholders still to fill

**In `js/site.config.js`:**
- `store.city`, `store.address`, `store.whatsapp` (digits, e.g. `923001234567`), `store.phoneDisplay`, `store.email`, `store.hours`, `store.deliveryNote`, `store.siteUrl`, `store.mapEmbedUrl` (optional)
- `store.name`: currently the brief's default "The Gear Doctor". Confirm it.
- `store.cashOnDelivery`: confirm true/false
- `footer.legal`: legal business name
- `about.intro`, `about.story` (3 paragraphs), `about.stats[2]` (track days)
- `about.image`: currently a still from the hero video. Replace with a real portrait.
- `testimonials`: **all 4 are invented**. Replace them with real customer quotes.
- `faqs`: delivery time, COD coverage, exchange window, authenticity answer
- `products`: **all 28 are placeholders**. Models, prices, specs and certifications are realistic but unverified, and images are labelled placeholders in `assets/img/products/`.
- `guides`: 8 drafts. The 4 reel-based guides were written from the reel titles only. Umair should review them all, especially **DOT vs FIM**.
- `instagramPosts`: empty (see below)

**Media:**
- `assets/source/fury_moto_2026-05-21_1.jpg`, `_2.jpg`, `fury_moto_2026-03-23_1–3.jpg`: the studio and haze photos from the brief haven't been added yet.
- Instagram media couldn't be downloaded automatically (the browser tool blocks Instagram's media links). The post URLs to save by hand are listed in [`docs/INSTAGRAM_TODO_fury__moto.md`](docs/INSTAGRAM_TODO_fury__moto.md) and [`docs/INSTAGRAM_TODO_fury_the_gear_doc.md`](docs/INSTAGRAM_TODO_fury_the_gear_doc.md). Save them to `assets/instagram/<account>/`, run reels through `tools/media.sh`, and add them to `videos`/`instagramPosts`.
- Product photos to replace `assets/img/products/*`.

**SEO:** after setting `store.siteUrl`, run `node tools/sitemap.mjs` (rebuilds `sitemap.xml`, `robots.txt`, `manifest.webmanifest`) and make the `og:image` URL in each page's `<head>` absolute.

## 6. Project layout

```
index.html shop.html product.html cart.html gear-doctor.html guide.html about.html contact.html 404.html
js/site.config.js        ← edit me
js/core/                 app bootstrap, config loader, render helpers, event bus, video engine, SEO
js/data/                 products.js (data access), cart.js (cart state + WhatsApp message)
js/components/           header, search, footer, cart drawer, product card, size guide, quick view, markdown, instagram strip
js/pages/                one module per page
css/tokens.css base.css video.css components/ pages/
assets/source/           original media (untouched)
assets/video/ assets/frames/ assets/img/  generated media
tools/                   media.sh, placeholders.sh, sitemap.mjs
docs/                    CONTRACTS.md, MEDIA.md, BUILD_LOG.md, SEO_HEAD.html, Instagram TODOs
dev/                     test/preview pages (not linked from the site)
```
Libraries (CDN, pinned): GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13. The site still works if they fail to load.
