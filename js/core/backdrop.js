/**
 * SITE-WIDE BACKDROP + MOTION LAYER
 * ----------------------------------------------------------------------------
 * One fixed, full-screen video behind every page (config.backdrop). Each section
 * the visitor scrolls into "directs" it with a scene — zoom, drift, blur, darkness,
 * saturation, red tint — tweened smoothly, so the footage keeps moving under the
 * content. On top: scroll parallax, pointer parallax, a light sweep, a scroll
 * progress line, a velocity-reactive tagline marquee and word-by-word headlines.
 *
 *   mountBackdrop(page)   -> call BEFORE mountSlots (hero panel checks html.has-backdrop)
 *   initMotionLayer(page) -> call AFTER the page has rendered (needs sections/headlines)
 *
 * Everything reads config.backdrop; set enabled:false to switch it all off.
 * Reduced motion / Save-Data: poster still only, scenes switch instantly, no drift,
 * sweep, marquee movement or split headlines.
 */
import { config, getVideo } from "./config.js";
import { VideoBg } from "./video-bg.js";
import { canPlayMotion, isDesktop, hoverCapable, prefersReducedMotion } from "./manager.js";

const KEYS = ["scale", "x", "y", "blur", "dim", "saturate", "brightness", "tint"];
const NEUTRAL = { scale: 1.1, x: 0, y: 0, blur: 0, dim: 0.6, saturate: 1, brightness: 1, tint: 0 };

let els = null;          // { root, drift, stage, dim, tint, progress }
let state = null;        // current numeric scene values
let currentScene = null;
let tween = null;

const cfg = () => config.backdrop || {};
const motionCfg = () => cfg().motion || {};
const gsap = () => window.gsap || null;
const animated = () => !prefersReducedMotion() && canPlayMotion();

function activeOn(page) {
  const b = cfg();
  if (!b.enabled || !getVideo(b.videoId)) return false;
  return b.pages === "all" || (Array.isArray(b.pages) && b.pages.includes(page));
}

/* ------------------------------------------------------------------ mount */

export function mountBackdrop(page) {
  if (els || !activeOn(page)) return null;
  const b = cfg();
  const video = getVideo(b.videoId);
  const html = document.documentElement;
  html.classList.add("has-backdrop");
  if (motionCfg().lightSweep && animated()) html.classList.add("has-sweep");

  const root = document.createElement("div");
  root.className = "backdrop";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML =
    '<div class="backdrop__drift"><div class="backdrop__stage"></div></div>' +
    '<div class="backdrop__tint"></div><div class="backdrop__dim"></div>' +
    '<div class="backdrop__sweep"></div><div class="backdrop__vignette"></div>';
  document.body.prepend(root);

  els = {
    root,
    drift: root.querySelector(".backdrop__drift"),
    stage: root.querySelector(".backdrop__stage"),
    dim: root.querySelector(".backdrop__dim"),
    tint: root.querySelector(".backdrop__tint"),
    progress: null,
  };

  // The engine handles lazy load, poster, reduced-motion and the 2-video budget.
  // Priority 90: above cards/inline (60/80), below the hero panel (100).
  VideoBg.mount(els.stage, {
    video, mode: "background", overlayOpacity: 0, focalPoint: b.focalPoint || video.focalPoint,
    priority: true, playPriority: 90,
  });

  state = { ...NEUTRAL, ...resolveScene(b.defaultScene) };
  apply();
  return els;
}

/* ----------------------------------------------------------------- scenes */

function resolveScene(name) {
  const scenes = cfg().scenes || {};
  const s = scenes[name] || scenes[cfg().defaultScene] || {};
  const { desktop, ...base } = s;
  return { ...NEUTRAL, ...base, ...(isDesktop() && desktop ? desktop : {}) };
}

function sceneFor(el) {
  const map = cfg().sceneMap || {};
  if (el.dataset.scene) return el.dataset.scene;
  const slot = el.dataset.videoSlot || el.querySelector?.(":scope > [data-video-slot], :scope > footer[data-video-slot]")?.dataset.videoSlot;
  if (slot && map[slot]) return map[slot];
  if (el.querySelector?.(".pcard") && cfg().scenes?.shelf) return "shelf";
  return cfg().defaultScene || "content";
}

function apply() {
  if (!els) return;
  const s = state;
  els.stage.style.transform = `translate3d(${s.x}%, ${s.y}%, 0) scale(${s.scale})`;
  els.stage.style.filter = `blur(${s.blur}px) saturate(${s.saturate}) brightness(${s.brightness})`;
  els.dim.style.opacity = s.dim;
  els.tint.style.opacity = s.tint;
}

function goTo(name, instant = false) {
  if (!els || (name === currentScene && !instant)) return;
  currentScene = name;
  els.root.dataset.scene = name;
  const target = resolveScene(name);
  const g = gsap();
  tween?.kill();
  if (!g || instant || !animated()) {
    KEYS.forEach((k) => (state[k] = target[k]));
    apply();
    return;
  }
  tween = g.to(state, {
    ...Object.fromEntries(KEYS.map((k) => [k, target[k]])),
    duration: motionCfg().sceneDuration ?? 1.4,
    ease: "power2.inOut",
    onUpdate: apply,
  });
}

