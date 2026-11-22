/** Full-page cart. Same data as the drawer, plus order summary + exact WhatsApp message preview. */
import { config, formatPrice, waLink, isPlaceholder } from "../core/config.js";
import { html, renderTemplate, fill } from "../core/render.js";
import { on } from "../core/bus.js";
import cart from "../data/cart.js";

const ui = config.ui || {};

function row(l) {
  const p = l.product;
  const img = p.images?.[0];
  return html`
    <tr class="cart-row" data-key="${l.key}">
      <td class="cart-row__product">
        <a class="cart-row__img" href="product.html?id=${p.id}" tabindex="-1" aria-hidden="true">${img ? html`<img src="${img.src}" alt="" width="96" height="120" loading="lazy">` : ""}</a>
        <div>
          <a class="cart-line__title" href="product.html?id=${p.id}">${p.title}</a>
          <p class="cart-line__meta muted">${[l.size && `${ui.cartSize}: ${l.size}`, l.color && `${ui.cartColor}: ${l.color}`].filter(Boolean).join(" · ")}</p>
        </div>
      </td>
      <td class="cart-row__unit" data-label="${ui.cartUnitPrice}">${formatPrice(p.price)}</td>
      <td class="cart-row__qty" data-label="${ui.cartQty}">
        <div class="qty" role="group" aria-label="${ui.cartQty} — ${p.title}">
          <button type="button" class="qty__btn" data-act="dec" data-key="${l.key}" aria-label="${ui.cartDecrease}: ${p.title}">−</button>
          <span class="qty__val" aria-live="polite">${l.qty}</span>
          <button type="button" class="qty__btn" data-act="inc" data-key="${l.key}" aria-label="${ui.cartIncrease}: ${p.title}">+</button>
        </div>
      </td>
      <td class="cart-row__total price" data-label="${ui.cartLineTotal}">${formatPrice(l.lineTotal)}</td>
      <td class="cart-row__remove"><button type="button" class="cart-line__remove" data-act="remove" data-key="${l.key}" aria-label="${ui.cartRemove}: ${p.title}">${ui.cartRemove}</button></td>
    </tr>`;
}

export default function mount(main) {
  const root = main.querySelector("[data-cart-root]");
  fill(main, { ui });
  document.title = (config.seo?.titleTemplate || "%s").replace("%s", ui.cartTitle || "Cart");

  function render() {
    const { items, subtotal } = cart.summary();
    if (!items.length) {
      renderTemplate(root, html`
        <div class="cart-empty">
          <p>${ui.emptyCart}</p>
          <a class="btn btn--primary" href="shop.html">${ui.cartShop}</a>
        </div>`);
      return;
    }
    const ph = isPlaceholder(config.store?.whatsapp) ? " is-placeholder" : "";
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
          <p class="cart-subtotal"><span>${ui.subtotal}</span><strong class="price">${formatPrice(subtotal)}</strong></p>
          ${config.store?.cashOnDelivery ? html`<p class="cart-note">${ui.cashOnDelivery}</p>` : ""}
          <p class="cart-note muted">${config.store?.deliveryNote}</p>
          <h3 class="cart-summary__sub">${ui.cartPreview}</h3>
          <pre class="cart-preview" tabindex="0">${cart.orderMessage()}</pre>
          <p class="cart-note muted">${ui.cartPreviewNote}</p>
          <a class="btn btn--primary btn--block${ph}" data-wa href="${waLink(cart.orderMessage())}" target="_blank" rel="noopener">${ui.orderOnWhatsapp}</a>
          <a class="btn btn--ghost btn--block" href="shop.html">${ui.cartContinue}</a>
          <button type="button" class="cart-clear" data-act="clear">${ui.cartClear}</button>
        </aside>
      </div>`);
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const key = b.dataset.key;
    const line = key && cart.items().find((l) => l.key === key);
    if (b.dataset.act === "clear") cart.clear();
    else if (!line) return;
    else if (b.dataset.act === "inc") cart.setQty(key, line.qty + 1);
    else if (b.dataset.act === "dec") { if (line.qty > 1) cart.setQty(key, line.qty - 1); else cart.remove(key); }
    else cart.remove(key);
    const same = key && root.querySelector(`[data-act="${b.dataset.act}"][data-key="${CSS.escape(key)}"]`);
    (same || root.querySelector(".btn, .cart-line__title"))?.focus({ preventScroll: true });
  });
  on("cart:change", render);
  render();
}
