/**
 * Search overlay. Mounted once into document.body by header.js.
 *   default export mount()   -> builds the overlay (idempotent)
 *   export openSearch()      -> emits "search:open"
 * Also exports small a11y helpers shared with header.js (scroll lock, focus trap).
 */
import { config, formatPrice, productUrl } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { on, emit } from "../core/bus.js";
import { getLenis } from "../core/app.js";
import { searchProducts, getCategories } from "../data/products.js";

const ui = config.ui || {};

/* ---------- shared helpers ---------- */
let locks = 0;
export function lockScroll() {
  if (locks++ === 0) {
    document.documentElement.classList.add("is-scroll-locked");
    getLenis()?.stop();
  }
}
export function unlockScroll() {
  if (locks > 0 && --locks === 0) {
    document.documentElement.classList.remove("is-scroll-locked");
    getLenis()?.start();
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
/** Keep Tab inside `container` (plus any `extra` elements). Returns a function that removes the trap. */
export function trapFocus(container, extra = []) {
  const handler = (e) => {
    if (e.key !== "Tab") return;
    const list = [...container.querySelectorAll(FOCUSABLE), ...extra].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement) && !extra.includes(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}

export const icons = {
  search: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

/* ---------- overlay ---------- */
let mounted = false;
let overlay, input, list, status;
let opener = null;
let untrap = null;
let token = 0;
let timer = 0;
let activeIdx = -1;
let currentQ = "";

export function openSearch() { emit("search:open"); }

export default function mount() {
  if (mounted) return;
  mounted = true;

  overlay = document.createElement("div");
  overlay.className = "search";
  overlay.id = "site-search";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", ui.search || "");
  overlay.inert = true;
  overlay.innerHTML = `
    <div class="search__backdrop" data-search-close></div>
    <div class="search__panel">
      <form class="search__form" role="search" autocomplete="off">
        <span class="search__icon">${icons.search}</span>
        <input class="search__input" type="search" name="q" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
          role="combobox" aria-expanded="true" aria-controls="search-list" aria-autocomplete="list">
        <button class="search__close" type="button" data-search-close>${icons.close}</button>
      </form>
      <p class="search__status visually-hidden" role="status" aria-live="polite"></p>
      <div class="search__body"><ul class="search__list" id="search-list" role="listbox"></ul></div>
    </div>`;
  document.body.appendChild(overlay);

  input = overlay.querySelector(".search__input");
  list = overlay.querySelector(".search__list");
  status = overlay.querySelector(".search__status");
  input.placeholder = ui.searchPlaceholder || "";
  input.setAttribute("aria-label", ui.searchPlaceholder || ui.search || "");
  list.setAttribute("aria-label", ui.searchResults || "");
  overlay.querySelector(".search__close").setAttribute("aria-label", ui.close || "");

  overlay.addEventListener("click", (e) => { if (e.target.closest("[data-search-close]")) close(); });
  overlay.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 140);
  });
  input.addEventListener("keydown", onKey);

  on("search:open", open);
  on("search:close", close);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-search-open]");
    if (!btn) return;
    e.preventDefault();
    opener = btn;
    emit("search:open");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpen() && !isTyping(e.target)
        && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      e.preventDefault();
      emit("search:open");
    } else if (e.key === "Escape" && isOpen()) {
      close();
    }
  });
}

const isOpen = () => !!overlay && overlay.classList.contains("is-open");
const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function open() {
  if (!overlay || isOpen()) return;
  if (!opener) opener = document.activeElement;
  overlay.inert = false;
  overlay.classList.add("is-open");
  lockScroll();
  untrap = trapFocus(overlay);
  input.value = "";
  run("");
  requestAnimationFrame(() => input.focus());
}

function close() {
  if (!isOpen()) return;
  clearTimeout(timer);
  token++;
  overlay.classList.remove("is-open");
  overlay.inert = true;
  untrap?.(); untrap = null;
  unlockScroll();
  const back = opener && document.contains(opener) ? opener : null;
  opener = null;
  back?.focus?.();
}

