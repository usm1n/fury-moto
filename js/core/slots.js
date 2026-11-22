/**
 * Video slot wiring. Any element with data-video-slot="<section>" is mounted
 * from config.videoSlots. HTML never names a video file.
 *
 *   <a data-video-slot="category-cards" data-video-start="2" data-video-src="crop"> (card)
 *   <section data-video-slot="product-gallery"> (inline)
 *
 * Modes: "card" (hover clip), "inline" (gallery slide with play/pause), "none".
 * The site-wide background is NOT a slot: it is js/core/backdrop.js.
 *
 * Optional attributes on the element override slot values:
 *   data-video-id, data-video-start, data-video-src ("main"|"crop")
 *
 * mountSlots(root) is called by app.js after each page/component renders.
 * Calling it twice on the same element is a no-op.
 */
import { getSlot, getVideo } from "./config.js";
import { isDesktop } from "./manager.js";
import { VideoBg } from "./video-bg.js";

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
  const h = VideoBg.mount(el, {
    video,
    mode,
    overlayOpacity: slot.overlayOpacity ?? 0.5,
    focalPoint: slot.focalPoint,
    start: d.videoStart != null ? Number(d.videoStart) : slot.start || 0,
    playbackRate: slot.playbackRate || 1,
    src: d.videoSrc || (mode === "card" ? "crop" : "main"),
  });
  handles.set(el, h);
  return h;
}

export function mountSlots(root = document) {
  root.querySelectorAll("[data-video-slot]").forEach(mountSlot);
}
