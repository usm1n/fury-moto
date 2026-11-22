/**
 * Product detail page. mount(main) reads ?id=, renders gallery + info + notes + related.
 * All copy comes from config.ui / the product record.
 */
import { config, formatPrice, getBrand, getCategory, waLink } from "../core/config.js";
import { html, raw, renderTemplate, picture } from "../core/render.js";
import { emit } from "../core/bus.js";
import { getProduct, getRelated } from "../data/products.js";
import { productCard } from "../components/product-card.js";
import { openSizeGuide } from "../components/size-guide.js";

const fmt = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const SVG = {
  prev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
};

export default async function mount(main) {
  const ui = config.ui || {};
  const id = new URLSearchParams(location.search).get("id");
  const p = id ? await getProduct(id) : null;

  if (!p) {
    document.title = (config.seo?.titleTemplate || "%s").replace("%s", ui.pdNotFoundTitle || "");
    renderTemplate(main, html`
      <section class="pd-missing container">
        <p class="eyebrow">404</p>
        <h1>${ui.pdNotFoundTitle}</h1>
        <p class="muted">${ui.pdNotFoundText}</p>
        <a class="btn btn--primary" href="shop.html">${ui.pdBackToShop}</a>
      </section>`);
    return;
  }

  const brand = getBrand(p.brand);
  const cat = getCategory(p.category);
  const images = p.images || [];
  const sizes = p.sizes || [];
  const colors = p.colors || [];
  const certs = p.certifications || [];
  const onSale = p.compareAtPrice && p.compareAtPrice > p.price;
  const sizingMsg = fmt(ui.pdSizingMessage, { title: p.title });
  const slideCount = images.length + (p.video ? 1 : 0);

  setMeta(p, brand);

  const slides = [
    ...images.map((im, i) => html`
      <div class="pgal__slide" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${slideCount}">
        ${picture({ src: im.src, alt: im.alt || p.title, sizes: "(min-width:900px) 50vw, 100vw", loading: i === 0 ? "eager" : "lazy" })}
      </div>`),
    p.video ? html`
      <div class="pgal__slide pgal__slide--video" role="group" aria-roledescription="slide"
           data-video-slot="product-gallery" data-video-id="${p.video}" aria-label="${ui.pdVideo}"></div>` : raw(""),
  ];
  const thumbs = [
    ...images.map((im, i) => html`
      <button type="button" class="pgal__thumb" data-thumb="${i}" aria-label="${fmt(ui.pdThumb, { n: i + 1 })}"${i === 0 ? raw(' aria-current="true"') : ""}>
        ${picture({ src: im.src, alt: "", sizes: "96px" })}
      </button>`),
    p.video ? html`
      <button type="button" class="pgal__thumb pgal__thumb--video" data-thumb="${images.length}" aria-label="${ui.pdVideo}">${raw(SVG.play)}</button>` : raw(""),
  ];

  renderTemplate(main, html`
  <div class="pd container">
    <nav class="pd__crumbs" aria-label="${ui.pdBreadcrumb}">
      <ol>
        <li><a href="shop.html">${ui.shop}</a></li>
        ${cat ? html`<li><a href="shop.html?cat=${encodeURIComponent(cat.id)}">${cat.title}</a></li>` : raw("")}
        <li aria-current="page" class="visually-hidden">${p.title}</li>
      </ol>
    </nav>

    <div class="pd__grid">
      <section class="pgal" aria-label="${ui.pdGallery}" aria-roledescription="carousel">
        <div class="pgal__stage">
          <div class="pgal__track" data-track tabindex="0">${slides}</div>
          ${slideCount > 1 ? html`
            <button type="button" class="pgal__nav pgal__nav--prev" data-nav="-1" aria-label="${ui.pdPrev}">${raw(SVG.prev)}</button>
            <button type="button" class="pgal__nav pgal__nav--next" data-nav="1" aria-label="${ui.pdNext}">${raw(SVG.next)}</button>
            <div class="pgal__dots" aria-hidden="true">${Array.from({ length: slideCount }, (_, i) => html`<span class="pgal__dot${i === 0 ? " is-active" : ""}"></span>`)}</div>` : raw("")}
        </div>
        ${slideCount > 1 ? html`<div class="pgal__thumbs">${thumbs}</div>` : raw("")}
      </section>

      <div class="pd__info">
        <div class="pd__head" data-reveal>
          <p class="pd__brand eyebrow">${brand ? brand.name : p.brand}</p>
          <h1 class="pd__title">${p.title}</h1>
          <p class="pd__price price">
            <span class="pd__price-now">${formatPrice(p.price)}</span>${onSale ? html`<span class="price__compare">${formatPrice(p.compareAtPrice)}</span>` : raw("")}
          </p>
          ${(p.badges || []).length || !p.inStock ? html`<div class="pill-row">
            ${!p.inStock ? html`<span class="pill pill--badge pd__oos">${ui.outOfStock}</span>` : raw("")}
            ${(p.badges || []).map((b) => html`<span class="pill pill--badge">${b}</span>`)}</div>` : raw("")}
        </div>

        ${certs.length ? html`
        <section class="pd__certs" data-reveal aria-labelledby="pd-certs-h">
          <h2 id="pd-certs-h" class="pd__h">${ui.pdCertifications}</h2>
          <dl class="pcerts">
            ${certs.map((c) => html`<div class="pcerts__row"><dt><span class="pill pill--cert">${c}</span></dt>${ui.certInfo?.[c] ? html`<dd>${ui.certInfo[c]}</dd>` : raw("")}</div>`)}
          </dl>
        </section>` : raw("")}

        <form class="pd__buy" data-form novalidate data-reveal>
          ${colors.length ? html`
          <fieldset class="pd__field">
            <legend class="pd__label">${ui.pdColor}: <span data-color-name>${colors[0].name}</span></legend>
            <div class="swatches" role="radiogroup">
              ${colors.map((c, i) => html`
                <label class="swatch"><input type="radio" name="color" value="${c.name}"${i === 0 ? raw(" checked") : ""}>
                  <span class="swatch__dot" style="--swatch:${c.hex}"></span><span class="visually-hidden">${c.name}</span></label>`)}
            </div>
          </fieldset>` : raw("")}

          ${sizes.length ? html`
          <fieldset class="pd__field" data-size-field>
            <legend class="pd__label">${ui.pdSize}</legend>
            <div class="sizes">
              ${sizes.map((s) => html`<label class="size"><input type="radio" name="size" value="${s}"${p.inStock ? raw("") : raw(" disabled")}><span>${s}</span></label>`)}
            </div>
            <p class="pd__error" data-size-error role="alert" hidden>${ui.pdSizeError}</p>
            <button type="button" class="pd__link" data-size-guide>${ui.sizeGuide}</button>
          </fieldset>` : raw("")}

          <div class="pd__buyrow">
            <div class="qty" role="group" aria-label="${ui.pdQty}">
              <button type="button" data-qty="-1" aria-label="${ui.pdQtyMinus}">&minus;</button>
              <input type="number" name="qty" value="1" min="1" max="99" inputmode="numeric" aria-label="${ui.pdQty}">
              <button type="button" data-qty="1" aria-label="${ui.pdQtyPlus}">+</button>
            </div>
            <button type="submit" class="btn btn--primary pd__add" data-add data-magnetic${p.inStock ? raw("") : raw(" disabled")}>${p.inStock ? ui.addToCart : ui.outOfStock}</button>
          </div>
          ${config.store?.cashOnDelivery ? html`<p class="pd__cod muted">${ui.cashOnDelivery}</p>` : raw("")}
        </form>

        ${p.gearDoctorNote ? html`
        <aside class="pd__note" data-reveal>
          <p class="eyebrow">${ui.gearDoctorNote}</p>
          <p>${p.gearDoctorNote}</p>
        </aside>` : raw("")}

        <a class="btn btn--ghost btn--block pd__ask" href="${waLink(sizingMsg)}" target="_blank" rel="noopener">${ui.askSizing}</a>

        <section class="pd__desc" data-reveal>
          <h2 class="pd__h">${ui.pdDescription}</h2>
          ${(p.description || "").split(/\n{2,}/).map((para) => html`<p>${para}</p>`)}
        </section>

        ${Object.keys(p.specs || {}).length ? html`
        <section class="pd__specs" data-reveal>
          <h2 class="pd__h">${ui.pdSpecs}</h2>
          <table class="pspecs"><tbody>
            ${Object.entries(p.specs).map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}
          </tbody></table>
        </section>` : raw("")}
      </div>
    </div>

    <section class="pd-related section" data-reveal data-related hidden>
      <div class="container">
        <h2 class="pd-related__title">${ui.related}</h2>
        <div class="pd-related__grid" data-related-grid></div>
      </div>
    </section>

    <div class="pbar" data-bar aria-hidden="true">
      <div class="pbar__info"><span class="pbar__title">${p.title}</span><span class="pbar__price price">${formatPrice(p.price)}</span></div>
      <button type="button" class="btn btn--primary pbar__btn" data-bar-add tabindex="-1"${p.inStock ? raw("") : raw(" disabled")}>${p.inStock ? ui.addToCart : ui.outOfStock}</button>
    </div>
  `);

  initGallery(main, slideCount);
  initBuy(main, p, sizes.length > 0);
  initGuide(main, p);
  injectJsonLd(p, brand);

  const related = (await getRelated(p, 4)).filter(Boolean);
  if (related.length) {
    const sec = main.querySelector("[data-related]");
    main.querySelector("[data-related-grid]").innerHTML = related.map((r) => String(productCard(r))).join("");
    sec.hidden = false;
  }
}