/* ---------- results ---------- */
const norm = (s) => String(s || "").toLowerCase();

function row({ href, img, title, meta, price, kind }) {
  const thumb = img
    ? html`<span class="search__thumb"><img src="${img}" alt="" loading="lazy" decoding="async" width="56" height="70"></span>`
    : raw(`<span class="search__thumb search__thumb--cat" aria-hidden="true">${icons.arrow}</span>`);
  return html`<li role="presentation"><a class="search__item search__item--${kind}" role="option" href="${href}" tabindex="-1">
    ${thumb}
    <span class="search__text"><span class="search__title">${title}</span>${meta ? html`<span class="search__meta">${meta}</span>` : ""}</span>
    ${price ? html`<span class="search__price">${price}</span>` : ""}
  </a></li>`;
}

async function run(q) {
  q = q.trim();
  currentQ = q;
  const mine = ++token;
  activeIdx = -1;
  input.removeAttribute("aria-activedescendant");

  let allCats = [];
  try { allCats = await getCategories(); } catch (err) { console.warn("[search] categories", err); }
  if (mine !== token) return;
  const cats = allCats.filter((c) => !q || norm(c.title).includes(norm(q)) || norm(c.id).includes(norm(q)));
  let products = [];
  if (q) {
    try { products = await searchProducts(q, 6); } catch (err) { console.error("[search]", err); }
    if (mine !== token) return; // stale
  }

  const parts = [];
  if (cats.length) {
    parts.push(`<li role="presentation" class="search__group">${html`${ui.searchCategories}`}</li>`);
    cats.slice(0, q ? 3 : 8).forEach((c) =>
      parts.push(String(row({ href: `shop.html?cat=${encodeURIComponent(c.id)}`, title: c.title, kind: "cat" }))));
  }
  if (products.length) {
    parts.push(`<li role="presentation" class="search__group">${html`${ui.searchProducts}`}</li>`);
    products.forEach((p) => {
      const brand = p.brandName || "";
      parts.push(String(row({
        href: productUrl(p.slug),
        img: p.images?.[0]?.thumb || p.images?.[0]?.src, title: p.title, meta: brand, price: formatPrice(p.price), kind: "product",
      })));
    });
  }
  if (q && !products.length && !cats.length) {
    parts.push(`<li role="presentation" class="search__empty">${html`${ui.searchNoResults}`}</li>`);
  }
  if (q) {
    parts.push(String(row({ href: `shop.html?q=${encodeURIComponent(q)}`, title: ui.searchSeeAll || "", kind: "all" })));
  } else {
    parts.push(`<li role="presentation" class="search__empty">${html`${ui.searchHint}`}</li>`);
  }
  renderTemplate(list, parts.join(""));
  status.textContent = q ? `${products.length + cats.length} ${ui.searchResults || ""}` : "";
}

const items = () => [...list.querySelectorAll(".search__item")];

function setActive(i) {
  const els = items();
  if (!els.length) return;
  activeIdx = (i + els.length) % els.length;
  els.forEach((el, n) => {
    el.classList.toggle("is-active", n === activeIdx);
    el.id = `search-opt-${n}`;
    el.setAttribute("aria-selected", n === activeIdx ? "true" : "false");
  });
  input.setAttribute("aria-activedescendant", `search-opt-${activeIdx}`);
  els[activeIdx].scrollIntoView({ block: "nearest" });
}

function onKey(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx < 0 ? -1 : activeIdx - 1); }
}

function submit() {
  const els = items();
  if (activeIdx >= 0 && els[activeIdx]) { location.href = els[activeIdx].href; return; }
  const q = input.value.trim();
  location.href = q ? `shop.html?q=${encodeURIComponent(q)}` : "shop.html";
}
