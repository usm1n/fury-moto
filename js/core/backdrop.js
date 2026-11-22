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
import { VideoBg, buildPoster, makeVideo } from "./video-bg.js";
import { frameUrl } from "./video-scrub.js";
import { canPlayMotion, isDesktop, hoverCapable, prefersReducedMotion, isIOS } from "./manager.js";

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

  if (b.playback === "scroll" && animated() && (video.scrubMp4 || video.frames)) {
    // Video frames follow the scroll position. Never calls play(), so it doesn't use the 2-video budget.
    mountScrollVideo(els.stage, video, b);
  } else {
    // Autoplay loop. The engine handles lazy load, poster, reduced-motion and the 2-video budget.
    // Priority 90: above cards/inline (60/80), below the hero panel (100).
    VideoBg.mount(els.stage, {
      video, mode: "background", overlayOpacity: 0, focalPoint: b.focalPoint || video.focalPoint,
      priority: true, playPriority: 90,
    });
  }

  state = { ...NEUTRAL, ...resolveScene(b.defaultScene) };
  apply();
  return els;
}

/* ------------------------------------------------- scroll-driven playback */

/**
 * The backdrop's video time is a function of scroll position:
 *   u = position in the clip, 0..1 (from config.backdrop.scroll)
 * Seeks an all-keyframe MP4 (scrubMp4) with lerp smoothing; on iOS, or if seeking
 * turns out to be slow, it switches to drawing the pre-extracted frame sequence
 * on a canvas.
 */
function mountScrollVideo(stage, video, b) {
  const sc = b.scroll || {};
  const focal = b.focalPoint || video.focalPoint || "50% 50%";
  const frames = video.frames?.pattern && video.frames?.count > 0 ? video.frames : null;
  const lerp = Math.min(1, Math.max(0.02, Number(sc.smoothing) || 0.12));

  stage.classList.add("vslot", "vslot--background", "vslot--scroll");
  const media = document.createElement("div");
  media.className = "vslot__media";
  media.append(buildPoster(video, { focal, priority: true }));
  stage.append(media);

  let target = 0, smooth = 0, raf = 0;
  let vid = null, duration = 0, seeking = false, seekT0 = 0, slowSeeks = 0;
  let canvas = null, ctx = null, imgs = null, lastFrame = -1, useFrames = false;

  /* where in the clip (0..1) the current scroll position maps to */
  function position() {
    const vh = innerHeight || 1;
    if (sc.mapping === "page") {
      const max = document.documentElement.scrollHeight - vh;
      return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    }
    const loops = scrollY / vh / (Number(sc.screensPerLoop) || 4);
    if (sc.pingpong !== false) {
      const m = loops % 2;
      return m <= 1 ? m : 2 - m;
    }
    return loops % 1;
  }

  function onScroll() {
    const next = position();
    // a hard wrap (non-pingpong) should jump, not sweep backwards through the clip
    if (Math.abs(next - smooth) > 0.5 && sc.pingpong === false) smooth = next;
    target = next;
    kick();
  }

  let lastT = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  function tick(now) {
    raf = 0;
    // frame-rate independent easing: `lerp` is the catch-up per 60fps frame
    const dt = lastT ? Math.min(250, now - lastT) : 16.7;
    lastT = now;
    smooth += (target - smooth) * (1 - Math.pow(1 - lerp, dt / 16.7));
    if (Math.abs(target - smooth) < 0.0005) smooth = target;
    let busy = smooth !== target;
    if (useFrames) drawFrame(smooth);
    else busy = seek(smooth) || busy;
    if (busy) kick(); else lastT = 0;
  }

  /* ---- video seeking ---- */
  function seek(u) {
    if (!vid || !duration) return false;
    const t = Math.min(duration - 0.04, Math.max(0, u * duration));
    if (seeking) return true;
    if (Math.abs(vid.currentTime - t) < 1 / 30) return false;
    seeking = true;
    seekT0 = performance.now();
    vid.currentTime = t;
    return true;
  }

  function startVideo() {
    if (!video.scrubMp4) return frames ? startFrames() : null;
    vid = makeVideo([{ src: video.scrubMp4, type: "video/mp4" }], {
      preload: "auto", loop: false,
      onFail: () => { vid?.remove(); vid = null; if (frames) startFrames(); },
    });
    vid.style.objectPosition = focal;
    vid.addEventListener("loadedmetadata", () => { duration = vid.duration || 0; vid.pause(); kick(); });
    vid.addEventListener("loadeddata", () => vid.classList.add("is-ready"), { once: true });
    vid.addEventListener("seeked", () => {
      seeking = false;
      if (performance.now() - seekT0 > 120 && ++slowSeeks >= 3 && frames) startFrames();
      kick();
    });
    media.append(vid);
  }

  /* ---- canvas frame sequence (iOS / slow seeking) ---- */
  function startFrames() {
    if (useFrames || !frames) return;
    useFrames = true;
    canvas = document.createElement("canvas");
    canvas.className = "is-ready";
    ctx = canvas.getContext("2d");
    media.append(canvas);
    if (vid) { vid.remove(); vid = null; }
    sizeCanvas();
    imgs = new Array(frames.count);
    // coarse-to-fine so the whole range is roughly covered early
    const order = [];
    for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < frames.count; i += step) if (!order.includes(i)) order.push(i);
    let next = 0;
    const loadOne = () => {
      if (next >= order.length) return;
      const i = order[next++];
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { imgs[i] = img; lastFrame = -1; kick(); loadOne(); };
      img.onerror = loadOne;
      img.src = frameUrl(frames.pattern, i);
    };
    for (let k = 0; k < 4; k++) loadOne();
    addEventListener("resize", sizeCanvas, { passive: true });
  }

  function sizeCanvas() {
    if (!canvas) return;
    const r = media.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    lastFrame = -1;
    kick();
  }

  function drawFrame(u) {
    const want = Math.round(u * (frames.count - 1));
    let i = want;
    // nearest loaded frame
    for (let d = 0; d < frames.count && !imgs[i]; d++) {
      if (imgs[want - d]) { i = want - d; break; }
      if (imgs[want + d]) { i = want + d; break; }
    }
    const img = imgs[i];
    if (!img || i === lastFrame) return;
    lastFrame = i;
    const [fx, fy] = String(focal).split(/\s+/).map((p) => (p?.endsWith("%") ? parseFloat(p) / 100 : 0.5));
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) * (fx ?? 0.5), (ch - h) * (fy ?? 0.5), w, h);
  }

  if (isIOS() && frames) startFrames(); else startVideo();
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  target = smooth = position();
  kick();
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
