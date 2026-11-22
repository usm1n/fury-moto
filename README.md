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

Dev helpers: `dev/viewports.html?page=shop.html` previews any page at 375 px and 768 px side by side. `dev/video-test.html` exercises every video mode.

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

## 3. Add a video

1. Drop the clip in `assets/source/<name>.mp4` (9:16 works best).
2. Run the media script. It needs ffmpeg (`winget install Gyan.FFmpeg`):
   ```bash
   bash tools/media.sh <name>
   ```
   It writes 720/1080 MP4 + WebM loops, an all-keyframe scrub file, poster stills, a blurred desktop fill, a 60-frame iOS fallback sequence and a short card clip into `assets/video/`. Full commands and options are in [`docs/MEDIA.md`](docs/MEDIA.md).
3. Add an entry to `videos` in the config. Copy the `rider-hero` entry and replace `rider-hero` with `<name>` in every path.
4. Assign it in `videoSlots`: set `videoId: "<name>"` on whichever section should use it. You can also change a section's `mode` (`background` · `scrub` · `card` · `inline` · `none`), `overlayOpacity`, `focalPoint`, `start` or `playbackRate`. No code edits are needed.

### The site-wide backdrop (motion design)
One video plays as a **fixed, full-screen background behind every page** (`backdrop` in the config). As visitors scroll, each section changes the backdrop with a **scene** that is tweened smoothly: zoom, drift, blur, darkness, saturation and red tint. `hero` is sharp, `feature` (call-to-action band, page headers) zooms in, `content` is softer, `shelf` (product grids) is calmest, and `footer` gets a red glow. On top of that:
- the video drifts as you scroll and follows the mouse on desktop
- a light sweep crosses it every few seconds
- a red progress line runs along the top
- a tagline ticker speeds up and skews with scroll speed
- headlines reveal word by word

Change scenes or motion in `backdrop.scenes`, `backdrop.sceneMap` and `backdrop.motion`. Point `backdrop.videoId` at any clip in `videos`, or set `enabled: false` to switch it off. Visitors with reduced motion or Save-Data get the poster still with no movement.

Video sections: `hero` · `built-for-ride` · `category-cards` · `shop-header` · `product-gallery` (uses `product.video`) · `gear-doctor-header` · `cta-band` · `about` · `footer` · `404`.
The engine lazy-loads videos, never plays more than 2 at once, and shows posters only for reduced-motion or Save-Data visitors. On desktop the hero shows the 9:16 clip as a framed panel over a blurred fill, so there are no black bars.

Photos: `bash tools/media.sh photos <in.jpg> <name>` → WebP + JPG at 2400/1600/800 in `assets/img/photos/`.

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
assets/video/ assets/img/  generated media
tools/                   media.sh, placeholders.sh, sitemap.mjs
docs/                    CONTRACTS.md, MEDIA.md, BUILD_LOG.md, SEO_HEAD.html, Instagram TODOs
dev/                     test/preview pages (not linked from the site)
```
Libraries (CDN, pinned): GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13. The site still works if they fail to load.
