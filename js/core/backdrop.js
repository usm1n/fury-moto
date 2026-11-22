/**
 * SCROLL-DRIVEN BACKDROP (canvas image sequences) + motion layer
 * ----------------------------------------------------------------------------
 * The rider clip, pre-extracted to WebP frames (docs/MEDIA.md), is drawn on ONE
 * fixed full-screen <canvas> behind every page. Scroll position = timeline:
 *   page top -> first frame (still), scroll down -> forward, up -> backward,
 *   stop -> hold, page bottom -> last frame. Light lerp smoothing. Nothing autoplays.
 *
 * Two sequences, chosen by ORIENTATION (config.backdrop.sequences):
 *   landscape viewport (width > height) -> 16:9 frames
 *   portrait viewport                   -> 9:16 frames
 * Each has a full-size `path` and a `pathSmall` (smaller screens / slow connections).
 * Only the active sequence is loaded. On resize/rotation the engine switches
 * sequence and keeps the same scroll progress (0..1), so you stay at the same
 * point in the animation.
 *
 * Layout: full-bleed cover. With matching aspect ratios there is almost no crop;
 * on odd shapes (ultrawide, tall phones) the small crop is centred on the
 * sequence's focalPoint {x,y}. Mouse parallax nudges that point a little over a
 * slight overscale, so no edge ever shows.
 *
 * Section looks (config.backdrop.scenes) only change brightness, blur, dim and red
 * tint. Sections pick one with data-scene="<name>".
 *
 *   mountBackdrop(page)   -> before page modules render (sets html.has-backdrop)
 *   initMotionLayer(page) -> after the page has rendered (scenes, marquee, headlines)
 *
 * Reduced motion / Save-Data: only `stillFrame` of the active sequence is loaded and drawn.
 */
import { config } from "./config.js";
import { prefersReducedMotion, saveData, isDesktop, hoverCapable } from "./manager.js";

const SCENE_KEYS = ["brightness", "blur", "dim", "tint"];
const SCENE_NEUTRAL = { brightness: 1, blur: 0, dim: 0.3, tint: 0 };
const MARGIN = 32;             // css px the canvas extends past the viewport, so CSS blur never shows edges

const cfg = () => config.backdrop || {};
const motionCfg = () => cfg().motion || {};
const gsap = () => window.gsap || null;
const still = () => prefersReducedMotion() || saveData();
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const viewport = () => ({
  W: document.documentElement.clientWidth || innerWidth,
  H: document.documentElement.clientHeight || innerHeight,
});
const orientation = () => { const { W, H } = viewport(); return W > H ? "landscape" : "portrait"; };

let B = null;                  // engine state, null when the backdrop is off

/* ======================================================================= mount */

export function mountBackdrop(page) {
  if (B) return B;
  const b = cfg();
  const seqs = b.sequences || {};
  if (!b.enabled || !(seqs.landscape?.count || seqs.portrait?.count)) return null;
  if (b.pages !== "all" && !(Array.isArray(b.pages) && b.pages.includes(page))) return null;

  const html = document.documentElement;
  html.classList.add("has-backdrop");
  if (motionCfg().lightSweep && !still()) html.classList.add("has-sweep");

  const root = document.createElement("div");
  root.className = "backdrop";
  root.innerHTML =
    '<canvas class="backdrop__canvas" role="img"></canvas>' +
    '<div class="backdrop__tint" aria-hidden="true"></div><div class="backdrop__dim" aria-hidden="true"></div>' +
    '<div class="backdrop__sweep" aria-hidden="true"></div><div class="backdrop__vignette" aria-hidden="true"></div>';
  document.body.prepend(root);
  const canvas = root.querySelector("canvas");
  if (b.alt) canvas.setAttribute("aria-label", b.alt);
  else canvas.setAttribute("aria-hidden", "true");

  B = {
    root, canvas,
    ctx: canvas.getContext("2d", { alpha: false }),
    dim: root.querySelector(".backdrop__dim"),
    tint: root.querySelector(".backdrop__tint"),
    cache: {},                                       // frames per sequence path, kept if you rotate back
    seqName: null, seq: null, pattern: null, count: 0, imgs: [], loadToken: 0,
    target: 0, smooth: 0,                            // position in the clip, 0..1 (shared by both sequences)
    drawn: -1, dirty: true,
    px: 0, py: 0, tpx: 0, tpy: 0,                    // pointer parallax: focal-point offset (fraction of frame)
    raf: 0, lastT: 0,
    scene: { ...SCENE_NEUTRAL, ...resolveScene(b.defaultScene) },
    sceneName: null, sceneTween: null,
    W: 0, H: 0, dpr: 1,
    orient: orientation(),                           // last orientation, to detect rotation
    history: [],                                     // [{t, p}] progress at recent scroll events (rotation restore)
  };

  sizeCanvas();
  applyScene();
  addEventListener("resize", onResize, { passive: true });

  if (!still()) {
    B.target = B.smooth = scrollPosition();
    addEventListener("scroll", onScroll, { passive: true });
    // page height changes as sections render / images load -> remap (not a user scroll)
    if ("ResizeObserver" in window) new ResizeObserver(() => onScroll()).observe(document.body);
  }
  activateSequence(orientation());
  return B;
}