function watchScenes() {
  const sections = [
    ...document.querySelectorAll("main > section, main > div:not([data-component]) > section, main > .marquee"),
    ...document.querySelectorAll("footer"),
  ].filter((el, i, a) => a.indexOf(el) === i && !el.closest(".backdrop"));
  if (!sections.length) return;

  goTo(sceneFor(sections[0]), true);

  // The section crossing the middle band of the viewport owns the backdrop.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) goTo(sceneFor(e.target)); });
  }, { rootMargin: "-45% 0px -45% 0px" });
  sections.forEach((s) => io.observe(s));

  let wasDesktop = isDesktop();
  addEventListener("resize", () => {
    if (isDesktop() !== wasDesktop) { wasDesktop = isDesktop(); const n = currentScene; currentScene = null; goTo(n, true); }
  }, { passive: true });
}

/* ------------------------------------------------- scroll / pointer motion */

function watchMotion() {
  const m = motionCfg();
  const g = gsap();
  const moving = animated();

  if (m.progressBar) {
    els.progress = document.createElement("div");
    els.progress.className = "backdrop-progress";
    els.progress.setAttribute("aria-hidden", "true");
    document.body.append(els.progress);
  }

  const drift = Number(m.scrollDrift) || 0;
  const setY = g && moving ? g.quickTo(els.drift, "yPercent", { duration: 0.8, ease: "power3.out" }) : null;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      if (els.progress) els.progress.style.transform = `scaleX(${p})`;
      if (setY && drift) setY((0.5 - p) * drift);
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const pp = Number(m.pointerParallax) || 0;
  if (pp && g && moving && hoverCapable()) {
    const qx = g.quickTo(els.drift, "x", { duration: 1.2, ease: "power3.out" });
    const qy = g.quickTo(els.drift, "y", { duration: 1.2, ease: "power3.out" });
    addEventListener("pointermove", (e) => {
      qx(-((e.clientX / innerWidth) * 2 - 1) * pp);
      qy(-((e.clientY / innerHeight) * 2 - 1) * pp);
    }, { passive: true });
  }
}

/* ----------------------------------------------------------------- marquee */

function mountMarquee(page) {
  const mq = motionCfg().marquee;
  if (!mq?.enabled || !mq.items?.length) return;
  if (Array.isArray(mq.pages) && !mq.pages.includes(page)) return;
  const main = document.querySelector("main");
  const first = main?.querySelector(":scope > section");
  if (!first) return;

  const band = document.createElement("div");
  band.className = "marquee";
  band.setAttribute("aria-hidden", "true");
  band.dataset.scene = "feature";
  const track = document.createElement("div");
  track.className = "marquee__track";
  // two identical halves -> seamless loop at -50%
  for (let r = 0; r < 2; r++) {
    for (const t of mq.items) {
      const s = document.createElement("span");
      s.className = "marquee__item";
      s.textContent = t;
      track.append(s);
    }
  }
  band.append(track);
  (mq.after === "first" ? first : main.lastElementChild).after(band);

  const g = gsap();
  if (!g || !animated()) return;
  let x = 0;
  let boost = 0;
  let lastY = scrollY;
  g.ticker.add((time, dt) => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    boost += (Math.min(40, Math.abs(dy)) - boost) * 0.1;          // scroll velocity -> speed
    const dir = dy < 0 ? -1 : 1;
    x -= (0.04 + boost * 0.02) * dt * (boost > 1 ? dir : 1);
    const half = track.scrollWidth / 2 || 1;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    track.style.transform = `translate3d(${x}px,0,0) skewX(${(-boost * 0.25 * dir).toFixed(2)}deg)`;
  });
}

/* --------------------------------------------------------- split headlines */

function splitHeadlines() {
  if (!motionCfg().splitHeadlines || !animated()) return;
  const g = gsap();
  const ST = window.ScrollTrigger;
  if (!g || !ST) return;
  const heads = [...document.querySelectorAll("main h1, main h2, footer h2")].filter((h) =>
    !h.closest(".hero, .backdrop, [data-no-split], .vslot--scrub") &&
    !h.dataset.split && h.children.length === 0 && h.textContent.trim());

  heads.forEach((h) => {
    const words = h.textContent.trim().split(/\s+/);
    h.dataset.split = "";
    h.setAttribute("aria-label", h.textContent.trim());
    h.textContent = "";
    words.forEach((w, i) => {
      const outer = document.createElement("span");
      outer.className = "sw";
      outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "sw__i";
      inner.textContent = w;
      outer.append(inner);
      h.append(outer);
      if (i < words.length - 1) h.append(" ");
    });
    g.from(h.querySelectorAll(".sw__i"), {
      yPercent: 115, rotate: 4, duration: 0.9, ease: "power4.out", stagger: 0.06,
      scrollTrigger: { trigger: h, start: "top 88%", once: true },
    });
  });
}

/* --------------------------------------------------------------- public API */

export function initMotionLayer(page) {
  if (!els) return;
  mountMarquee(page);
  watchScenes();
  watchMotion();
  splitHeadlines();
  window.ScrollTrigger?.refresh();
}

/** Current scene name (for debugging / QA). */
export const backdropScene = () => currentScene;