/* ---------- meta / JSON-LD ---------- */
function setMeta(p, brand) {
  const tpl = config.seo?.titleTemplate || "%s";
  document.title = tpl.replace("%s", p.title);
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
  m.content = String(p.description || "").replace(/\s+/g, " ").slice(0, 155);
}
function injectJsonLd(p, brand) {
  const abs = (src) => new URL(src, location.href).href;
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    image: (p.images || []).map((i) => abs(i.src)),
    description: p.description,
    sku: p.id,
    brand: { "@type": "Brand", name: brand ? brand.name : p.brand },
    offers: {
      "@type": "Offer",
      url: location.href,
      price: String(p.price),
      priceCurrency: config.store?.currency || "PKR",
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
  document.querySelectorAll('script[data-jsonld="product"]').forEach((n) => n.remove());
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.dataset.jsonld = "product";
  s.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  document.head.appendChild(s);
}

/* ---------- gallery ---------- */
function initGallery(root, count) {
  const track = root.querySelector("[data-track]");
  if (!track || count < 2) return;
  const thumbs = [...root.querySelectorAll("[data-thumb]")];
  const dots = [...root.querySelectorAll(".pgal__dot")];
  let index = 0;
  const reduced = document.documentElement.classList.contains("reduced-motion");

  const goTo = (i) => {
    i = Math.max(0, Math.min(count - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setActive(i);
  };
  const setActive = (i) => {
    index = i;
    thumbs.forEach((t, k) => (k === i ? t.setAttribute("aria-current", "true") : t.removeAttribute("aria-current")));
    dots.forEach((d, k) => d.classList.toggle("is-active", k === i));
  };
  let raf = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(track.scrollLeft / (track.clientWidth || 1));
      if (i !== index) setActive(i);
    });
  }, { passive: true });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(index - 1); }
  });
  root.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => goTo(index + Number(b.dataset.nav))));
  thumbs.forEach((t) => t.addEventListener("click", () => goTo(Number(t.dataset.thumb))));
  window.addEventListener("resize", () => { track.scrollLeft = index * track.clientWidth; });
}

