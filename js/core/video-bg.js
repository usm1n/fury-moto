/**
 * VIDEO ENGINE — background / card / inline modes.            [API FROZEN — Phase 1]
 * Implementation is owned by the Video-engine agent (Phase 2). Callers never
 * create <video> elements themselves; they call mount() or let slots.js do it.
 *
 *   const handle = VideoBg.mount(el, {
 *     video,            // object from config.videos (required)
 *     mode,             // "background" | "card" | "inline"
 *     overlayOpacity,   // 0..1
 *     focalPoint,       // CSS object-position, overrides video.focalPoint
 *     start,            // seconds offset
 *     playbackRate,     // number
 *     layout,           // "cover" (default) | "hero-panel" (desktop 9:16 panel + blurFill behind)
 *     src,              // "main" (default) | "crop" (card clip)
 *     priority,         // true = load immediately (hero), skip lazy observer
 *   });
 *   handle.play(); handle.pause(); handle.destroy();
 *
 * Guarantees:
 *   - poster rendered synchronously; video fades in on canplay
 *   - lazy: loads within ~1 viewport; pauses off-screen
 *   - global budget: max 2 playing videos (see manager.js)
 *   - reduced-motion / Save-Data / 2g -> poster only
 *   - el gets class "vslot vslot--<mode>" and reserves aspect ratio for inline/card
 */
import { canPlayMotion } from "./manager.js";

export const VideoBg = {
  mount(el, options = {}) {
    // STUB: poster only until the engine agent implements this.
    const { video, overlayOpacity = 0.5, focalPoint } = options;
    if (!el || !video) return noop;
    el.classList.add("vslot", `vslot--${options.mode || "background"}`);
    el.style.setProperty("--overlay", overlayOpacity);
    const media = document.createElement("div");
    media.className = "vslot__media";
    media.innerHTML = `<img src="${video.poster?.jpg || ""}" alt="" style="object-position:${focalPoint || video.focalPoint || "50% 50%"}">`;
    const overlay = document.createElement("div");
    overlay.className = "vslot__overlay";
    el.prepend(media, overlay);
    void canPlayMotion;
    return { el, play() {}, pause() {}, destroy() { media.remove(); overlay.remove(); } };
  },
};

const noop = { el: null, play() {}, pause() {}, destroy() {} };
export default VideoBg;
