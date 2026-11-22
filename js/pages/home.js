/** Homepage. All copy from config.home / config.store; sections hide themselves when their data is empty. */
import { config, waLink } from "../core/config.js";
import { html, raw, esc, renderList, text } from "../core/render.js";
import { getProducts } from "../data/products.js";

const $ = (sel, root = document) => root.querySelector(sel);
const h = (k) => $(`[data-home="${k}"]`);

async function loadModule(path, name) {
  try { return (await import(path))[name]; } catch (e) { console.warn(`[home] ${path} unavailable`, e); return null; }
}

export default async function mount(main) {
  const { store, home, ui = {} } = config;
  const seo = await loadModule("../core/seo.js", "setSeo");
  const storeLd = await loadModule("../core/seo.js", "storeJsonLd");
  if (seo) seo({ jsonLd: storeLd?.() });
  else document.title = config.seo?.defaultTitle || store.name;

  // ---- hero
  text($('[data-hero="eyebrow"]', main), home.hero.eyebrow);
  text($('[data-hero="title"]', main), store.name);
  text($('[data-hero="tagline"]', main), store.tagline);
  renderList($('[data-hero="ctas"]', main), home.hero.ctas, (c) =>
    html`<a class="btn btn--${c.style === "primary" ? "primary" : "ghost"}" href="${c.href}" ${raw(c.style === "primary" ? "data-magnetic" : "")}>${c.label}</a>`);
  renderList($('[data-hero="taglines"]', main), store.secondaryTaglines, (t) => html`<li>${t}</li>`);
  heroIntro(main);

  // ---- categories (video cards)
  text(h("categoriesTitle"), home.categoriesTitle);
  renderList(h("categories"), config.categories, (c, i) => html`
    <a class="cat-tile" href="shop.html?cat=${c.id}" data-reveal data-reveal-delay="${(i % 4) * 0.06}"
       ${raw(c.videoSlot ? `data-video-slot="${esc(c.videoSlot)}" data-video-start="${esc(c.videoStart ?? 0)}"` : "")}>
      <img class="cat-tile__img" src="${c.image}" alt="" loading="lazy" decoding="async">
      <span class="cat-tile__title">${c.title}</span>
      <span class="cat-tile__arrow" aria-hidden="true">→</span>
    </a>`);

  // ---- built for the ride (scrub)
  text(h("rideTitle"), home.builtForRide.title);
  renderList(h("beats"), home.builtForRide.beats, (b, i) => html`
    <div class="ride__beat" data-beat>
      <span class="ride__num">0${i + 1}</span>
      <h3>${b.title}</h3>
      <p>${b.text}</p>
    </div>`);

  // ---- featured products
  text(h("featuredTitle"), home.featuredTitle);
  text(h("shopAll"), ui.shopAll);
  const all = await getProducts();
  let featured = home.featuredIds?.length
    ? home.featuredIds.map((id) => all.find((p) => p.id === id)).filter(Boolean)
    : all.filter((p) => (p.badges || []).includes("Rider's pick"));
  if (featured.length < 4) featured = [...featured, ...all.filter((p) => !featured.includes(p))].slice(0, 8);
  featured = featured.slice(0, 8);
  const productCard = await loadModule("../components/product-card.js", "productCard");
  if (productCard && featured.length) renderList(h("featured"), featured, (p) => productCard(p));
  else h("featured").closest("section").hidden = !featured.length;

  // ---- CTA band
  text(h("ctaTitle"), home.ctaBand.title);
  text(h("ctaText"), home.ctaBand.text);
  const ctaBtn = h("ctaButton");
  text(ctaBtn, home.ctaBand.button);
  ctaBtn.href = waLink(home.ctaBand.message);

  // ---- guides teaser
  text(h("guidesTitle"), home.guidesTitle);
  text(h("guidesAll"), home.guidesAll);
  const typeLabels = config.gearDoctor?.typeLabels || {};
  const guides = (config.guides || []).slice(0, 3);
  if (guides.length) {
    renderList(h("guides"), guides, (g, i) => html`
      <a class="guide-teaser" href="guide.html?id=${g.id}" data-reveal data-reveal-delay="${i * 0.08}">
        <span class="guide-teaser__media"><img src="${g.cover}" alt="" loading="lazy" decoding="async"></span>
        <span class="pill">${typeLabels[g.type] || g.type}</span>
        <h3>${g.title}</h3>
        <p class="muted">${g.excerpt}</p>
      </a>`);
  } else h("guides").closest("section").hidden = true;

  // ---- testimonials
  text(h("testimonialsTitle"), home.testimonialsTitle);
  if (config.testimonials?.length) {
    renderList(h("testimonials"), config.testimonials, (t, i) => html`
      <figure class="testimonial" data-reveal data-reveal-delay="${i * 0.06}">
        <div class="testimonial__stars" aria-label="${t.rating} / 5">${"★".repeat(t.rating || 5)}</div>
        <blockquote>${t.quote}</blockquote>
        <figcaption><strong>${t.name}</strong> <span class="muted">${t.bike}</span></figcaption>
      </figure>`);
  } else h("testimonialsWrap").hidden = true;

  // ---- instagram strip
  const strip = await loadModule("../components/instagram-strip.js", "default");
  if (strip) { h("instagram").classList.add("container"); await strip(h("instagram")); }
  else h("instagram").hidden = true;

  // ---- FAQ
  text(h("faqTitle"), home.faqTitle);
  if (config.faqs?.length) {
    renderList(h("faqs"), config.faqs, (f) => html`
      <details class="faq__item"><summary>${f.q}</summary><p>${f.a}</p></details>`);
  } else h("faqWrap").hidden = true;
}

/** Staggered hero headline intro (GSAP), skipped for reduced motion. */
function heroIntro(main) {
  const g = window.gsap;
  if (!g || document.documentElement.classList.contains("reduced-motion")) return;
  const els = main.querySelectorAll(".hero__eyebrow, .hero__title, .hero__tagline, .hero__ctas, .hero__taglines");
  g.from(els, { y: 40, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.15 });
}
