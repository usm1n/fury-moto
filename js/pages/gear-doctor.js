/** Gear Doctor hub: header, type filter, guide grid, Instagram strip, WhatsApp CTA. */
import { config, waLink, getVideo } from "../core/config.js";
import { html, raw, esc, renderTemplate } from "../core/render.js";
import { refresh } from "../core/app.js";
import { instagramStrip } from "../components/instagram-strip.js";

const T = () => config.gearDoctor || {};
const guides = () => config.guides || [];

export const readingTime = (g) => Math.max(1, Math.round(String(g.body || "").split(/\s+/).filter(Boolean).length / 200));

function igAccount() {
  const list = config.socials?.instagram || [];
  return list.find((a) => /gear_?doc/i.test(a.url + a.handle)) || list[0] || null;
}

function currentType() {
  const t = new URLSearchParams(location.search).get("type") || "all";
  return (T().filters || []).some((f) => f.id === t) ? t : "all";
}

function card(g, featured) {
  const t = T();
  const vid = g.video && getVideo(g.video) ? g.video : null;
  const media = html`<div class="gcard__media${vid ? " gcard__media--video" : ""}"${vid ? raw(` data-video-slot="category-cards" data-video-id="${esc(vid)}"`) : ""}>
      ${g.cover ? html`<img src="${g.cover}" alt="${g.title}" loading="${featured ? "eager" : "lazy"}" decoding="async" onerror="this.remove()">` : ""}
    </div>`;
  return html`<article class="gcard${featured ? " gcard--featured" : ""}" data-reveal data-guide-id="${g.id}">
    <a class="gcard__link" href="guide.html?id=${encodeURIComponent(g.id)}">
      ${media}
      <div class="gcard__body">
        <div class="pill-row">
          <span class="pill pill--badge gcard__type">${t.typeLabels?.[g.type] || g.type}</span>
          ${featured && t.featured ? html`<span class="pill">${t.featured}</span>` : ""}
          <span class="gcard__time muted">${readingTime(g)} ${t.minRead}</span>
        </div>
        <h3 class="gcard__title">${g.title}</h3>
        <p class="gcard__excerpt">${g.excerpt}</p>
        <span class="gcard__cta">${t.readGuide}</span>
      </div>
    </a>
  </article>`;
}

function gridHtml(type) {
  const list = guides().filter((g) => type === "all" || g.type === type);
  if (!list.length) return `<p class="gd-empty muted">${esc(T().empty)}</p>`;
  return `<div class="gd-grid">${list.map((g, i) => String(card(g, i === 0))).join("")}</div>`;
}

export default async function mount(el) {
  const t = T();
  const ig = igAccount();
  const type = currentType();
  const seo = config.seo || {};
  document.title = (seo.titleTemplate || "%s").replace("%s", t.pageTitle || "");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t.intro || seo.description || "");

  renderTemplate(el, `
    <section class="gd-header" data-scene="feature">
      <div class="container gd-header__inner">
        <p class="eyebrow">${esc(t.eyebrow)}</p>
        <h1>${esc(t.title)}</h1>
        <p class="gd-header__intro">${esc(t.intro)}</p>
        ${ig ? `<a class="btn btn--primary" data-magnetic href="${esc(ig.url)}" target="_blank" rel="noopener noreferrer">${esc(t.followCta)}</a>` : ""}
      </div>
    </section>
    <section class="section gd-guides" data-reveal>
      <div class="container">
        <div class="gd-filters" role="group" aria-label="${esc(t.filterLabel)}">
          ${(t.filters || []).map((f) => `<button type="button" class="gd-chip" data-type="${esc(f.id)}" aria-pressed="${f.id === type}">${esc(f.label)}</button>`).join("")}
        </div>
        <div class="gd-results" aria-live="polite">${gridHtml(type)}</div>
      </div>
    </section>
    <section class="section gd-ig" data-reveal>
      <div class="container">${instagramStrip(config.instagramPosts, { title: config.home?.instagramTitle })}</div>
    </section>
    <section class="section gd-cta" data-reveal data-scene="feature">
      <div class="container gd-cta__inner">
        <h2>${esc(t.cta?.title)}</h2>
        <p>${esc(t.cta?.text)}</p>
        <a class="btn btn--primary" data-magnetic href="${esc(waLink(t.cta?.message))}" target="_blank" rel="noopener noreferrer">${esc(t.cta?.button)}</a>
      </div>
    </section>`);

  const results = el.querySelector(".gd-results");
  el.querySelector(".gd-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    const id = b.dataset.type;
    el.querySelectorAll(".gd-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    const u = new URL(location.href);
    if (id === "all") u.searchParams.delete("type"); else u.searchParams.set("type", id);
    history.replaceState(null, "", u);
    renderTemplate(results, gridHtml(id));
    refresh(results);
  });
}
