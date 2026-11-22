You are the lead engineer and orchestrator for this build. You are a senior creative front-end developer and motion designer. Build a complete, production-ready FRONTEND for a motorcycle riding-gear store run by Umair ("Fury Moto", Instagram @fury__moto) and his gear brand "The Gear Doctor" (@fury_the_gear_doc), based in Pakistan.

THE TWO MOST IMPORTANT RULES
1. Video is the backbone of the design. A cinematic 9:16 rider video (and its stills) is used THROUGHOUT the site wherever it fits — not only in the hero. See section 4.
2. The site will change often. Almost every future change (store name, products, prices, colours, text, video files, which sections use video, contact info) must be made by editing ONE config file, /js/site.config.js — never by editing HTML, CSS or animation code.

======================================================================
## 0. HOW YOU WILL WORK: MULTI-AGENT EXECUTION (REQUIRED)
======================================================================
You (the main session) are the ORCHESTRATOR. You plan, define contracts, spawn subagents with the Agent/Task tool, review their output, and integrate. Do not write every file yourself.

### 0.1 Model tiers — pick the cheapest model that can do the job
| Tier | Model | Use for |
|---|---|---|
| LOW | haiku | Small, well-specified, low-judgement tasks: generating placeholder images, filling config arrays with placeholder products, writing README sections, SEO/meta/OG tags, favicon + manifest, alt-text, running ffmpeg/encode commands from an exact spec, lint/format passes, link and path checking, accessibility label sweeps, writing JSON-LD. |
| MID | sonnet | Building individual sections/pages/components against a fixed contract: product grid, product detail page, cart drawer, filters, size guide, Gear Doctor guides page, footer, nav, forms. |
| HIGH | opus (or yourself) | Architecture, the config schema, the shared video engine (section 4), hero + scroll choreography, final integration, cross-browser/performance review, and the final QA audit. |

Default to LOW. Escalate a task to MID only if it needs design judgement or touches more than ~2 files. Use HIGH only for the items listed. If a LOW agent fails a task twice, re-spawn it at MID — do not loop.

### 0.2 Execution phases
**Phase 0 — Asset collection (2 LOW agents in parallel, one per Instagram account — see section 2.1).** Start this first; you can write Phase 1 contracts while they run.

**Phase 1 — Contracts (you, HIGH, sequential).** Before spawning Phase 2:
- Write /js/site.config.js schema with every field commented (sections 2–3).
- Write /css/tokens.css (CSS custom properties fed from config) and /css/base.css.
- Write /js/core/ : config loader, renderer helpers (`renderList`, `renderTemplate`), event bus, and the VIDEO ENGINE API surface (`VideoBg.mount(el, options)`, `VideoScrub.mount(el, options)`) with stub implementations.
- Write /docs/CONTRACTS.md: folder structure, file ownership per agent, naming rules, the data shape of a product, the events (`cart:add`, `cart:change`, `filter:change`), and the HTML data-attributes each section must expose.
Nothing else starts until Phase 1 is done.

**Phase 2 — Parallel build (spawn agents in parallel, in ONE batch).**
Give every agent: its exact task, the files it OWNS (it may only create/edit those), the files it may READ, the contract doc, and its acceptance checklist. No two agents own the same file.
- [HIGH] Video engine: implement /js/core/video-bg.js and /js/core/video-scrub.js fully (section 4).
- [LOW] Media pipeline: run the ffmpeg commands in section 4.4 on /assets/source/ AND every video/photo in /assets/instagram/ (from section 2.1), output to /assets/video/ and /assets/img/; generate posters and blurred fill frames.
- [LOW] Placeholder data: fill config `products` (≥ 24 items across all categories), `brands`, `guides` with realistic placeholder content in PKR.
- [LOW] Placeholder images: generate labelled dark-gradient product placeholders (1:1 and 4:5) into /assets/img/products/.
- [MID] Header/nav + mobile menu + search overlay.
- [MID] Shop: category page with filters (category, brand, size, price, certification e.g. DOT/ECE/FIM), sort, grid, quick-view.
- [MID] Product detail page: gallery, size selector, size-guide modal, specs, certification badges, related products.
- [MID] Cart: slide-out drawer + /cart.html, quantity edit, subtotal, persisted in localStorage (try/catch), "Order on WhatsApp" checkout (section 5).
- [MID] Gear Doctor hub: guides list + guide page template (safety tips, gear myths, buying guides, DOT vs FIM helmet explainer).
- [MID] About / Rider page + Contact page + Footer.
- [LOW] SEO + meta + OG images + JSON-LD Product schema + sitemap.xml + robots.txt + favicon/manifest.

