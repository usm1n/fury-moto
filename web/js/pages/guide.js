/** Single guide page: guide.html?id=<id> */
import { config, getGuide, waLink, formatPrice } from "../core/config.js";
import { esc, renderTemplate } from "../core/render.js";
import { getProduct } from "../data/products.js";
import { mdLite } from "../components/markdown.js";
import { instagramEmbed, activateEmbeds } from "../components/instagram-strip.js";
import { readingTime } from "./gear-doctor.js";

const T = () => config.gearDoctor || {};

async function productCards(ids) {
  const products = (await Promise.all((ids || []).map((id) => getProduct(id).catch(() => null)))).filter(Boolean);
  if (!products.length) return "";
  let card = null;
  try { card = (await import("../components/product-card.js")).productCard; } catch { /* built in parallel */ }
  const fallback = (p) => `<article class="gd-pfallback" data-product-id="${esc(p.id)}">
      <a href="product.html?slug=${encodeURIComponent(p.slug)}">
        ${p.images?.[0] ? `<img src="${esc(p.images[0].src)}" alt="${esc(p.images[0].alt || p.title)}" loading="lazy" onerror="this.remove()">` : ""}
        <h3>${esc(p.title)}</h3><span class="price">${esc(formatPrice(p.price))}</span>
      </a></article>`;
  const cards = products.map((p) => {
    try { return String(card ? card(p, { loading: "lazy" }) : fallback(p)); } catch { return fallback(p); }
  });
  return `<section class="section gd-related" data-reveal><div class="container">
    <h2>${esc(T().guide?.related)}</h2><div class="gd-related__grid">${cards.join("")}</div></div></section>`;
}

function notFound(el) {
  const g = T().guide || {};
  document.title = (config.seo?.titleTemplate || "%s").replace("%s", g.notFoundTitle || "");
  renderTemplate(el, `<section class="section gd-notfound" data-reveal><div class="container stack">
    <h1>${esc(g.notFoundTitle)}</h1><p>${esc(g.notFoundText)}</p>
    <a class="btn btn--primary" href="gear-doctor.html">${esc(g.notFoundButton)}</a></div></section>`);
}

function jsonLd(g) {
  const s = document.createElement("script");
  s.type = "application/ld+json";
  const img = g.cover ? new URL(g.cover, location.href).href : undefined;
  s.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    headline: g.title, description: g.excerpt, image: img,
    author: { "@type": "Person", name: config.store?.owner || "Umair" },
    publisher: { "@type": "Organization", name: config.store?.shortName },
    mainEntityOfPage: location.href,
  }).replace(/</g, "\\u003c");
  document.head.appendChild(s);
}

export default async function mount(el) {
  const t = T();
  const g = t.guide || {};
  const id = new URLSearchParams(location.search).get("id");
  const guide = id ? getGuide(id) : null;
  if (!guide) return notFound(el);

  document.title = (config.seo?.titleTemplate || "%s").replace("%s", guide.title);
  document.querySelector('meta[name="description"]')?.setAttribute("content", guide.excerpt || "");
  jsonLd(guide);

  const all = config.guides || [];
  const i = all.findIndex((x) => x.id === guide.id);
  const prev = i > 0 ? all[i - 1] : null;
  const next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  const url = location.href;
  const enc = encodeURIComponent;
  const nav = (x, label, cls) => (x
    ? `<a class="gd-nav__link ${cls}" href="guide.html?id=${enc(x.id)}"><span class="eyebrow">${esc(label)}</span><span class="gd-nav__title">${esc(x.title)}</span></a>`
    : "<span></span>");

  const head = `<div class="container gd-hero__inner">
      <a class="gd-back" href="gear-doctor.html">&larr; ${esc(g.back)}</a>
      <div class="pill-row"><span class="pill pill--badge">${esc(t.typeLabels?.[guide.type] || guide.type)}</span>
        <span class="pill">${readingTime(guide)} ${esc(t.minRead)}</span></div>
      <h1>${esc(guide.title)}</h1>
      <p class="gd-hero__excerpt">${esc(guide.excerpt)}</p>
    </div>`;
  // the site-wide scroll backdrop is the guide hero now
  const hero = `<div class="gd-hero" data-scene="feature">${head}</div>`;
  const cover = guide.cover
    ? `<div class="container"><div class="gd-cover"><img src="${esc(guide.cover)}" alt="${esc(guide.title)}" decoding="async" onerror="this.parentNode.remove()"></div></div>`
    : "";

  renderTemplate(el, `
    <article>
      ${hero}${cover}
      <section class="section gd-article" data-reveal><div class="container gd-article__inner">
        <div class="gd-prose">${mdLite(guide.body)}</div>
        ${guide.source ? `<div class="gd-source">${/instagram\.com\//.test(guide.source) && config.instagram?.embeds !== false ? `<div class="gd-source__embed">${instagramEmbed(guide.source, { account: "@fury_the_gear_doc" })}</div>` : ""}<p><a class="btn btn--ghost" href="${esc(guide.source)}" target="_blank" rel="noopener noreferrer">${esc(g.source)}</a></p></div>` : ""}
        <div class="gd-share"><span class="eyebrow">${esc(g.share)}</span>
          <a class="btn btn--ghost" target="_blank" rel="noopener noreferrer" href="${esc(waLink(`${guide.title} ${url}`))}">${esc(g.shareWhatsapp)}</a>
          <a class="btn btn--ghost" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}">${esc(g.shareFacebook)}</a>
          <a class="btn btn--ghost" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?url=${enc(url)}&amp;text=${enc(guide.title)}">${esc(g.shareX)}</a>
          <button class="btn btn--ghost" type="button" data-copy>${esc(g.copyLink)}</button>
        </div>
      </div></section>
    </article>
    <div data-related>${await productCards(guide.relatedProducts)}</div>
    ${prev || next ? `<nav class="section gd-nav" data-reveal><div class="container gd-nav__inner">${nav(prev, g.prev, "gd-nav__link--prev")}${nav(next, g.next, "gd-nav__link--next")}</div></nav>` : ""}`);

  const copy = el.querySelector("[data-copy]");
  copy?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = g.copied;
      setTimeout(() => (copy.textContent = g.copyLink), 2000);
    } catch { /* ignore */ }
  });
  activateEmbeds(el);   // the source reel, if the guide is based on one
}