/* ================================================================== sequences */

/** The configured sequence for an orientation, falling back to the other one if missing. */
function sequenceFor(name) {
  const s = cfg().sequences || {};
  const other = name === "landscape" ? "portrait" : "landscape";
  if (s[name]?.count) return { name, ...s[name] };
  return { name: other, ...s[other] };
}

/** The frame width of a set, read from its folder name ("…/16x9/1920/…" -> 1920). */
const widthFromPath = (p) => Math.max(0, ...String(p || "").split("/").map((x) => (/^\d{3,4}$/.test(x) ? Number(x) : 0)));

/**
 * Full-size `path`, or `pathSmall` when the connection is slow or when the small set
 * already covers the viewport at this DPR without noticeable upscaling.
 */
function pickPath(seq) {
  if (!seq.pathSmall) return seq.path;
  const c = navigator.connection;
  const slow = !!(c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || "")));
  if (slow || !seq.path) return seq.pathSmall;
  const { W, H } = viewport();
  const [aw, ah] = seq.name === "landscape" ? [16, 9] : [9, 16];
  const coverW = Math.max(W + 2 * MARGIN, (H + 2 * MARGIN) * (aw / ah)) * overscale() * Math.min(devicePixelRatio || 1, 2);
  const smallW = Number(seq.widthSmall) || widthFromPath(seq.pathSmall) || 0;
  return smallW && coverW <= smallW * 1.1 ? seq.pathSmall : seq.path;
}

/** Switch to the sequence for this orientation; keeps B.smooth/B.target (scroll progress). */
function activateSequence(orient) {
  const seq = sequenceFor(orient);
  const pattern = pickPath(seq);
  if (B.pattern === pattern) return;
  B.seqName = seq.name;
  B.seq = seq;
  B.pattern = pattern;
  B.count = seq.count;
  B.imgs = B.cache[pattern] ||= new Array(seq.count);
  B.drawn = -1;
  B.dirty = true;
  B.root.dataset.sequence = seq.name;
  const token = ++B.loadToken;                     // stops the previous sequence's loader
  if (still()) {
    const i = Math.min(B.count, Math.max(1, Number(cfg().stillFrame) || 1)) - 1;
    B.target = B.smooth = B.count > 1 ? i / (B.count - 1) : 0;
    loadFrames([i], token);
  } else {
    loadFrames(loadOrder(B.count, Math.round(B.smooth * (B.count - 1))), token);
  }
  kick();
}

const overscale = () => Math.max(1, Number(cfg().overscale) || 1.04);

/** focal point {x,y} (0..1 of the frame) of the active sequence. */
function focal() {
  const f = B.seq?.focalPoint || {};
  return { x: Number.isFinite(f.x) ? f.x : 0.5, y: Number.isFinite(f.y) ? f.y : 0.5 };
}

/** "frame_%04d.webp", 0 -> "frame_0001.webp" */
const frameUrl = (pattern, i) => pattern.replace(/%0?(\d*)d/, (_, n) => String(i + 1).padStart(Number(n) || 0, "0"));

