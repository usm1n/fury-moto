/** Single guide page: guide.html?id=<slug> (API content). */
import { config, waLink } from "../core/config.js";
import { esc, renderTemplate } from "../core/render.js";
import { getGuide, getGuides } from "../data/content.js";
import { showError } from "../components/api-state.js";
import { productCard } from "../components/product-card.js";
import { mdLite } from "../components/markdown.js";
import { instagramEmbed, activateEmbeds } from "../components/instagram-strip.js";
import { readingTime } from "./gear-doctor.js";

const T = () => config.gearDoctor || {};

function productCards(products) {
  if (!products?.length) return "";
  const cards = products.map((p) => {
    try { return String(productCard(p, { loading: "lazy" })); } catch { return ""; }
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
  const img = g.cover ? new URL(g.cover, document.baseURI).href : undefined;
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
  const qp = new URLSearchParams(location.search);
  const id = qp.get("id") || qp.get("slug");
  if (!id) return notFound(el);

  // skeleton in the shape of the hero + article while the guide loads
  renderTemplate(el, `<article aria-hidden="true"><div class="gd-hero" data-scene="feature"><div class="container gd-hero__inner">
      <span class="skeleton skeleton--line w-40"></span><span class="skeleton skeleton--line w-90"></span><span class="skeleton skeleton--line w-60"></span></div></div>
      <section class="section gd-article"><div class="container gd-article__inner">
      <span class="skeleton skeleton--line w-90"></span><span class="skeleton skeleton--line w-90"></span><span class="skeleton skeleton--line w-60"></span></div></section></article>`);
  let guide, all = [];
  try {
    [guide, all] = await Promise.all([getGuide(id), getGuides().catch(() => [])]);
  } catch (e) {
    console.warn("[guide]", e);
    renderTemplate(el, '<section class="section"><div class="container" data-guide-error></div></section>');
    showError(el.querySelector("[data-guide-error]"), e, () => mount(el));
    return;
  }
  if (!guide) return notFound(el);

  document.title = (config.seo?.titleTemplate || "%s").replace("%s", guide.title);
  document.querySelector('meta[name="description"]')?.setAttribute("content", guide.excerpt || "");
  jsonLd(guide);

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
    <div data-related>${productCards(guide.relatedProducts)}</div>
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
