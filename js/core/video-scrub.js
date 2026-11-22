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
 *
 * Phase 2 additions (optional):
 *   opts.layout = "hero-panel"  -> on desktop the 9:16 scrub sits in a framed panel over a blurred poster fill
 *   el[data-beat-mode="stack"]  -> beats fade in and stay (default "sequence": each beat fades out before the next)
 *   handle.progress()           -> current raw progress 0..1
 *   handle.mode()               -> "static" | "video" | "frames"
 * Each beat gets the CSS custom property --beat (0..1); css/video.css turns it into opacity + slide.
 */
import { buildPoster, focalOf, makeVideo, observeNear } from "./video-bg.js";
import { canPlayMotion, isDesktop, isIOS } from "./manager.js";

const SEEK_EPS = 1 / 30;        // only seek when we're more than ~1 frame away
const SLOW_SEEK_MS = 120;       // a seek slower than this counts as "choppy"
const SLOW_SEEKS_TO_SWITCH = 3;
const LERP = 0.14;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toPx(len) {
  const s = String(len ?? "200%").trim();
  if (s.endsWith("%")) return (innerHeight * parseFloat(s)) / 100;
  if (s.endsWith("vh")) return (innerHeight * parseFloat(s)) / 100;
  return parseFloat(s) || innerHeight * 2;
}

/** "f_%03d.webp", 0 -> "f_001.webp" (1-based, zero-padded) */
export function frameUrl(pattern, i) {
  return pattern.replace(/%0?(\d*)d/, (_, n) => String(i + 1).padStart(Number(n) || 0, "0"));
}

/** focal "50% 30%" -> [0.5, 0.3] */
function focalFractions(focal) {
  const kw = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const parts = String(focal).trim().split(/\s+/);
  const f = (p) => (p in kw ? kw[p] : p?.endsWith("%") ? parseFloat(p) / 100 : 0.5);
  return [clamp01(f(parts[0])), clamp01(f(parts[1] ?? parts[0]))];
}