/** current frame first, then every 10th, every 5th, every 2nd, then the rest. */
function loadOrder(count, first) {
  const seen = new Set();
  const out = [];
  const push = (i) => { if (i >= 0 && i < count && !seen.has(i)) { seen.add(i); out.push(i); } };
  push(first); push(0); push(count - 1);
  for (const step of [10, 5, 2, 1]) for (let i = 0; i < count; i += step) push(i);
  return out;
}

function loadFrames(order, token, attempt = 0) {
  const pattern = B.pattern;
  const imgs = B.imgs;
  const failed = [];
  let next = 0, inFlight = 0;
  const one = () => {
    if (!B || token !== B.loadToken) return;                            // sequence switched: stop
    if (next >= order.length) {
      // all requested: retry frames that failed (network hiccup, files still uploading) with back-off,
      // otherwise the animation would stick on the last loaded frame
      if (inFlight === 0 && failed.length && attempt < 5) {
        setTimeout(() => loadFrames(failed, token, attempt + 1), 1000 * 2 ** attempt);
      }
      return;
    }
    const i = order[next++];
    if (imgs[i]) return one();
    inFlight++;
    const img = new Image();
    img.decoding = "async";
    img.src = frameUrl(pattern, i) + (attempt ? `?r=${attempt}` : "");
    (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }))
      .then(() => {
        imgs[i] = img;
        if (B.imgs === imgs && (Math.abs(i - frameIndex()) < 12 || B.drawn < 0)) { B.dirty = true; kick(); }
      })
      .catch(() => failed.push(i))
      .finally(() => { inFlight--; one(); });
  };
  for (let k = 0; k < 6; k++) one();   // 6 in flight
}

/* ====================================================== scroll -> clip position */

function scrollPosition() {
  const sc = cfg().scroll || {};
  const H = innerHeight || 1;
  if (sc.mapping === "distance") {
    const loops = Math.max(0, scrollY - (sc.startOffset || 0)) / H / (Number(sc.screensPerLoop) || 4);
    if (sc.pingpong) { const m = loops % 2; return m <= 1 ? m : 2 - m; }
    return loops % 1;
  }
  const max = document.documentElement.scrollHeight - H;
  const start = Number(sc.startOffset) || 0;
  const end = max - (Number(sc.endOffset) || 0);
  return end > start ? clamp01((scrollY - start) / (end - start)) : 0;
}

function onScroll(e) {
  if (!B) return;
  const next = scrollPosition();
  if (e?.type === "scroll") {                 // a real scroll: remember where the visitor is
    B.history.push({ t: performance.now(), p: next });
    if (B.history.length > 20) B.history.shift();
  }
  const sc = cfg().scroll || {};
  if (sc.mapping === "distance" && !sc.pingpong && Math.abs(next - B.smooth) > 0.5) B.smooth = next; // hard wrap: jump
  B.target = next;
  kick();
}

const frameIndex = () => Math.round(B.smooth * (B.count - 1));

/* ================================================================ render loop */

function kick() { if (B && !B.raf) B.raf = requestAnimationFrame(tick); }

function tick(now) {
  B.raf = 0;
  const dt = B.lastT ? Math.min(250, now - B.lastT) : 16.7;
  B.lastT = now;
  const k = (rate) => 1 - Math.pow(1 - rate, dt / 16.7);       // frame-rate independent easing

  const lerp = Math.min(1, Math.max(0.02, Number(cfg().scroll?.smoothing) || 0.12));
  B.smooth += (B.target - B.smooth) * k(lerp);
  if (Math.abs(B.target - B.smooth) < 0.0004) B.smooth = B.target;
  B.px += (B.tpx - B.px) * k(0.08);
  B.py += (B.tpy - B.py) * k(0.08);
  const pointerMoving = Math.abs(B.tpx - B.px) > 0.0002 || Math.abs(B.tpy - B.py) > 0.0002;

  const i = frameIndex();
  if (i !== B.drawn || B.dirty || pointerMoving) draw(i);

  if (B.smooth !== B.target || pointerMoving) kick();
  else B.lastT = 0;
}

