/**
 * Page bootstrap. Every HTML page has exactly:
 *   <script type="module">import { boot } from "./js/core/app.js"; boot("shop");</script>
 *
 * boot(page):
 *   1. applyTheme() (colours, fonts, grain, devMode)
 *   2. sets <title>/<meta description> defaults from config.seo
 *   3. mounts shared components found in the page: [data-component="header|footer|cart-drawer|search"]
 *      -> import("../components/<name>.js").default(el)
 *   4. runs the page module: import("../pages/<page>.js").default(mainEl)
 *   5. mountSlots(document) — wires every [data-video-slot]
 *   6. motion: Lenis smooth scroll, [data-reveal] GSAP reveals, [data-magnetic] buttons, page-leave fade
 *   7. markPlaceholders + console report (devMode)
 *
 * Components and page modules may return a Promise; boot awaits them before step 5.
 * A missing/failed module is logged and skipped — one broken section never blanks the page.
 */
import { config, applyTheme, markPlaceholders, reportPlaceholders } from "./config.js";
import { mountSlots } from "./slots.js";
import { mountBackdrop, initMotionLayer } from "./backdrop.js";
import { prefersReducedMotion } from "./manager.js";
import "../data/cart.js"; // registers cart:add listener on every page

export const gsap = () => window.gsap || null;
export const ScrollTrigger = () => window.ScrollTrigger || null;
let lenis = null;
export const getLenis = () => lenis;

async function load(path, el) {
  try {
    const mod = await import(path);
    return await mod.default?.(el);
  } catch (err) {
    console.error(`[app] failed to mount ${path}`, err);
  }
}

export async function boot(page) {
  applyTheme();
  const root = document.documentElement;
  if (prefersReducedMotion()) root.classList.add("reduced-motion");
  if (!window.gsap) root.classList.add("no-gsap");
  if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger);
  mountBackdrop(page); // site-wide video behind everything; must exist before slots mount

  if (!document.title) document.title = config.seo?.defaultTitle || config.store?.name || "";
  // static ui.* bindings in page shells (skip link etc.)
  document.querySelectorAll('[data-bind^="ui."]').forEach((el) => {
    const v = config.ui?.[el.dataset.bind.slice(3)];
    if (typeof v === "string") el.textContent = v;
  });

  const comps = [...document.querySelectorAll("[data-component]")];
  await Promise.all(comps.map((el) => load(`../components/${el.dataset.component}.js`, el)));

  const main = document.querySelector("main");
  if (page) await load(`../pages/${page}.js`, main);

  mountSlots(document);
  initMotion();
  initMotionLayer(page);
  markPlaceholders(document.body);
  reportPlaceholders();
  document.dispatchEvent(new CustomEvent("app:ready", { detail: { page } }));
}

/** Re-run reveals/slots/placeholders after a section re-renders (e.g. shop grid after filtering). */
export function refresh(root = document) {
  mountSlots(root);
  initReveals(root);
  markPlaceholders(root.body || root);
  ScrollTrigger()?.refresh();
}

function initMotion() {
  const reduced = prefersReducedMotion();
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true });
    if (window.gsap && window.ScrollTrigger) {
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add((t) => lenis.raf(t * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  initReveals(document);
  if (!reduced) initMagnetic();
  initPageLeave();
}

function initReveals(root) {
  const g = gsap();
  const els = [...root.querySelectorAll("[data-reveal]:not([data-revealed])")];
  els.forEach((el) => (el.dataset.revealed = ""));
  if (!g || !ScrollTrigger() || prefersReducedMotion()) {
    els.forEach((el) => { el.style.opacity = 1; el.style.transform = "none"; });
    return;
  }
  els.forEach((el) => {
    g.to(el, {
      opacity: 1, y: 0, duration: 0.7, ease: "power3.out",
      delay: Number(el.dataset.revealDelay || 0),
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
}

function initMagnetic() {
  if (!window.matchMedia("(hover: hover)").matches) return;
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.("[data-magnetic]");
    document.querySelectorAll("[data-magnetic].is-magnet").forEach((m) => {
      if (m !== el) { m.classList.remove("is-magnet"); m.style.transform = ""; }
    });
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.25;
    const y = (e.clientY - r.top - r.height / 2) * 0.35;
    el.classList.add("is-magnet");
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, { passive: true });
}

function initPageLeave() {
  if (prefersReducedMotion()) return;
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname || a.hasAttribute("download")) return;
    e.preventDefault();
    document.documentElement.classList.add("is-leaving");
    setTimeout(() => (location.href = a.href), 160);
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) document.documentElement.classList.remove("is-leaving"); });
}
