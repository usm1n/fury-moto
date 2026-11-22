# Build Log

| # | Phase | Agent (tier) | What |
|---|---|---|---|
| 1 | 0 | Instagram @fury__moto (LOW / haiku) | Profile + 9 own posts identified. Media download blocked (browser tool withholds Instagram CDN URLs) → `docs/INSTAGRAM_TODO_fury__moto.md` |
| 2 | 0 | Instagram @fury_the_gear_doc (LOW / haiku) | All 7 reels + captions/dates captured. Media blocked the same way → `docs/INSTAGRAM_TODO_fury_the_gear_doc.md` |
| 3 | 1 | Orchestrator (HIGH / opus) | `js/site.config.js` schema, `css/tokens.css`, `css/base.css`, `js/core/*` (config, render, bus, slots, app, manager, video API stubs), `js/data/products.js`, `js/data/cart.js`, `docs/CONTRACTS.md` |

## Library decisions
- GSAP 3.12.5 + ScrollTrigger: scroll reveals, pinned scrub section.
- Lenis 1.1.13: smooth scroll, synced to the GSAP ticker.
- No other libraries.

## Environment notes
- ffmpeg installed via winget (Gyan.FFmpeg) for the media pipeline.
- Hero source: `assets/source/rider-hero.mp4`, copied from the uploaded `Rider_in_garage_taps_helmet_3a536d5b_1080p.mp4`. The original stays at the repo root and is git-ignored.
- The `fury_moto_2026-*.jpg` photos named in the brief are **not present** yet. Placeholders will be used.