/** nearest loaded frame to i */
function nearest(i) {
  if (B.imgs[i]) return i;
  for (let d = 1; d < B.count; d++) {
    if (B.imgs[i - d]) return i - d;
    if (B.imgs[i + d]) return i + d;
  }
  return -1;
}

function draw(want) {
  const i = nearest(want);
  if (i < 0) return;
  const img = B.imgs[i];
  const { ctx, W, H, dpr } = B;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const CW = W + 2 * MARGIN, CH = H + 2 * MARGIN;   // canvas size in css px (viewport + margin)

  // cover: scale so the frame fills the whole canvas, plus a slight overscale for parallax room
  const s = Math.max(CW / iw, CH / ih) * overscale();
  const w = iw * s, h = ih * s;

  // centre the focal point (nudged by the pointer) on the viewport centre, then clamp so no edge shows
  const f = focal();
  const fx = clamp01(f.x + B.px), fy = clamp01(f.y + B.py);
  const x = Math.min(0, Math.max(CW - w, CW / 2 - fx * w));
  const y = Math.min(0, Math.max(CH - h, CH / 2 - fy * h));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, w, h);

  B.layout = { x: x - MARGIN, y: y - MARGIN, w, h, iw, ih, W, H, upscale: (w * dpr) / iw }; // viewport coords (QA)
  B.drawn = i === want ? i : -2;      // -2 = showing a stand-in; redraw when the real frame arrives
  B.dirty = false;
  B.root.dataset.frame = String(i + 1);
}

function sizeCanvas() {
  // the layout viewport (excludes the scrollbar) — must match the CSS box the canvas fills
  B.W = document.documentElement.clientWidth || innerWidth;
  B.H = document.documentElement.clientHeight || innerHeight;
  B.dpr = Math.min(devicePixelRatio || 1, 1.5);
  B.canvas.width = Math.round((B.W + 2 * MARGIN) * B.dpr);
  B.canvas.height = Math.round((B.H + 2 * MARGIN) * B.dpr);
  B.dirty = true;
}

let resizeQueued = false;
function onResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  // where the visitor was before the layout changed: the last scroll-event progress older than
  // ~200 ms (reflow on rotation fires layout/scroll callbacks with already-shifted values)
  const now = performance.now();
  const before = B?.history.filter((h) => now - h.t > 200).pop();
  const progress = before ? before.p : (B ? B.target : 0);
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (!B) return;
    sizeCanvas();
    const o = orientation();
    const rotated = o !== B.orient;
    B.orient = o;
    activateSequence(o);                       // rotation / resize: other sequence (or other size)
    if (B.sceneName) { const n = B.sceneName; B.sceneName = null; goTo(n, true); }
    if (rotated && !still() && (cfg().scroll?.mapping || "page") === "page") {
      // The page reflows on rotation, so the same scrollY would be a different point in the
      // animation. Put the visitor back at the same progress instead.
      requestAnimationFrame(() => {
        if (!B) return;
        window.scrollTo(0, scrollYFor(progress));
        B.target = B.smooth = progress;
        B.history.push({ t: performance.now() - 1000, p: progress });   // a second resize in the same burst keeps it
        B.dirty = true;
        kick();
      });
    } else {
      onScroll();
    }
    kick();
  });
}

/** inverse of scrollPosition() for mapping "page": the scrollY that shows progress p (0..1). */
function scrollYFor(p) {
  const sc = cfg().scroll || {};
  const max = document.documentElement.scrollHeight - (innerHeight || 1);
  const start = Number(sc.startOffset) || 0;
  const end = max - (Number(sc.endOffset) || 0);
  return Math.max(0, start + clamp01(p) * Math.max(0, end - start));
}

/* ===================================================================== scenes */

function resolveScene(name) {
  const scenes = cfg().scenes || {};
  const s = scenes[name] || scenes[cfg().defaultScene] || {};
  return Object.fromEntries(SCENE_KEYS.map((k) => [k, s[k] ?? SCENE_NEUTRAL[k]]));
}

function sceneFor(el) {
  if (el.dataset.scene) return el.dataset.scene;
  if (el.querySelector?.(".pcard") && cfg().scenes?.shelf) return "shelf";
  return cfg().defaultScene || "content";
}