**Phase 3 — Integration (you, HIGH).** Wire the video engine into every video slot in section 4.2, run the hero/scroll choreography, resolve conflicts, unify spacing and type.

**Phase 4 — QA (parallel).**
- [LOW] Broken links/paths, missing alt text, console errors, unused files, config fields not rendered.
- [LOW] Lighthouse-style checklist pass: image sizes, lazy-loading, preload hints.
- [MID] Accessibility review: keyboard flow, focus traps in drawer/modals, contrast, reduced motion.
- [HIGH] Final review by a fresh agent that has NOT seen the build process: open every page at 375px, 768px, 1440px, check every acceptance criterion in section 8, and report failures. Fix what it finds.

### 0.3 Rules for subagents
- Each agent returns: files changed, what it did, anything left as a [PLACEHOLDER], and any contract it needed but didn't have (it must NOT invent new shared APIs — it reports back and you decide).
- Agents never edit /js/site.config.js schema, /js/core/*, or /css/tokens.css except the agent that owns them.
- Keep a running /docs/BUILD_LOG.md: which agent (and model tier) did what.

======================================================================
## 1. ARCHITECTURE
======================================================================
- Plain HTML + CSS + vanilla JS (ES modules). No framework, no build step. Must run from any static host.
- Libraries via CDN with pinned versions: GSAP + ScrollTrigger, Lenis (smooth scroll). Nothing else unless justified in BUILD_LOG.
- ALL user-facing text, lists, images, videos, prices, colours and links live in /js/site.config.js as one exported object. HTML contains structure only.
- Theme colours and fonts from config are applied as CSS custom properties at load.
- Repeating content (products, categories, brands, guides, testimonials, FAQs, video slots) are arrays; adding an item adds it to the site.
- Placeholders are written "[PLACEHOLDER: description]" and are visibly highlighted when `config.devMode = true`.
- Pages: index.html, shop.html (category via ?cat=), product.html (?id=), cart.html, gear-doctor.html, guide.html (?id=), about.html, contact.html, 404.html.

======================================================================
## 2. SOURCE MATERIAL
======================================================================
- Instagram (main): https://www.instagram.com/fury__moto/ — Umair. Bio: "Motorcycle Creator | Rider · Lean • POV • Riding Skills · GSX-R1000 | R1 | S1000RR · Ride. Learn. Repeat." ~12K followers. YouTube: youtube.com/@fury_moto
- Instagram (gear brand): https://www.instagram.com/fury_the_gear_doc/ — "The Gear Doctor". Bio: "Motorcycle Gear Explained Simply · Safety Tips | Gear Myths | Buying Guides · Know Your Gear Before You Ride · By @fury__moto"
- Visual identity from his content: red / black / white Alpinestars GP Plus race suit, carbon + red Alpinestars Supertech R10 helmet, dark race-garage settings with haze, strip lights and track-map wall panels. Premium, moody, motorsport-editorial.
- Media I will place in /assets/source/ before you start (if missing, use labelled placeholders and list exactly what's needed in the README):
  - `rider-hero.mp4` — 9:16, ~8 s, rider in pit garage, generated in Google Flow (may be several clips: `rider-hero-2.mp4`, …).
  - `fury_moto_2026-05-21_1.jpg`, `fury_moto_2026-05-21_2.jpg` — full-body red suit, studio (3072×4096).
  - `fury_moto_2026-03-23_1.jpg`, `_2.jpg`, `_3.jpg` — red suit in haze / pit garage close-up (1024–1440 wide).

### 2.1 Collect assets from both Instagram accounts (REQUIRED — do this in Phase 1, before contracts are final)
This is the client's own content, used on his own store. Collect from BOTH accounts:
- https://www.instagram.com/fury__moto/
- https://www.instagram.com/fury_the_gear_doc/

What to collect, per account:
- Profile picture (largest available).
- Bio text, highlight names and highlight cover images.
- The latest ~40 posts on @fury__moto and ALL posts on @fury_the_gear_doc: every image in each carousel at the largest resolution served, reel/video files where downloadable (otherwise the reel's cover frame), caption text, post date, and the post URL.

How:
1. Instagram blocks plain HTTP fetching. If a browser tool is available (e.g. Claude in Chrome MCP, Playwright with my logged-in profile), use it: open each profile, scroll the grid to load posts, open each post, step through every carousel slide, and read the image `srcset` / video `src` for the largest version. Wait 2–3 s between posts and pause between downloads so the browser doesn't block multiple downloads.
2. Decode post dates from the page's `<time datetime>` attribute.
3. If no browser tool is available or access fails, DO NOT stop the build: continue with placeholders and write /docs/INSTAGRAM_TODO.md listing each post URL and file I must download manually.

Where to save:
- /assets/instagram/fury__moto/ and /assets/instagram/fury_the_gear_doc/
- File names: `<account>_<YYYY-MM-DD>_<shortcode>_<slideNo>.<ext>` (e.g. `fury__moto_2026-05-21_DYmF_I2iPZn_1.jpg`).
- Write /assets/instagram/manifest.json: one entry per file { account, file, type: image|video, width, height, date, postUrl, caption, slide, tags[] } and auto-tag each entry (helmet, suit, gloves, boots, bike, garage, riding, portrait, guide) so the config can reference assets by tag.

How to use them:
- Run every collected video through the media pipeline (section 4.4) and add it to `config.videos`; use them alongside the Flow hero video in `videoSlots` so the site's video comes from his real content.
- Use photos for category tiles, product placeholders that match the category, About page, and Gear Doctor guide covers. @fury_the_gear_doc posts (e.g. "DOT vs FIM") become the seed `guides` content — summarise captions in your own words, link back to the post.
- Add an "On Instagram" strip (latest 8 posts from the manifest, linking to each post) on the homepage and Gear Doctor page.
- Never use other people's posts the accounts reposted or collaborated on (check the post author matches the account) and skip anything showing other identifiable people without the rider.

Agent assignment: this is a LOW (haiku) task if a browser tool is available, run as TWO parallel agents (one per account). The orchestrator reviews the manifest before Phase 2.

======================================================================
## 3. CONFIG SHAPE (create at least these, commented)
======================================================================
- store: name "[PLACEHOLDER: store name — default 'The Gear Doctor']", tagline "Know Your Gear Before You Ride.", secondary taglines ["Ride. Learn. Repeat.", "Gear explained simply."], currency "PKR", city, address, whatsapp, email, hours, mapEmbedUrl (all [PLACEHOLDER]).
- socials: instagram (both accounts above), youtube.
- theme: colors { bg "#0A0A0C", surface "#141418", accent "#E10600", accent2 "#FFFFFF", text "#F5F5F7", muted "#8A8A93" }, fonts { display "Anton", body "Inter" }, radius, grain overlay on/off.
- videos: an array of named video sources { id, mp4, webm, poster, blurFill, scrubMp4, alt, loop, focalPoint } — every section references videos by id.
- videoSlots: array that decides WHERE video appears (section 4.2): { section, videoId, mode: "background" | "scrub" | "inline" | "card" | "none", overlayOpacity, focalPoint, mobileMode, desktopMode }. Changing a slot's videoId or mode here must change the site with no code edits.
- categories: Helmets, Race Suits, Jackets, Gloves, Boots, Body Armour & Protection, Accessories & Comms — each { id, title, image, videoSlot? }.
- brands: Alpinestars, Dainese, AGV, Shoei, Arai, HJC, LS2, Rev'It, TCX (placeholders; I'll edit).
- products: { id, title, brand, category, price, compareAtPrice, sizes[], colors[], certifications[] (DOT, ECE 22.06, FIM, CE level), images[], video?, specs{}, description, inStock, badges[] ("New", "Rider's pick"), gearDoctorNote }.
- sizeGuides: per category, tables.
- guides (Gear Doctor content): { id, title, type: "safety" | "myth" | "buying", excerpt, body (markdown-lite), cover, video?, relatedProducts[] }. Seed with: "DOT vs FIM — which helmet is actually safer?", "How a race suit should fit", "Gear myths: leather vs textile", "Choosing your first helmet".
- testimonials, faqs, nav, footer.

======================================================================
## 4. VIDEO THROUGHOUT THE SITE (the signature feature)
======================================================================
### 4.1 Principle
The rider video is not a one-off hero. It is the visual thread of the store: it opens the site, it scrubs with scroll, it frames categories, it sits behind calls to action, and it returns in the footer. Every use is controlled by `config.videoSlots`. Use different moments/crops of the same footage so it never feels repetitive.

### 4.2 Video slots (default config)
1. **Hero (index)** — mode `background`. Autoplay, muted, loop, playsinline. Store name + tagline + "Shop Gear" / "Gear Doctor" buttons over it.
   - Mobile (portrait): full-screen 9:16 video.
   - Desktop: the 9:16 video stands as a tall framed panel on the right ~40% of the viewport; the left side is the headline. Behind everything, a heavily blurred, darkened, scaled-up copy of the same video fills the screen (the `blurFill` asset), so there are no black bars.
2. **"Built for the ride" scroll section (index)** — mode `scrub`. Pinned section; scrolling scrubs through the video frame by frame while 3 text beats fade in (Protection / Fit / Confidence). Uses the all-keyframe `scrubMp4`.
3. **Category tiles (index + shop header)** — mode `card`. Each tile shows a still; on hover (desktop) or when ≥ 60% in view (mobile) it plays a short muted crop of the video. Only one tile plays at a time.
4. **Shop page header** — mode `background`, short height (40vh), strong dark overlay, category title on top.
5. **Product detail page** — mode `inline`: if a product has `video`, it appears as a slide in the gallery; otherwise the gallery is images only.
6. **Gear Doctor hub header** — mode `background` with the haze/close-up crop; guide cards can have their own `video`.
7. **Mid-page CTA band ("Not sure what fits? Ask the Gear Doctor")** — mode `background`, WhatsApp button.
8. **About / Rider page** — mode `scrub` or `background` (config), with Umair's story and links to both Instagram accounts and YouTube.
9. **Footer** — mode `background`, very dark overlay, slow, subtle.
10. **404 page** — mode `background`.

### 4.3 Video engine requirements (/js/core/video-bg.js, video-scrub.js)
- One shared engine used by every slot; slots only pass options.
- Lazy: only load a video when its slot is within ~1 viewport (IntersectionObserver). Pause when off-screen. At most 2 videos playing at once site-wide.
- Show `poster` immediately; fade video in on `canplay`.
- `object-fit: cover` with configurable `focalPoint` (object-position), so the rider's helmet is never cropped badly on any screen.
- Respect `prefers-reduced-motion`: show poster stills only, no scrub (scrub sections become static image + text).
- Respect Save-Data / slow connections (`navigator.connection`): posters only.
- Overlay gradient per slot (config `overlayOpacity`) so text is always readable (WCAG AA).
- Scrub: GSAP ScrollTrigger drives `video.currentTime`; smooth with lerp; on iOS fall back to a pre-extracted JPEG/WebP frame sequence drawn to canvas if seeking is choppy (generate frames in the media pipeline).
- No layout shift: every slot reserves its aspect ratio.

### 4.4 Media pipeline (LOW agent runs these exactly; ffmpeg)
For each source video in /assets/source/:
- Web loop MP4 (H.264): 1080×1920 and 720×1280, CRF 23, `-preset veryfast`, `-movflags +faststart`, no audio (`-an`).
- WebM (VP9): same sizes, CRF 33, no audio.
- Scrub MP4: 720×1280, all keyframes (`-g 1`), CRF 26, no audio.
- Poster: first frame as WebP + JPG.
- Blur fill: 480×854, heavy gaussian blur + darkened, as a short loop MP4 (for the desktop hero background).
- Frame sequence for iOS scrub fallback: 60 frames WebP at 540×960.
- Short crops (2–4 s) for category cards at 540×960.
For photos: export WebP + JPG at 2400/1600/800 widths with srcset; keep originals untouched.
Write the exact commands used into /docs/MEDIA.md so I can re-run them when I add new clips.

======================================================================
## 5. STORE BEHAVIOUR (frontend only, no backend yet)
======================================================================
- Product data comes from config (later swappable for an API: keep all data access in /js/data/products.js behind `getProducts()`, `getProduct(id)` so only that file changes).
- Cart in localStorage (wrapped in try/catch; fall back to in-memory).
- Checkout = "Order on WhatsApp": builds a pre-filled message with items, sizes, quantities and total in PKR and opens wa.me with the config number. Also show "Cash on delivery available" [PLACEHOLDER toggle].
- Search: client-side over title/brand/category.
- Filters and sort reflected in the URL so links are shareable.
- Size guide modal per category; "Ask the Gear Doctor about sizing" WhatsApp link with product name pre-filled.

======================================================================
## 6. DESIGN DIRECTION
======================================================================
- Dark, premium, motorsport-editorial. Black/charcoal surfaces, one strong red accent, white type. Subtle film grain and haze. Large condensed display type (Anton), clean body (Inter).
- Motion: GSAP reveal on scroll, magnetic primary buttons, image hover zoom, page-transition fade. All motion subtle and fast; nothing blocks interaction.
- Mobile-first: most visitors arrive from Instagram on phones. Thumb-reachable nav and cart button, sticky "Add to cart" on product pages.
- Certification badges (DOT / ECE / FIM) as small consistent pill components — this is a store run by a "gear doctor", so safety info is a selling point.

======================================================================
## 7. PERFORMANCE & ACCESSIBILITY BUDGET
======================================================================
- First load on mobile: only the hero poster + 720p hero video start loading; everything else lazy.
- LCP < 2.5 s on 4G for the hero poster. CLS < 0.1.
- All interactive elements keyboard-accessible; focus trapped in drawer/modals; ESC closes them.
- Text over video always meets AA contrast via overlays.

======================================================================
## 8. ACCEPTANCE CRITERIA (the final reviewer checks each)
======================================================================
- [ ] Changing `videoSlots[n].videoId` or `.mode` in config changes that section with no other edits.
- [ ] Video appears in at least 8 places across the site and never more than 2 play at once.
- [ ] Desktop hero has no black bars (blur fill works); mobile hero is full-screen 9:16.
- [ ] Scrub section works on Chrome, Safari (incl. iOS fallback) and Firefox; reduced-motion shows stills.
- [ ] Adding a product object to config shows it in shop, search, filters and its own product page.
- [ ] Cart persists across reloads; WhatsApp order message is correct.
- [ ] No console errors; no broken links; every image has alt text.
- [ ] devMode highlights every remaining [PLACEHOLDER].
- [ ] /assets/instagram/manifest.json exists for both accounts (or INSTAGRAM_TODO.md lists what's missing), and Instagram assets appear in video slots, category tiles, About, Gear Doctor guides and the "On Instagram" strip.
- [ ] README explains: how to run locally, how to edit the config, how to add a video (drop file → run MEDIA.md commands → add to `videos` → assign in `videoSlots`), and lists every placeholder I still need to fill.

Start with Phase 1. Show me the config schema and CONTRACTS.md before you spawn Phase 2 agents.
