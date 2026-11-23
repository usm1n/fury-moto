/**
 * Product card — shared by shop, home, related products.
 *   productCard(product, { loading }) -> raw() HTML (safe to interpolate in html`` or join / String())
 * Quick-view button carries [data-quick-view="<id>"]; quick-view.js (shop agent) listens for it.
 */
import { config, formatPrice } from "../core/config.js";
import { html, raw, picture } from "../core/render.js";

const pill = (cls, t) => String(html`<span class="pill ${cls}">${t}</span>`);

export function productCard(p, { loading = "lazy" } = {}) {
  const ui = config.ui || {};
  const imgs = p.images || [];
  const first = imgs[0];
  const second = imgs[1];
  const href = `product.html?slug=${encodeURIComponent(p.slug || p.id)}`;
  const onSale = p.compareAtPrice && p.compareAtPrice > p.price;
  const badges = [...(p.badges || [])];
  if (!p.inStock) badges.unshift(ui.soldOut || ui.outOfStock);
  const qvLabel = String(ui.quickViewLabel || "").replace("{title}", p.title);
  const certs = p.certifications || [];

  return html`
<article class="pcard${p.inStock ? "" : " is-oos"}" data-product-id="${p.id}">
  <div class="pcard__frame">
    <a class="pcard__media" href="${href}" tabindex="-1" aria-hidden="true">
      ${first ? picture({ src: first.src, alt: "", sizes: "(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw", className: "pcard__img", loading }) : raw("")}
      ${second ? picture({ src: second.src, alt: "", sizes: "(min-width:1024px) 25vw, 33vw", className: "pcard__img pcard__img--alt", loading: "lazy" }) : raw("")}
    </a>
    ${badges.length ? raw(`<span class="pcard__badges pill-row">${badges.map((b) => pill("pill--badge", b)).join("")}</span>`) : raw("")}
    <button type="button" class="pcard__qv" data-quick-view="${p.id}" aria-label="${qvLabel}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
      <span class="pcard__qv-text">${ui.quickView}</span>
    </button>
  </div>
  <a class="pcard__body" href="${href}">
    <span class="pcard__brand eyebrow">${p.brandName || p.brand}</span>
    <span class="pcard__title">${p.title}</span>
    <span class="pcard__price price">${formatPrice(p.price)}${onSale ? raw(`<span class="price__compare">${formatPrice(p.compareAtPrice)}</span>`) : ""}</span>
    ${certs.length ? raw(`<span class="pill-row pcard__certs">${certs.map((c) => pill("pill--cert", c)).join("")}</span>`) : raw("")}
  </a>
</article>`;
}

export default productCard;
