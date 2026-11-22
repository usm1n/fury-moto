/**
 * Cart drawer: slide-out from the right. Opens on "cart:open" or any [data-cart-open] click.
 */
import { config, formatPrice, waLink, isPlaceholder } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { on } from "../core/bus.js";
import { getLenis } from "../core/app.js";
import cart from "../data/cart.js";

const ui = config.ui || {};
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function lineMarkup(l) {
  const p = l.product;
  const img = p.images?.[0];
  const meta = [l.size && `${ui.cartSize}: ${l.size}`, l.color && `${ui.cartColor}: ${l.color}`].filter(Boolean).join(" · ");
  return html`
    <li class="cart-line" data-key="${l.key}">
      <a class="cart-line__img" href="product.html?id=${p.id}" tabindex="-1" aria-hidden="true">
        ${img ? raw(`<img src="${img.src.replace(/"/g, "&quot;")}" alt="" width="80" height="100" loading="lazy">`) : ""}
      </a>
      <div class="cart-line__body">
        <a class="cart-line__title" href="product.html?id=${p.id}">${p.title}</a>
        <p class="cart-line__meta muted">${meta}</p>
        <p class="cart-line__unit muted">${formatPrice(p.price)}</p>
        <div class="cart-line__row">
          <div class="qty" role="group" aria-label="${ui.cartQty} — ${p.title}">
            <button type="button" class="qty__btn" data-act="dec" data-key="${l.key}" aria-label="${ui.cartDecrease}: ${p.title}">−</button>
            <span class="qty__val" aria-live="polite">${l.qty}</span>
            <button type="button" class="qty__btn" data-act="inc" data-key="${l.key}" aria-label="${ui.cartIncrease}: ${p.title}">+</button>
          </div>
          <span class="cart-line__total price">${formatPrice(l.lineTotal)}</span>
          <button type="button" class="cart-line__remove" data-act="remove" data-key="${l.key}" aria-label="${ui.cartRemove}: ${p.title}">${ui.cartRemove}</button>
        </div>
      </div>
    </li>`;
}

export function whatsappHref() { return waLink(cart.orderMessage()); }

export default function mount(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "cart-drawer";
  root.hidden = true;
  root.innerHTML = `
    <div class="cart-drawer__overlay" data-close></div>
    <aside class="cart-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" tabindex="-1">
      <header class="cart-drawer__head">
        <h2 id="cart-drawer-title" class="cart-drawer__title"></h2>
        <button type="button" class="cart-drawer__close" data-close></button>
      </header>
      <div class="cart-drawer__content" data-lenis-prevent></div>
    </aside>`;
  el.appendChild(root);
  const panel = root.querySelector(".cart-drawer__panel");
  const content = root.querySelector(".cart-drawer__content");
  const title = root.querySelector(".cart-drawer__title");
  const closeBtn = root.querySelector(".cart-drawer__close");
  title.textContent = ui.cartTitle || "";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", ui.cartClose || "");

  let isOpen = false;
  let opener = null;
  let highlightKey = null;

  function render() {
    const { items, subtotal, count } = cart.summary();
    title.textContent = `${ui.cartTitle}${count ? ` (${count})` : ""}`;
    if (!items.length) {
      renderTemplate(content, html`
        <div class="cart-empty">
          <p>${ui.emptyCart}</p>
          <a class="btn btn--primary" href="shop.html">${ui.cartShop}</a>
        </div>`);
      return;
    }
    const ph = isPlaceholder(config.store?.whatsapp) ? " is-placeholder" : "";
    renderTemplate(content, html`
      <ul class="cart-lines">${items.map(lineMarkup)}</ul>
      <footer class="cart-drawer__foot">
        <p class="cart-subtotal"><span>${ui.subtotal}</span><strong class="price">${formatPrice(subtotal)}</strong></p>
        ${config.store?.cashOnDelivery ? html`<p class="cart-note">${ui.cashOnDelivery}</p>` : ""}
        <p class="cart-note muted">${config.store?.deliveryNote}</p>
        <a class="btn btn--primary btn--block${ph}" data-wa href="${whatsappHref()}" target="_blank" rel="noopener">${ui.orderOnWhatsapp}</a>
        <a class="btn btn--ghost btn--block" href="cart.html">${ui.cartView}</a>
      </footer>`);
    if (highlightKey) {
      const line = [...content.querySelectorAll(".cart-line")].find((n) => n.dataset.key === highlightKey);
      if (line) { line.classList.add("is-new"); setTimeout(() => line.classList.remove("is-new"), 1600); }
      highlightKey = null;
    }
  }

  function open(from) {
    if (isOpen) return;
    isOpen = true;
    opener = from instanceof Element ? from : document.activeElement;
    render();
    root.hidden = false;
    document.documentElement.classList.add("cart-open");
    getLenis()?.stop();
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      (panel.querySelector(".cart-line__title, .btn") || closeBtn).focus({ preventScroll: true });
    });
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    document.documentElement.classList.remove("cart-open");
    getLenis()?.start();
    const done = () => { if (!isOpen) root.hidden = true; };
    setTimeout(done, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 340);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  }

  on("cart:open", () => open());
  on("cart:close", close);
  on("cart:add", (d) => { highlightKey = [d.productId, d.size || "", d.color || ""].join("|"); });
  on("cart:change", () => { if (isOpen) render(); });

  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-cart-open]");
    if (t) { e.preventDefault(); open(t); }
  });
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return close();
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const key = b.dataset.key;
    const line = cart.items().find((l) => l.key === key);
    if (!line) return;
    if (b.dataset.act === "inc") cart.setQty(key, line.qty + 1);
    else if (b.dataset.act === "dec") { if (line.qty > 1) cart.setQty(key, line.qty - 1); else cart.remove(key); }
    else cart.remove(key);
    // keep focus inside the panel after re-render
    const same = content.querySelector(`[data-act="${b.dataset.act}"][data-key="${CSS.escape(key)}"]`);
    (same || content.querySelector(".btn, .cart-line__title") || closeBtn).focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); return close(); }
    if (e.key !== "Tab") return;
    const f = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  render();
}
