/**
 * Cart page with three steps in one place: cart -> checkout (#checkout) -> confirmation.
 * Validates against the API on load and before entering checkout.
 */
import { config, formatPrice, deliveryNote } from "../core/config.js";
import { html, renderTemplate, fill } from "../core/render.js";
import { on } from "../core/bus.js";
import cart, { productHref } from "../data/cart.js";
import { noticeMarkup, totalsMarkup } from "../components/cart-drawer.js";
import { openCheckout } from "../components/checkout.js";

const ui = config.ui || {};

function row(l) {
  const title = l.title || l.slug;
  const max = Math.min(10, l.available ?? 10);
  const flag = l.purchasable ? "" : (l.status === "sold-out" ? ui.cartLineSoldOut : ui.cartLineUnavailable);
  return html`
    <tr class="cart-row${l.purchasable ? "" : " is-unavailable"}" data-key="${l.key}">
      <td class="cart-row__product">
        <a class="cart-row__img" href="${productHref(l.slug)}" tabindex="-1" aria-hidden="true">${l.thumbUrl ? html`<img src="${l.thumbUrl}" alt="" width="96" height="120" loading="lazy">` : ""}</a>
        <div>
          <a class="cart-line__title" href="${productHref(l.slug)}">${title}</a>
          <p class="cart-line__meta muted">${[l.size && `${ui.cartSize}: ${l.size}`, l.color && `${ui.cartColor}: ${l.color}`].filter(Boolean).join(" · ")}</p>
          ${flag ? html`<p class="cart-line__flag">${flag}</p>` : ""}
        </div>
      </td>
      <td class="cart-row__unit" data-label="${ui.cartUnitPrice}">${l.unitPrice == null ? "" : formatPrice(l.unitPrice)}</td>
      <td class="cart-row__qty" data-label="${ui.cartQty}">
        ${l.purchasable ? html`<div class="qty" role="group" aria-label="${ui.cartQty} — ${title}">
          <button type="button" class="qty__btn" data-act="dec" data-key="${l.key}" aria-label="${ui.cartDecrease}: ${title}">−</button>
          <span class="qty__val" aria-live="polite">${l.qty}</span>
          <button type="button" class="qty__btn" data-act="inc" data-key="${l.key}" aria-label="${ui.cartIncrease}: ${title}" ${l.qty >= max ? "disabled" : ""}>+</button>
        </div>` : ""}
      </td>
      <td class="cart-row__total price" data-label="${ui.cartLineTotal}">${l.purchasable ? formatPrice(l.lineTotal) : ""}</td>
      <td class="cart-row__remove"><button type="button" class="cart-line__remove" data-act="remove" data-key="${l.key}" aria-label="${ui.cartRemove}: ${title}">${ui.cartRemove}</button></td>
    </tr>`;
}