function applyScene() {
  const s = B.scene;
  B.canvas.style.filter = `brightness(${s.brightness}) blur(${s.blur}px)`;
  B.dim.style.opacity = s.dim;
  B.tint.style.opacity = s.tint;
}

function goTo(name, instant = false) {
  if (!B || name === B.sceneName) return;
  B.sceneName = name;
  B.root.dataset.scene = name;
  const target = resolveScene(name);
  const g = gsap();
  B.sceneTween?.kill();
  if (!g || instant || still()) { Object.assign(B.scene, target); applyScene(); return; }
  B.sceneTween = g.to(B.scene, { ...target, duration: motionCfg().sceneDuration ?? 1.2, ease: "power2.inOut", onUpdate: applyScene });
}

function watchScenes() {
  const sections = [
    ...document.querySelectorAll("main > section, main > div > section, main > .marquee, footer"),
  ].filter((el, i, a) => a.indexOf(el) === i);
  if (!sections.length) return;
  // tag each section with its look so CSS can add a readability panel where needed
  sections.forEach((s) => s.classList.add("bd-scene", `bd-scene--${sceneFor(s)}`));
  goTo(sceneFor(sections[0]), true);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) goTo(sceneFor(e.target)); });
  }, { rootMargin: "-45% 0px -45% 0px" });
  sections.forEach((s) => io.observe(s));
}

/* ============================================== progress line + pointer parallax */

function watchMotion() {
  const m = motionCfg();
  if (m.progressBar) {
    const bar = document.createElement("div");
    bar.className = "backdrop-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.append(bar);
    let queued = false;
    const update = () => {
      queued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? clamp01(scrollY / max) : 0})`;
    };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }
  const pp = Math.min(0.05, Math.max(0, Number(m.pointerParallax) || 0)); // fraction of the frame
  if (pp && !still() && hoverCapable() && isDesktop()) {
    addEventListener("pointermove", (e) => {
      B.tpx = ((e.clientX / innerWidth) * 2 - 1) * pp;   // focal offset, fraction of the frame
      B.tpy = ((e.clientY / innerHeight) * 2 - 1) * pp;
      kick();
    }, { passive: true });
  }
}

/* ==================================================================== marquee */

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
  for (let r = 0; r < 2; r++) {                      // two identical halves -> seamless loop
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
  if (!g || still()) return;
  let x = 0, boost = 0, lastY = scrollY;
  g.ticker.add((time, dt) => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    boost += (Math.min(40, Math.abs(dy)) - boost) * 0.1;
    const dir = dy < 0 ? -1 : 1;
    x -= (0.04 + boost * 0.02) * dt * (boost > 1 ? dir : 1);
    const half = track.scrollWidth / 2 || 1;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    track.style.transform = `translate3d(${x}px,0,0) skewX(${(-boost * 0.25 * dir).toFixed(2)}deg)`;
  });
}

/* ============================================================ split headlines */

function splitHeadlines() {
  if (!motionCfg().splitHeadlines || still()) return;
  const g = gsap();
  const ST = window.ScrollTrigger;
  if (!g || !ST) return;
  const heads = [...document.querySelectorAll("main h1, main h2, footer h2")].filter((h) =>
    !h.closest(".hero, .backdrop, [data-no-split]") && !h.dataset.split && h.children.length === 0 && h.textContent.trim());
  heads.forEach((h) => {
    const label = h.textContent.trim();
    const words = label.split(/\s+/);
    h.dataset.split = "";
    h.setAttribute("aria-label", label);
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

/* ================================================================= public API */

export function initMotionLayer(page) {
  if (!B) return;
  mountMarquee(page);
  watchScenes();
  watchMotion();
  splitHeadlines();
  onScroll();                    // page height is final-ish now
  window.ScrollTrigger?.refresh();
}

/** QA helpers: current frame (1-based) and scene. */
export const backdropState = () => (B ? { frame: B.drawn + 1, count: B.count, sequence: B.seqName, target: B.target, scene: B.sceneName, set: B.pattern, layout: B.layout } : null);