/** Order frames coarse-to-fine so the whole range is covered early: 0,16,32…, then 8,24…, then 4… */
function progressiveOrder(count) {
  const seen = new Set();
  const out = [];
  for (const step of [16, 8, 4, 2, 1]) {
    for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  if (!seen.has(count - 1)) out.splice(1, 0, count - 1);
  return out;
}

export const VideoScrub = {
  mount(el, opts = {}) {
    const { video } = opts;
    if (!el || !video) return noop;
    if (el.__vslot) return el.__vslot;

    const g = window.gsap;
    const ST = window.ScrollTrigger;
    const beats = [...(opts.beats || el.querySelectorAll("[data-beat]"))];
    const focal = focalOf(opts, video);
    const [fx, fy] = focalFractions(focal);
    const frames = video.frames?.pattern && video.frames?.count > 0 ? video.frames : null;
    const live = !!(g && ST && canPlayMotion() && (video.scrubMp4 || frames));
    const stack = el.dataset.beatMode === "stack";
    const cleanups = [];

    /* ---- DOM ---- */
    el.classList.add("vslot", "vslot--scrub");
    if (opts.layout === "hero-panel") el.classList.add("vslot--hero-panel");
    el.style.setProperty("--overlay", String(opts.overlayOpacity ?? 0.5));
    el.style.setProperty("--focal", focal);
    const media = document.createElement("div");
    media.className = "vslot__media";
    media.setAttribute("aria-hidden", "true");
    const overlay = document.createElement("div");
    overlay.className = "vslot__overlay";
    el.prepend(media, overlay);

    let host = media;
    let panel = false;
    let vid = null, canvas = null, ctx = null;

    function render() {
      panel = opts.layout === "hero-panel" && isDesktop();
      el.classList.toggle("vslot--panel", panel);
      media.replaceChildren();
      if (panel) {
        const fill = document.createElement("div");
        fill.className = "vslot__fill";
        fill.append(buildPoster(video, { focal, className: "vslot__poster vslot__poster--blur" }));
        host = document.createElement("div");
        host.className = "vslot__panel";
        host.append(buildPoster(video, { focal }));
        media.append(fill, host);
      } else {
        host = media;
        media.append(buildPoster(video, { focal }));
      }
      if (vid) host.append(vid);
      if (canvas) host.append(canvas);
    }
    render();

    beats.forEach((b, i) => { b.classList.add("vslot__beat"); b.style.setProperty("--beat-i", i); });

    const onLayoutResize = debounce(() => {
      if (opts.layout === "hero-panel" && isDesktop() !== panel) {
        render();
        if (live) { dirty = true; kick(); }
      }
      if (live) sizeCanvas();
    }, 180);
    addEventListener("resize", onLayoutResize);
    addEventListener("orientationchange", onLayoutResize);
    cleanups.push(() => { removeEventListener("resize", onLayoutResize); removeEventListener("orientationchange", onLayoutResize); });

    /* ---- static fallback ---- */
    if (!live) {
      el.classList.add("is-static", "is-poster-only");
      beats.forEach((b) => b.style.setProperty("--beat", "1"));
      const handle = makeHandle(() => {}, () => 1, () => "static");
      return handle;
    }

    /* ---- live scrub ---- */
    g.registerPlugin(ST);
    let progress = 0;
    let smooth = 0;
    let raf = 0;
    let near = false;
    let started = false;
    let useFrames = false;
    let duration = 0;
    let seekT0 = 0;
    let slowSeeks = 0;
    let dirty = true;
    let lastFrame = -1;
    let imgs = null;
    let mediaMode = "video";

    function updateBeats(p) {
      const n = beats.length;
      if (!n) return;
      const seg = 1 / n;
      beats.forEach((b, i) => {
        const local = (p - i * seg) / seg;
        const vin = clamp01(local / 0.3);
        const vout = stack || i === n - 1 ? 1 : clamp01((1 - local) / 0.2);
        const v = Math.min(vin, vout);
        b.style.setProperty("--beat", v.toFixed(3));
        b.classList.toggle("is-active", v > 0.5);
      });
    }

    const st = ST.create({
      trigger: el,
      pin: opts.pinTarget || el,
      pinSpacing: true,
      anticipatePin: 1,
      start: "top top",
      end: () => `+=${Math.round(toPx(opts.scrollLength))}`,
      invalidateOnRefresh: true,
      onUpdate(self) {
        progress = self.progress;
        updateBeats(progress);
        opts.onProgress?.(progress);
        kick();
      },
    });
    progress = st.progress || 0;
    smooth = progress;
    updateBeats(progress);

    function kick() {
      if (!raf && near) raf = requestAnimationFrame(tick);
    }

    let lastTick = 0;
    function tick(now) {
      raf = 0;
      // frame-rate independent lerp (LERP is the per-frame factor at 60fps)
      const dt = lastTick && now - lastTick < 250 ? now - lastTick : 16.7;
      lastTick = now;
      smooth += (progress - smooth) * (1 - Math.pow(1 - LERP, dt / 16.7));
      if (Math.abs(progress - smooth) < 0.0005) smooth = progress;
      let busy = smooth !== progress;
      if (useFrames) drawFrame(smooth);
      else busy = seekVideo(smooth) || busy;
      if (busy) kick();             // media events (loaded, seeked, frame onload, resize) re-kick on their own
    }

    /* video seeking */
    function startVideo() {
      const v = makeVideo([{ src: video.scrubMp4, type: "video/mp4" }], {
        preload: "auto",
        loop: false,
        onFail: () => { if (v === vid) { vid.remove(); vid = null; frames ? startFrames() : giveUp(); } },
      });
      vid = v;
      v.style.objectPosition = focal;
      v.addEventListener("loadedmetadata", () => { duration = v.duration || 0; dirty = true; kick(); });
      v.addEventListener("loadeddata", () => { v.classList.add("is-ready"); kick(); });
      v.addEventListener("seeked", () => {
        const latency = performance.now() - seekT0;
        v.classList.add("is-ready");
        if (v.readyState >= 3 && latency > SLOW_SEEK_MS) slowSeeks++;
        if (slowSeeks >= SLOW_SEEKS_TO_SWITCH && frames && !useFrames) startFrames();
        kick();
      });
      host.append(v);
    }

    /** returns true while a seek is pending (keep ticking) */
    function seekVideo(p) {
      if (!vid || !duration) return false;
      if (vid.seeking) return false;   // "seeked" re-kicks the loop
      const t = p * Math.max(0, duration - 0.04);
      dirty = false;
      if (Math.abs(vid.currentTime - t) > SEEK_EPS) {
        seekT0 = performance.now();
        try { vid.currentTime = t; } catch { /* not seekable yet */ }
        return true;
      }
      return false;
    }

    /* canvas frame sequence */
    function startFrames() {
      useFrames = true;
      mediaMode = "frames";
      if (vid) { const v = vid; vid = null; v.removeAttribute("src"); v.replaceChildren(); v.load?.(); v.remove(); }
      canvas = document.createElement("canvas");
      canvas.className = "vslot__canvas";
      ctx = canvas.getContext("2d");
      host.append(canvas);
      sizeCanvas();
      imgs = new Array(frames.count).fill(null);
      const order = progressiveOrder(frames.count);
      let next = 0;
      let errors = 0;
      const loadNext = () => {
        if (!useFrames || next >= order.length) return;
        const i = order[next++];
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          imgs[i] = img;
          if (!canvas.classList.contains("is-ready")) canvas.classList.add("is-ready");
          dirty = true;
          kick();
          loadNext();
        };
        img.onerror = () => {
          if (++errors >= frames.count) { giveUp(); return; }
          loadNext();
        };
        img.src = frameUrl(frames.pattern, i);
      };
      for (let k = 0; k < 4; k++) loadNext();   // 4 parallel requests
    }

    function sizeCanvas() {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; dirty = true; kick(); }
    }

    function drawFrame(p) {
      if (!imgs || !ctx) return;
      const count = imgs.length;
      const want = Math.round(p * (count - 1));
      let idx = -1;
      for (let d = 0; d < count; d++) {
        if (imgs[want - d]) { idx = want - d; break; }
        if (imgs[want + d]) { idx = want + d; break; }
      }
      if (idx < 0 || (idx === lastFrame && !dirty)) return;
      dirty = false;
      lastFrame = idx;
      const img = imgs[idx];
      const cw = canvas.width, ch = canvas.height;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (cw - dw) * fx, (ch - dh) * fy, dw, dh);
    }

    function giveUp() {
      useFrames = false;
      mediaMode = "static";
      canvas?.remove();
      canvas = null;
      ctx = null;
      el.classList.add("is-poster-only");   // beats keep scrubbing over the poster
    }

    function startMedia() {
      if (started) return;
      started = true;
      if ((isIOS() || !video.scrubMp4) && frames) startFrames();
      else if (video.scrubMp4) startVideo();
    }

    cleanups.push(observeNear(el, (isNear) => {
      near = isNear;
      if (near) { startMedia(); dirty = true; kick(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }));

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => sizeCanvas());
      ro.observe(el);
      cleanups.push(() => ro.disconnect());
    }

    cleanups.push(() => {
      st.kill();
      if (raf) cancelAnimationFrame(raf);
      useFrames = false;
      if (vid) { vid.removeAttribute("src"); vid.replaceChildren(); vid.load?.(); vid.remove(); vid = null; }
    });

    return makeHandle(() => {}, () => progress, () => mediaMode);

    function makeHandle(extraDestroy, getProgress, getMode) {
      const handle = {
        el,
        play() {},
        pause() {},
        progress: getProgress,
        mode: getMode,
        destroy() {
          extraDestroy();
          cleanups.forEach((fn) => fn());
          media.remove();
          overlay.remove();
          beats.forEach((b) => { b.classList.remove("vslot__beat", "is-active"); b.style.removeProperty("--beat"); b.style.removeProperty("--beat-i"); });
          el.classList.remove("vslot", "vslot--scrub", "vslot--panel", "vslot--hero-panel", "is-static", "is-poster-only");
          delete el.__vslot;
        },
      };
      el.__vslot = handle;
      return handle;
    }
  },
};

const noop = { el: null, play() {}, pause() {}, progress: () => 0, mode: () => "static", destroy() {} };
export default VideoScrub;
