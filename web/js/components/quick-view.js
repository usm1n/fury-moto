/**
 * Quick view modal. initQuickView() binds one delegated listener for [data-quick-view="<productId>"].
 * Accessible: role=dialog, focus trap, ESC, backdrop click, focus returns to the opener.
 */
import { config, formatPrice, productUrl } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { emit } from "../core/bus.js";
import { getProduct } from "../data/products.js";

const ui = () => config.ui || {};
const FOCUSABLE = 'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])';

let bound = false;
let root = null;
let opener = null;
let lastOverflow = "";

export function initQuickView() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-quick-view]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openQuickView(btn.dataset.quickView, btn);
  });
}

export async function openQuickView(productId, from = document.activeElement) {
  let p = null;
  try { p = await getProduct(productId); } catch (e) { console.warn("[quick-view]", e); }
  if (!p) return;
  closeQuickView(false);
  opener = from;

  const img = p.images?.[0] && { src: p.images[0].thumb || p.images[0].src, alt: p.images[0].alt }; // 1:1 thumb
  const sizes = p.sizes || [];
  const soldOut = (s) => !!p.variants?.length && !p.variants.some((v) => v.size === s && v.available > 0);
  const onSale = p.compareAtPrice && p.compareAtPrice > p.price;
  const brand = p.brandName ? { name: p.brandName } : null;

  root = document.createElement("div");
  root.className = "qv";
  renderTemplate(root, html`
    <div class="qv__backdrop" data-qv-close></div>
    <div class="qv__dialog" role="dialog" aria-modal="true" aria-labelledby="qv-title">
      <button class="qv__close" type="button" data-qv-close aria-label="${ui().close}">&times;</button>
      <div class="qv__media">${img ? raw(`<img src="${esc(img.src)}" alt="${esc(img.alt || p.title)}" decoding="async">`) : ""}</div>
      <div class="qv__body">
        ${brand ? html`<p class="eyebrow">${brand.name}</p>` : ""}
        <h2 class="qv__title" id="qv-title">${p.title}</h2>
        <p class="price qv__price">${formatPrice(p.price)}${onSale ? html`<span class="price__compare">${formatPrice(p.compareAtPrice)}</span>` : ""}</p>
        ${(p.certifications || []).length ? html`<div class="pill-row">${(p.certifications).map((c) => html`<span class="pill pill--cert">${c}</span>`)}</div>` : ""}
        ${sizes.length ? html`
          <label class="qv__field"><span class="qv__label">${ui().selectSize}</span>
            <select class="qv__select" data-qv-size>
              <option value="">${ui().chooseSize}</option>
              ${sizes.map((s) => html`<option value="${s}"${soldOut(s) ? " disabled" : ""}>${s}</option>`)}
            </select>
          </label>` : ""}
        <p class="qv__error muted" data-qv-error role="alert" hidden>${ui().chooseSize}</p>
        <div class="qv__actions">
          <button class="btn btn--primary btn--block" type="button" data-qv-add ${p.inStock ? "" : "disabled"}>${p.inStock ? ui().addToCart : ui().outOfStock}</button>
          <a class="btn btn--ghost btn--block" href="${productUrl(p.slug)}">${ui().viewDetails}</a>
        </div>
      </div>
    </div>`);
  document.body.appendChild(root);
  lastOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  requestAnimationFrame(() => root?.classList.add("is-open"));

  const dialog = root.querySelector(".qv__dialog");
  root.querySelectorAll("[data-qv-close]").forEach((el) => el.addEventListener("click", () => closeQuickView()));
  root.addEventListener("keydown", onKey);
  root.querySelector("[data-qv-size]")?.addEventListener("change", () => (root.querySelector("[data-qv-error]").hidden = true));
  root.querySelector("[data-qv-add]")?.addEventListener("click", () => {
    const size = root.querySelector("[data-qv-size]")?.value || "";
    if (sizes.length && !size) {
      root.querySelector("[data-qv-error]").hidden = false;
      root.querySelector("[data-qv-size]").focus();
      return;
    }
    emit("cart:add", { productId: p.id, size: size || null, color: (p.variants?.find((v) => v.size === size && v.available > 0) || p.variants?.[0])?.color || p.colors?.[0]?.name || null, qty: 1 });
    closeQuickView(false);
    emit("cart:open", {});
  });
  (root.querySelector("[data-qv-size]") || dialog.querySelector(FOCUSABLE))?.focus();
}

function onKey(e) {
  if (e.key === "Escape") { e.stopPropagation(); closeQuickView(); return; }
  if (e.key !== "Tab") return;
  const f = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeQuickView(restoreFocus = true) {
  if (!root) return;
  root.remove();
  root = null;
  document.documentElement.style.overflow = lastOverflow;
  if (restoreFocus && opener?.isConnected) opener.focus();
  opener = null;
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export default async function mount() { initQuickView(); }
