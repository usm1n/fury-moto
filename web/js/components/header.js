/**
 * Site header: sticky top bar (desktop nav), mobile bottom bar, full-screen menu panel.
 * Mounts the search overlay once. Emits "cart:open"; listens to "cart:change".
 */
import { config, waLink } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { on, emit } from "../core/bus.js";
import cart from "../data/cart.js";
import { getSettings } from "../data/settings.js";
import mountSearch, { lockScroll, unlockScroll, trapFocus, icons } from "./search.js";

const ui = config.ui || {};

const ICON = {
  menu: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 8h16M4 16h16"/></svg>',
  bag: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  shop: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.5L3 21Z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2L9 8.5Z" fill="currentColor" stroke="none"/></svg>',
};

const badge = () => '<span class="hdr-badge" data-cart-count hidden aria-hidden="true">0</span>';

/** Pick the nav link that best matches the current URL (path + query subset). */
function activeHref(links) {
  const here = new URL(location.href);
  const file = (u) => u.pathname.split("/").pop() || "index.html";
  let best = null, bestScore = 0;
  links.forEach((l) => {
    let u;
    try { u = new URL(l.href, location.href); } catch { return; }
    if (file(u) !== file(here)) return;
    const keys = [...u.searchParams.keys()];
    if (!keys.every((k) => u.searchParams.get(k) === here.searchParams.get(k))) return;
    const score = 1 + keys.length;
    if (score > bestScore) { best = l.href; bestScore = score; }
  });
  return best;
}

export default function mount(el) {
  if (!el) return;
  const nav = config.nav || [];
  const name = config.store?.shortName || config.store?.name || "";
  const active = activeHref(nav);
  const ig = config.socials?.instagram || [];
  const yt = config.socials?.youtube;

  const navLinks = (cls) => nav.map((l) => html`<li><a class="${cls}" href="${l.href}"${l.href === active ? raw(' aria-current="page"') : ""}>${l.label}</a></li>`);

  renderTemplate(el, html`
    <header class="site-header" data-header>
      <div class="site-header__inner">
        <a class="site-header__logo" href="index.html" aria-label="${ui.homeLabel}">${name}</a>
        <nav class="site-header__nav" aria-label="${ui.mainNav}"><ul>${navLinks("site-header__link")}</ul></nav>
        <div class="site-header__actions">
          <button class="hdr-btn" type="button" data-search-open aria-label="${ui.search}">${raw(icons.search)}</button>
          <button class="hdr-btn" type="button" data-cart-open aria-label="${ui.cart}">${raw(ICON.bag)}${raw(badge())}</button>
        </div>
      </div>
    </header>

    <div class="menu" id="site-menu" role="dialog" aria-modal="true" aria-label="${ui.menu}" inert>
      <div class="menu__inner">
        <ul class="menu__links">${nav.map((l, i) => html`<li style="--i:${i}"><a class="menu__link" href="${l.href}"${l.href === active ? raw(' aria-current="page"') : ""}>${l.label}</a></li>`)}</ul>
        <div class="menu__foot">
          <a class="btn btn--primary btn--block" data-wa href="${waLink()}" target="_blank" rel="noopener">${raw(ICON.whatsapp)}${ui.menuWhatsapp}</a>
          <p class="eyebrow menu__follow">${ui.menuFollow}</p>
          <ul class="menu__socials">
            ${ig.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label || s.handle}">${raw(ICON.instagram)}<span>${s.handle}</span></a></li>`)}
            ${yt ? html`<li><a href="${yt.url}" target="_blank" rel="noopener" aria-label="${yt.label || yt.handle}">${raw(ICON.youtube)}<span>${yt.handle}</span></a></li>` : ""}
          </ul>
        </div>
      </div>
    </div>

    <nav class="bottom-bar" aria-label="${ui.mobileNav}">
      <button class="bottom-bar__item" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-menu">
        <span class="bottom-bar__icon" data-menu-icon>${raw(ICON.menu)}</span><span data-menu-label>${ui.menu}</span>
      </button>
      <button class="bottom-bar__item" type="button" data-search-open><span class="bottom-bar__icon">${raw(icons.search)}</span><span>${ui.search}</span></button>
      <a class="bottom-bar__item" href="shop.html"${active === "shop.html" ? raw(' aria-current="page"') : ""}><span class="bottom-bar__icon">${raw(ICON.shop)}</span><span>${ui.shop}</span></a>
      <button class="bottom-bar__item" type="button" data-cart-open aria-label="${ui.cart}"><span class="bottom-bar__icon">${raw(ICON.bag)}${raw(badge())}</span><span>${ui.cart}</span></button>
    </nav>
  `);

  mountSearch();
  // WhatsApp number comes from the API settings (config.store is the fallback until/unless they load)
  getSettings().then((s) => { if (s.whatsapp) el.querySelectorAll("[data-wa]").forEach((a) => (a.href = waLink("", s.whatsapp))); });

  const header = el.querySelector("[data-header]");
  const menu = el.querySelector("#site-menu");
  const toggle = el.querySelector("[data-menu-toggle]");
  const isHome = document.body.dataset.page === "home" || document.querySelector("main")?.dataset.page === "home";
  header.classList.toggle("site-header--over", isHome);

  /* ---- cart ---- */
  const setCount = (n) => {
    n = Number(n) || 0;
    el.querySelectorAll("[data-cart-count]").forEach((b) => { b.textContent = n > 99 ? "99+" : String(n); b.hidden = n === 0; });
    el.querySelectorAll("[data-cart-open]").forEach((b) => b.setAttribute("aria-label", n ? `${ui.cart} (${n})` : ui.cart || ""));
  };
  try { setCount(cart.summary().count); } catch { setCount(0); }
  on("cart:change", (d) => setCount(d?.count));
  el.querySelectorAll("[data-cart-open]").forEach((b) => b.addEventListener("click", () => emit("cart:open")));

  /* ---- scroll behaviour ---- */
  let lastY = window.scrollY, ticking = false;
  const menuOpen = () => menu.classList.contains("is-open");
  const onScroll = () => {
    ticking = false;
    const y = window.scrollY;
    header.classList.toggle("is-solid", y > 40 || !isHome);
    if (!menuOpen()) {
      const dy = y - lastY;
      if (y > header.offsetHeight * 2 && dy > 6) header.classList.add("is-hidden");
      else if (dy < -6 || y <= 40) header.classList.remove("is-hidden");
    }
    lastY = y;
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---- mobile menu ---- */
  let untrap = null;
  const setMenu = (open, restoreFocus = true) => {
    if (open === menuOpen()) return;
    menu.classList.toggle("is-open", open);
    menu.inert = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("[data-menu-icon]").innerHTML = open ? icons.close : ICON.menu;
    toggle.querySelector("[data-menu-label]").textContent = (open ? ui.close : ui.menu) || "";
    document.documentElement.classList.toggle("is-menu-open", open);
    if (open) {
      header.classList.remove("is-hidden");
      lockScroll();
      untrap = trapFocus(menu, [toggle]);
      requestAnimationFrame(() => menu.querySelector(".menu__link")?.focus());
    } else {
      untrap?.(); untrap = null;
      unlockScroll();
      if (restoreFocus) toggle.focus();
    }
  };
  toggle.addEventListener("click", () => setMenu(!menuOpen()));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen()) setMenu(false); });
  // search / cart opened from the bar while the menu is up: drop the menu, focus moves to the new overlay
  on("search:open", () => setMenu(false, false));
  on("cart:open", () => setMenu(false, false));
  window.matchMedia("(min-width: 900px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });
}
