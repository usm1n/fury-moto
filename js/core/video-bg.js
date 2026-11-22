/**
 * VIDEO ENGINE — card / inline (and background = cover) modes.            [API FROZEN — Phase 1]
 * Implementation is owned by the Video-engine agent (Phase 2). Callers never
 * create <video> elements themselves; they call mount() or let slots.js do it.
 *
 *   const handle = VideoBg.mount(el, {
 *     video,            // object from config.videos (required)
 *     mode,             // "card" | "inline" | "background" (cover)
 *     overlayOpacity,   // 0..1
 *     focalPoint,       // CSS object-position, overrides video.focalPoint
 *     start,            // seconds offset
 *     playbackRate,     // number
 *     src,              // "main" (default) | "crop" (card clip)
 *     priority,         // true = load immediately, skip lazy observer
 *   });
 *   handle.play(); handle.pause(); handle.destroy();
 *
 * Guarantees:
 *   - poster rendered synchronously; video fades in on canplay
 *   - lazy: loads within ~1 viewport; pauses off-screen
 *   - global budget: max 2 playing videos (see manager.js)
 *   - reduced-motion / Save-Data / 2g -> poster only
 *   - el gets class "vslot vslot--<mode>" and reserves aspect ratio for inline/card
 *
 * Phase 2 additions (optional):
 *   opts.playPriority  number, overrides the budget priority (manager.PRIORITY scale)
 *   handle.isPlaying() boolean
 *   exports buildPoster(), focalOf(), aspectOf(), makeVideo(), observeNear(), observeVisible()
 *
 * Notes:
 *   - `autoplay` is deliberately NOT set on the element: the engine calls play() itself
 *     so the global budget can never be exceeded by the browser autoplaying on its own.
 *   - A missing/404 source leaves the poster in place silently (class "is-poster-only").
 */
import {
  canPlayMotion, hoverCapable, saveData,
  requestPlay, release, waitForSlot, cancelWait, PRIORITY,
} from "./manager.js";
import { emit } from "./bus.js";
import { config } from "./config.js";

const DEFAULT_FOCAL = "50% 50%";
const players = new Set();
let activeCard = null;

/* ------------------------------------------------------------------ helpers */

export const focalOf = (opts = {}, video = {}) => opts.focalPoint || video.focalPoint || DEFAULT_FOCAL;

/** "9/16" -> [9, 16] */
export function aspectOf(video) {
  const m = /^\s*([\d.]+)\s*[/:x]\s*([\d.]+)\s*$/.exec(String(video?.aspect || "9/16"));
  return m ? [Number(m[1]), Number(m[2])] : [9, 16];
}

/** <picture> with webp + jpg. Broken images hide themselves (never show a broken-image icon). */
export function buildPoster(video, { focal = DEFAULT_FOCAL, alt = "", priority = false, className = "vslot__poster" } = {}) {
  const pic = document.createElement("picture");
  pic.className = className;
  const p = video?.poster || {};
  if (p.webp) {
    const s = document.createElement("source");
    s.type = "image/webp";
    s.srcset = p.webp;
    pic.append(s);
  }
  const img = document.createElement("img");
  img.alt = alt;
  img.decoding = "async";
  img.draggable = false;
  if (priority) img.setAttribute("fetchpriority", "high");
  else img.loading = "lazy";
  img.style.objectPosition = focal;
  img.addEventListener("error", () => img.classList.add("is-missing"), { once: true });
  if (p.jpg || p.webp) img.src = p.jpg || p.webp;
  else img.classList.add("is-missing");
  pic.append(img);
  return pic;
}

/* Shared IntersectionObservers (one per kind, not one per slot). */
const nearCbs = new WeakMap();
let nearIO = null;
export function observeNear(el, cb) {
  if (!("IntersectionObserver" in window)) { cb(true); return () => {}; }
  nearIO ||= new IntersectionObserver(
    (entries) => entries.forEach((e) => nearCbs.get(e.target)?.(e.isIntersecting, e)),
    { rootMargin: "100% 0px 100% 0px" },
  );
  nearCbs.set(el, cb);
  nearIO.observe(el);
  return () => { nearIO.unobserve(el); nearCbs.delete(el); };
}