/* ---------- size guide ---------- */
function initGuide(root, p) {
  const btn = root.querySelector("[data-size-guide]");
  btn?.addEventListener("click", () => openSizeGuide(p.category, btn, p.title));
}

/* ---------- buy box + sticky bar ---------- */
function initBuy(root, p, needsSize) {
  const form = root.querySelector("[data-form]");
  const qty = form.elements.qty;
  const err = root.querySelector("[data-size-error]");
  const colorName = root.querySelector("[data-color-name]");
  const clampQty = () => { qty.value = Math.max(1, Math.min(99, parseInt(qty.value, 10) || 1)); return Number(qty.value); };

  form.querySelectorAll("[data-qty]").forEach((b) => b.addEventListener("click", () => {
    qty.value = clampQty() + Number(b.dataset.qty);
    clampQty();
  }));
  qty.addEventListener("change", clampQty);
  form.querySelectorAll('input[name="color"]').forEach((r) => r.addEventListener("change", () => { if (colorName) colorName.textContent = r.value; }));
  form.querySelectorAll('input[name="size"]').forEach((r) => r.addEventListener("change", () => { err.hidden = true; form.querySelector("[data-size-field]")?.classList.remove("is-invalid"); }));

  function add() {
    if (!p.inStock) return;
    const size = form.querySelector('input[name="size"]:checked')?.value || "";
    if (needsSize && !size) {
      err.hidden = false;
      const field = form.querySelector("[data-size-field]");
      field.classList.add("is-invalid");
      field.scrollIntoView({ block: "center", behavior: document.documentElement.classList.contains("reduced-motion") ? "auto" : "smooth" });
      form.querySelector('input[name="size"]')?.focus({ preventScroll: true });
      return;
    }
    const color = form.querySelector('input[name="color"]:checked')?.value || "";
    emit("cart:add", { productId: p.id, size, color, qty: clampQty() });
    emit("cart:open", {});
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); add(); });

  // sticky bar: visible only while the main button is off-screen (mobile only via CSS)
  const bar = root.querySelector("[data-bar]");
  const mainBtn = form.querySelector("[data-add]");
  bar.querySelector("[data-bar-add]").addEventListener("click", add);
  if ("IntersectionObserver" in window && mainBtn) {
    new IntersectionObserver(([en]) => {
      const show = !en.isIntersecting;
      bar.classList.toggle("is-visible", show);
      bar.setAttribute("aria-hidden", show ? "false" : "true");
      bar.querySelector("[data-bar-add]").tabIndex = show ? 0 : -1;
    }, { threshold: 0 }).observe(mainBtn);
  }
}