export default function mount(main) {
  const root = main.querySelector("[data-cart-root]");
  const noticeEl = main.querySelector("[data-cart-notice]");
  fill(main, { ui });
  document.title = (config.seo?.titleTemplate || "%s").replace("%s", ui.cartTitle || "Cart");

  let step = "cart"; // cart | checkout
  let notice = [];
  let co = null;
  let checking = false;
  let checkError = false;

  const titleEl = main.querySelector(".cart-page__title");
  function renderNotice() { renderTemplate(noticeEl, noticeMarkup(notice)); }

  function render() {
    if (step !== "cart") return;
    const sum = cart.summary();
    const { items } = sum;
    if (!items.length) {
      renderTemplate(root, html`
        <div class="cart-empty">
          <p>${ui.emptyCart}</p>
          <a class="btn btn--primary" href="shop.html">${ui.cartShop}</a>
        </div>`);
      return;
    }
    renderTemplate(root, html`
      <div class="cart-layout">
        <table class="cart-table">
          <thead><tr>
            <th scope="col">${ui.cartProduct}</th><th scope="col">${ui.cartUnitPrice}</th>
            <th scope="col">${ui.cartQty}</th><th scope="col">${ui.cartLineTotal}</th>
            <th scope="col"><span class="visually-hidden">${ui.cartRemove}</span></th>
          </tr></thead>
          <tbody>${items.map(row)}</tbody>
        </table>
        <aside class="cart-summary" aria-labelledby="cart-summary-title">
          <h2 id="cart-summary-title" class="cart-summary__title">${ui.cartSummary}</h2>
          ${totalsMarkup(sum)}
          ${config.store?.cashOnDelivery ? html`<p class="cart-note">${ui.cashOnDelivery}</p>` : ""}
          ${deliveryNote() ? html`<p class="cart-note muted">${deliveryNote()}</p>` : ""}
          <p class="cart-note" role="status">${checking ? ui.cartChecking : checkError ? ui.cartCheckError : sum.blocked ? ui.cartBlocked : ""}</p>
          <button type="button" class="btn btn--primary btn--block" data-act="checkout" ${sum.blocked || checking ? "disabled" : ""}>${ui.checkout}</button>
          <a class="btn btn--ghost btn--block" href="shop.html">${ui.cartContinue}</a>
          <button type="button" class="cart-clear" data-act="clear">${ui.cartClear}</button>
        </aside>
      </div>`);
  }

  function showCart({ focus = false } = {}) {
    co?.destroy(); co = null;
    step = "cart";
    if (location.hash === "#checkout") history.replaceState(null, "", location.pathname + location.search);
    titleEl.hidden = false;
    render();
    if (focus) (root.querySelector("[data-act=checkout]:not([disabled])") || root.querySelector(".btn"))?.focus({ preventScroll: true });
  }

  async function goCheckout() {
    if (!cart.items().length) return;
    checking = true; checkError = false; render();
    const r = await cart.validate();
    checking = false;
    if (!r.ok) { checkError = true; render(); return; }
    const sum = cart.summary();
    if (sum.blocked || !sum.items.length) { render(); if (r.changes.length) return; return; }
    if (r.changes.length) { render(); return; } // let the shopper review what changed first
    step = "checkout";
    history.replaceState(null, "", "#checkout");
    co = openCheckout(root, { onBack: () => showCart({ focus: true }), onChanged: () => showCart({ focus: true }) });
    window.scrollTo({ top: 0 });
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || step !== "cart") return;
    if (b.dataset.act === "checkout") return void goCheckout();
    const key = b.dataset.key;
    const line = key && cart.items().find((l) => l.key === key);
    if (b.dataset.act === "clear") cart.clear();
    else if (!line) return;
    else if (b.disabled) return;
    else if (b.dataset.act === "inc") cart.setQty(key, line.qty + 1);
    else if (b.dataset.act === "dec") { if (line.qty > 1) cart.setQty(key, line.qty - 1); else cart.remove(key); }
    else cart.remove(key);
    const same = key && root.querySelector(`[data-act="${b.dataset.act}"][data-key="${CSS.escape(key)}"]`);
    (same || root.querySelector(".btn, .cart-line__title"))?.focus({ preventScroll: true });
  });
  noticeEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-dismiss-notice]")) { notice = []; renderNotice(); }
  });

  on("cart:notice", ({ changes }) => { notice = changes; renderNotice(); });
  on("cart:change", () => { if (step === "cart") render(); });
  addEventListener("hashchange", () => {
    if (location.hash === "#checkout" && step === "cart") goCheckout();
    else if (location.hash !== "#checkout" && step === "checkout") showCart({ focus: true });
  });

  render();
  // Opening the page = validate against the API (prices/stock), then honour #checkout.
  checking = !!cart.items().length; render();
  cart.validate().then((r) => {
    checking = false;
    if (!r.ok) checkError = true;
    render();
    if (location.hash === "#checkout" && r.ok && !r.changes.length && !cart.summary().blocked && cart.items().length) goCheckout();
  });
}