const visCbs = new WeakMap();
let visIO = null;
export function observeVisible(el, cb) {
  if (!("IntersectionObserver" in window)) { cb({ isIntersecting: true, intersectionRatio: 1 }); return () => {}; }
  visIO ||= new IntersectionObserver(
    (entries) => entries.forEach((e) => visCbs.get(e.target)?.(e)),
    { threshold: [0, 0.6] },
  );
  visCbs.set(el, cb);
  visIO.observe(el);
  return () => { visIO.unobserve(el); visCbs.delete(el); };
}

/** Pick 720 or 1080 from the box the video will cover. 1080 only for large viewports with enough pixels. */
function pickSize(box, video) {
  if (!video.mp4?.["1080"] && !video.webm?.["1080"]) return "720";
  if (saveData()) return "720";
  const r = box.getBoundingClientRect();
  const w = r.width || innerWidth;
  const h = r.height || innerHeight;
  const [aw, ah] = aspectOf(video);
  const renderedW = Math.max(w, (h * aw) / ah);              // width of the cover-scaled video
  const need = renderedW * Math.min(window.devicePixelRatio || 1, 2);
  const large = Math.max(innerWidth, innerHeight) >= 1024;
  return large && need > 760 ? "1080" : "720";
}

function sourcesFor(video, srcKind, size) {
  if (srcKind === "crop" && video.crop) return [{ src: video.crop, type: "video/mp4" }];
  const pick = (set) => set?.[size] || set?.["720"] || set?.["1080"] || null;
  const out = [];
  const webm = pick(video.webm);
  const mp4 = pick(video.mp4);
  if (webm) out.push({ src: webm, type: "video/webm" });
  if (mp4) out.push({ src: mp4, type: "video/mp4" });
  if (!out.length && typeof video.src === "string") out.push({ src: video.src, type: "video/mp4" });
  return out;
}

