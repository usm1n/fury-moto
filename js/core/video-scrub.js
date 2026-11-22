/**
 * VIDEO ENGINE — scroll-scrub mode.                            [API FROZEN — Phase 1]
 * Implementation is owned by the Video-engine agent (Phase 2).
 *
 *   const handle = VideoScrub.mount(el, {
 *     video,            // config.videos entry (uses scrubMp4 + frames)
 *     overlayOpacity,
 *     focalPoint,
 *     pinTarget,        // element to pin (default el)
 *     scrollLength,     // e.g. "250%" of viewport (default "200%")
 *     beats,            // NodeList/array of elements to fade in sequence (e.g. [data-beat])
 *     onProgress,       // (0..1) => void
 *   });
 *   handle.destroy();
 *
 * Behaviour:
 *   - GSAP ScrollTrigger pins el and maps progress -> video.currentTime with lerp smoothing
 *   - iOS / choppy seek -> canvas frame sequence from video.frames
 *   - reduced-motion / Save-Data / no GSAP -> static poster, all beats visible, no pin
 */
import { VideoBg } from "./video-bg.js";

export const VideoScrub = {
  mount(el, options = {}) {
    // STUB: static poster + visible beats.
    const h = VideoBg.mount(el, { ...options, mode: "background" });
    el.classList.add("vslot--scrub", "is-static");
    (options.beats ? [...options.beats] : []).forEach((b) => { b.style.opacity = 1; });
    return h;
  },
};

export default VideoScrub;
