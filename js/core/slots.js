/**
 * Video slot wiring. Any element with data-video-slot="<section>" is mounted
 * from config.videoSlots. HTML never names a video file.
 *
 *   <section data-video-slot="hero" data-video-layout="hero-panel"> ... </section>
 *   <section data-video-slot="built-for-ride"> ... <div data-beat>…</div> </section>
 *   <a data-video-slot="category-cards" data-video-start="2" data-video-src="crop"> (card)
 *
 * Optional attributes on the element override slot values:
 *   data-video-id, data-video-start, data-video-src ("main"|"crop"), data-video-layout,
 *   data-video-priority (present = load immediately, e.g. hero)
 *
 * mountSlots(root) is called by app.js after each page/component renders.
 * Calling it twice on the same element is a no-op.
 */
import { config, getSlot, getVideo } from "./config.js";
import { isDesktop } from "./manager.js";
import { VideoBg } from "./video-bg.js";
import { VideoScrub } from "./video-scrub.js";

const handles = new WeakMap();

export function resolveMode(slot) {
  if (!slot) return "none";
  const bp = isDesktop() ? slot.desktopMode : slot.mobileMode;
  return bp || slot.mode || "none";
}

export function mountSlot(el) {
  if (handles.has(el)) return handles.get(el);
  const slot = getSlot(el.dataset.videoSlot);
  const mode = resolveMode(slot);
  const video = getVideo(el.dataset.videoId || slot?.videoId);
  el.dataset.videoMode = mode;
  if (mode === "none" || !video) { handles.set(el, null); return null; }

  const d = el.dataset;
  const opts = {
    video,
    mode,
    overlayOpacity: slot.overlayOpacity ?? 0.5,
    focalPoint: slot.focalPoint,
    start: d.videoStart != null ? Number(d.videoStart) : slot.start || 0,
    playbackRate: slot.playbackRate || 1,
    layout: d.videoLayout || "cover",
    src: d.videoSrc || (mode === "card" ? "crop" : "main"),
    priority: "videoPriority" in d,
  };
  const h = mode === "scrub"
    ? VideoScrub.mount(el, { ...opts, beats: el.querySelectorAll("[data-beat]") })
    : VideoBg.mount(el, opts);
  handles.set(el, h);
  return h;
}

export function mountSlots(root = document) {
  root.querySelectorAll("[data-video-slot]").forEach(mountSlot);
}

export const slotCount = () => (config.videoSlots || []).filter((s) => s.mode !== "none").length;