/** Create a muted inline <video>. onFail fires once if every source errors. */
export function makeVideo(sources, { preload = "auto", loop = true, onFail, label } = {}) {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.setAttribute("disableremoteplayback", "");
  v.disablePictureInPicture = true;
  v.loop = loop;
  v.preload = preload;
  v.tabIndex = -1;
  if (label) v.setAttribute("aria-label", label);
  else v.setAttribute("aria-hidden", "true");
  let failed = false;
  const fail = () => { if (failed) return; failed = true; onFail?.(); };
  if (!sources.length) queueMicrotask(fail);
  sources.forEach((s, i) => {
    const el = document.createElement("source");
    if (i === sources.length - 1) el.addEventListener("error", fail);
    el.src = s.src;
    el.type = s.type;
    v.append(el);
  });
  v.addEventListener("error", fail);
  return v;
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

document.addEventListener("visibilitychange", () => players.forEach((p) => p.update()));

/* ------------------------------------------------------------------- player */

function createPlayer(el, opts) {
  const { video } = opts;
  const mode = ["background", "card", "inline"].includes(opts.mode) ? opts.mode : "background";
  const focal = focalOf(opts, video);
  const start = Math.max(0, Number(opts.start) || 0);
  const rate = Number(opts.playbackRate) || 1;
  const srcKind = opts.src === "crop" ? "crop" : "main";
  const motion = canPlayMotion();
  const hover = hoverCapable();
  const ui = config.ui || {};
  const isFooter = el.dataset.videoSlot === "footer" || !!el.closest?.("footer, [data-component='footer']");
  const prio = typeof opts.playPriority === "number" ? opts.playPriority
    : opts.priority ? PRIORITY.hero
    : isFooter ? PRIORITY.footer
    : PRIORITY[mode] ?? PRIORITY.background;

  // state
  let media, overlay, toggle;
  let mainVid = null;
  let loaded = false, failed = false, destroyed = false;
  let playingNow = false, visible = false, ratio = 0, intent = false;
  let manual = null; // null = auto, true = user/API wants play, false = user/API paused
  let api = null;    // assigned at the end; referenced by the card hand-off
  const cleanups = [];

  /* ---- DOM ---- */
  el.classList.add("vslot", `vslot--${mode}`);
  el.style.setProperty("--overlay", String(opts.overlayOpacity ?? 0.5));
  el.style.setProperty("--focal", focal);
  const [aw, ah] = aspectOf(video);
  if (mode === "inline") el.style.setProperty("--aspect", `${aw} / ${ah}`);
  if (mode === "card" && !getComputedStyle(el).getPropertyValue("--aspect").trim()) {
    el.style.setProperty("--aspect", `${aw} / ${ah}`);
  }

  media = document.createElement("div");
  media.className = "vslot__media";
  if (mode !== "inline") media.setAttribute("aria-hidden", "true");
  overlay = document.createElement("div");
  overlay.className = "vslot__overlay";
  el.prepend(media, overlay);

  media.append(buildPoster(video, { focal, alt: mode === "inline" ? video.alt || "" : "", priority: !!opts.priority }));

  if (mode === "inline" && motion) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "vslot__toggle";
    toggle.addEventListener("click", () => {
      manual = playingNow || (manual !== false && wantPlay()) ? false : true;
      update();
      syncToggle();
    });
    el.append(toggle);
    syncToggle();
  }

  function syncToggle() {
    if (!toggle) return;
    const on = playingNow || (manual !== false && wantPlay());
    toggle.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    toggle.setAttribute("aria-label", on ? ui.videoPause || "" : ui.videoPlay || "");
    toggle.classList.toggle("is-on", on);
  }

  /* ---- loading ---- */
  function load() {
    if (loaded || failed || destroyed || !motion) return;
    loaded = true;
    const sources = sourcesFor(video, srcKind, pickSize(media, video));
    const preload = mode === "card" && hover && !intent ? "metadata" : "auto";
    const v = makeVideo(sources, {
      preload,
      loop: !(start > 0),
      onFail: () => { if (v === mainVid) fail(); },   // ignore errors from a video already torn down
      label: mode === "inline" ? video.alt || "" : null,
    });
    mainVid = v;
    v.style.objectPosition = focal;
    v.addEventListener("loadedmetadata", () => {
      if (start > 0 && Number.isFinite(v.duration) && start < v.duration - 0.25) {
        try { v.currentTime = start; } catch { /* ignore */ }
      }
      v.defaultPlaybackRate = rate;
      v.playbackRate = rate;
    }, { once: true });
    v.addEventListener("ended", () => {          // only fires when loop=false (start offset)
      try { v.currentTime = start; } catch { /* ignore */ }
      if (playingNow) v.play().catch(() => {});
    });
    v.addEventListener("playing", () => {
      if (v !== mainVid) return;
      v.classList.add("is-ready");
      el.classList.add("is-playing");
    });
    v.addEventListener("canplay", () => { if (playingNow && v === mainVid) v.classList.add("is-ready"); });
    media.append(v);
    update();
  }

  function unloadVideos() {
    stop(false);
    if (mainVid) { cancelWait(mainVid); release(mainVid); mainVid.removeAttribute("src"); mainVid.replaceChildren(); mainVid.load?.(); mainVid.remove(); }
    mainVid = null;
    loaded = false;
  }

  function fail() {
    if (failed) return;
    failed = true;
    unloadVideos();
    el.classList.add("is-poster-only");
    el.classList.remove("is-playing", "is-waiting");
    toggle?.remove();
    toggle = null;
  }

  /* ---- play state ---- */
  function wantPlay() {
    if (destroyed || failed || !motion || document.hidden || !visible) return false;
    if (manual === false) return false;
    if (manual === true) return true;
    if (mode === "card") return hover ? intent : ratio >= 0.6;
    return true;
  }

  function tryPlay() {
    if (!mainVid || playingNow || !wantPlay()) return;
    if (!requestPlay(mainVid, prio, onEvicted)) {
      el.classList.add("is-waiting");
      waitForSlot(mainVid, prio, tryPlay);
      return;
    }
    el.classList.remove("is-waiting");
    if (mode === "card") {
      if (activeCard && activeCard !== api) activeCard.yieldCard();
      activeCard = api;
      if (mainVid.preload !== "auto") mainVid.preload = "auto";
    }
    playingNow = true;
    const v = mainVid;
    v.play().then(() => {
      if (v === mainVid && playingNow) emit("video:play", { el });
    }).catch(() => {
      // autoplay blocked or aborted by a pause: stay on poster
      if (v === mainVid && playingNow) { playingNow = false; release(v); syncToggle(); }
    });
    syncToggle();
  }

  function onEvicted() {
    if (!playingNow) return;
    playingNow = false;
    el.classList.remove("is-playing");
    emit("video:pause", { el });
    syncToggle();
    if (wantPlay() && mainVid) { el.classList.add("is-waiting"); waitForSlot(mainVid, prio, tryPlay); }
  }

  function stop(rewind) {
    el.classList.remove("is-waiting");
    if (!mainVid) return;
    cancelWait(mainVid);
    if (playingNow) {
      playingNow = false;
      mainVid.pause();
      release(mainVid);
      el.classList.remove("is-playing");
      emit("video:pause", { el });
    }
    if (rewind) {
      mainVid.classList.remove("is-ready");
      try { if (mainVid.readyState > 0) mainVid.currentTime = start; } catch { /* ignore */ }
    }
    if (activeCard === api && mode === "card") activeCard = null;
    syncToggle();
  }

  function update() {
    if (destroyed) return;
    if (wantPlay()) {
      if (!loaded) load();
      tryPlay();
    } else {
      stop(mode === "card");
    }
    syncToggle();
  }

  /* ---- observers & listeners ---- */
  if (motion) {
    if (opts.priority) load();
    else cleanups.push(observeNear(el, (near) => { if (near) load(); }));

    cleanups.push(observeVisible(el, (e) => {
      visible = e.isIntersecting;
      ratio = e.intersectionRatio;
      update();
    }));

    if (mode === "card") {
      const enter = () => { intent = true; update(); };
      const leave = () => { intent = false; update(); };
      const focusOut = (e) => { if (!el.contains(e.relatedTarget)) leave(); };
      if (hover) {
        el.addEventListener("pointerenter", enter);
        el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointerenter", enter); el.removeEventListener("pointerleave", leave); });
      }
      el.addEventListener("focusin", enter);
      el.addEventListener("focusout", focusOut);
      cleanups.push(() => { el.removeEventListener("focusin", enter); el.removeEventListener("focusout", focusOut); });
    }
  } else {
    el.classList.add("is-poster-only");
  }

  api = {
    el,
    play() { manual = true; update(); },
    pause() { manual = false; update(); },
    isPlaying: () => playingNow,
    update,
    yieldCard() { intent = false; stop(true); },
    destroy() {
      if (destroyed) return;
      unloadVideos();
      destroyed = true;
      cleanups.forEach((fn) => fn());
      players.delete(api);
      if (activeCard === api) activeCard = null;
      media.remove();
      overlay.remove();
      toggle?.remove();
      el.classList.remove("vslot", `vslot--${mode}`, "is-playing", "is-waiting", "is-poster-only");
    },
  };
  players.add(api);
  return api;
}

export const VideoBg = {
  mount(el, options = {}) {
    if (!el || !options.video) return noop;
    if (el.__vslot) return el.__vslot;          // never double-mount the same element
    const p = createPlayer(el, options);
    const handle = {
      el,
      play: p.play,
      pause: p.pause,
      isPlaying: p.isPlaying,
      destroy() { p.destroy(); delete el.__vslot; },
    };
    el.__vslot = handle;
    return handle;
  },
};

const noop = { el: null, play() {}, pause() {}, isPlaying: () => false, destroy() {} };
export default VideoBg;
