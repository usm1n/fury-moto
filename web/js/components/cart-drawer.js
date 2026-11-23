/**
 * Cart drawer: slide-out from the right. Opens on "cart:open" or any [data-cart-open] click.
 */
import { config, formatPrice, deliveryNote } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { on } from "../core/bus.js";
import { getLenis } from "../core/app.js";
import cart, { productHref } from "../data/cart.js";

const ui = config.ui || {};
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Dismissible "Your cart changed" notice (drawer + cart page). Wire [data-dismiss-notice] yourself. */
export function noticeMarkup(changes) {
  if (!changes?.length) return "";
  return html`
    <div class="cart-notice">
      <div class="cart-notice__body">
        <p class="cart-notice__title">${ui.cartChangedTitle}</p>
        <ul class="cart-notice__list">${changes.map((c) => html`<li>${c}</li>`)}</ul>
      </div>
      <button type="button" class="cart-notice__close" data-dismiss-notice aria-label="${ui.cartChangedDismiss}">×</button>
    </div>`;
}

export function totalsMarkup(sum) {
  return html`
    <p class="cart-subtotal"><span>${ui.subtotal}</span><strong class="price">${formatPrice(sum.subtotal)}</strong></p>
    <p class="cart-fee"><span>${ui.cartDelivery}</span><span>${sum.deliveryFee == null ? ui.cartFeeUnknown : sum.deliveryFee === 0 ? formatPrice(0) : formatPrice(sum.deliveryFee)}</span></p>
    <p class="cart-total"><span>${ui.cartTotal}</span><strong class="price">${formatPrice(sum.total)}</strong></p>`;
}

export function lineMarkup(l) {
  const meta = [l.size && `${ui.cartSize}: ${l.size}`, l.color && `${ui.cartColor}: ${l.color}`].filter(Boolean).join(" · ");
  const title = l.title || l.slug;
  const max = Math.min(10, l.available ?? 10);
  const flag = l.purchasable ? "" : (l.status === "sold-out" ? ui.cartLineSoldOut : ui.cartLineUnavailable);
  return html`
    <li class="cart-line${l.purchasable ? "" : " is-unavailable"}" data-key="${l.key}">
      <a class="cart-line__img" href="${productHref(l.slug)}" tabindex="-1" aria-hidden="true">
        ${l.thumbUrl ? raw(`<img src="${l.thumbUrl.replace(/"/g, "&quot;")}" alt="" width="80" height="100" loading="lazy">`) : ""}
      </a>
      <div class="cart-line__body">
        <a class="cart-line__title" href="${productHref(l.slug)}">${title}</a>
        <p class="cart-line__meta muted">${meta}</p>
        ${flag ? html`<p class="cart-line__flag">${flag}</p>` : html`<p class="cart-line__unit muted">${l.unitPrice == null ? "" : formatPrice(l.unitPrice)}</p>`}
        <div class="cart-line__row">
          ${l.purchasable ? html`<div class="qty" role="group" aria-label="${ui.cartQty} — ${title}">
            <button type="button" class="qty__btn" data-act="dec" data-key="${l.key}" aria-label="${ui.cartDecrease}: ${title}">−</button>
            <span class="qty__val" aria-live="polite">${l.qty}</span>
            <button type="button" class="qty__btn" data-act="inc" data-key="${l.key}" aria-label="${ui.cartIncrease}: ${title}"${l.qty >= max ? " disabled" : ""} title="${l.qty >= max ? ui.cartMaxQty : ""}">+</button>
          </div>
          <span class="cart-line__total price">${formatPrice(l.lineTotal)}</span>` : ""}
          <button type="button" class="cart-line__remove" data-act="remove" data-key="${l.key}" aria-label="${ui.cartRemove}: ${title}">${ui.cartRemove}</button>
        </div>
      </div>
    </li>`;
}

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
      <div class="cart-drawer__notice" role="status" aria-live="polite"></div>
      <div class="cart-drawer__content" data-lenis-prevent></div>
    </aside>`;
  el.appendChild(root);
  const panel = root.querySelector(".cart-drawer__panel");
  const content = root.querySelector(".cart-drawer__content");
  const noticeEl = root.querySelector(".cart-drawer__notice");
  const title = root.querySelector(".cart-drawer__title");
  const closeBtn = root.querySelector(".cart-drawer__close");
  title.textContent = ui.cartTitle || "";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", ui.cartClose || "");

  let isOpen = false;
  let opener = null;
  let highlightKey = null;
  let notice = [];

  function renderNotice() {
    renderTemplate(noticeEl, noticeMarkup(notice));
  }

  function render() {
    const sum = cart.summary();
    const { items, count } = sum;
    title.textContent = `${ui.cartTitle}${count ? ` (${count})` : ""}`;
    if (!items.length) {
      renderTemplate(content, html`
        <div class="cart-empty">
          <p>${ui.emptyCart}</p>
          <a class="btn btn--primary" href="shop.html">${ui.cartShop}</a>
        </div>`);
      return;
    }
    renderTemplate(content, html`
      <ul class="cart-lines">${items.map(lineMarkup)}</ul>
      <footer class="cart-drawer__foot">
        ${totalsMarkup(sum)}
        ${config.store?.cashOnDelivery ? html`<p class="cart-note">${ui.cashOnDelivery}</p>` : ""}
        ${deliveryNote() ? html`<p class="cart-note muted">${deliveryNote()}</p>` : ""}
        ${sum.blocked ? html`<p class="cart-note cart-note--warn">${ui.cartBlocked}</p>` : ""}
        <a class="btn btn--primary btn--block${sum.blocked ? " is-disabled" : ""}" data-checkout href="cart.html#checkout" aria-disabled="${sum.blocked}">${ui.checkout}</a>
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
    renderNotice();
    root.hidden = false;
    document.documentElement.classList.add("cart-open");
    getLenis()?.stop();
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      (panel.querySelector(".cart-line__title, .btn") || closeBtn).focus({ preventScroll: true });
    });
    if (cart.items().length) {
      cart.validate();
    }
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
  on("cart:add", (d) => { highlightKey = cart.keyOf({ slug: d.slug || d.productId, size: d.size || "", color: d.color || "" }); });
  on("cart:notice", ({ changes }) => { notice = changes; renderNotice(); });
  on("cart:change", () => {
    if (!isOpen) return;
    const a = document.activeElement;
    const sel = a && content.contains(a) && a.dataset.act ? `[data-act="${a.dataset.act}"][data-key="${CSS.escape(a.dataset.key)}"]` : null;
    render();
    if (sel) content.querySelector(sel)?.focus({ preventScroll: true });
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-cart-open]");
    if (t) { e.preventDefault(); open(t); }
  });
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-dismiss-notice]")) { notice = []; renderNotice(); return; }
    const co = e.target.closest("[data-checkout]");
    if (co) { if (co.getAttribute("aria-disabled") === "true") e.preventDefault(); else if (/cart(.html)?$/.test(location.pathname)) close(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const key = b.dataset.key;
    const line = cart.items().find((l) => l.key === key);
    if (!line || b.disabled) return;
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
