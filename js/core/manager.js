/**
 * Shared video manager: environment checks + global play budget.  [API FROZEN — Phase 1]
 * Owned by the Video-engine agent (may extend internals, must keep exports).
 *
 *   canPlayMotion()          -> false if reduced-motion, Save-Data or 2g
 *   requestPlay(video, prio) -> true if allowed to play; may pause the lowest-priority player (max 2)
 *   release(video)           -> call when a video pauses/leaves viewport
 *   isDesktop()              -> matchMedia("(min-width: 900px) and (orientation: landscape)")
 *
 * Extensions (Phase 2):
 *   requestPlay(video, prio, onEvict)  -> onEvict() is called if a higher-priority player later takes the slot
 *   waitForSlot(video, prio, retry)    -> retry() is called (highest priority first) when a slot frees up
 *   cancelWait(video)
 *   PRIORITY                           -> shared priority scale used by the engine
 *   isIOS(), hoverCapable()
 *
 * The budget counts *players*: a hero-panel's blurred fill loop is a companion of the
 * hero's main video and plays/pauses with it, so it does not take a second slot.
 * Scrub sections never call play() (they only seek), so they are not counted.
 */
export const MAX_PLAYING = 2;

export const PRIORITY = { footer: 0, background: 30, card: 60, inline: 80, hero: 100 };

const playing = new Map(); // video -> { priority, onEvict }
const waiters = new Map(); // video -> { priority, retry }
let flushQueued = false;

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function saveData() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
}

export const canPlayMotion = () => !prefersReducedMotion() && !saveData();

export const isDesktop = () => window.matchMedia("(min-width: 900px) and (orientation: landscape)").matches;

export const hoverCapable = () => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;

export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function requestPlay(video, priority = 0, onEvict) {
  if (playing.has(video)) {
    const e = playing.get(video);
    e.priority = priority;
    if (onEvict) e.onEvict = onEvict;
    return true;
  }
  if (playing.size >= MAX_PLAYING) {
    let low = null;
    for (const [v, e] of playing) if (!low || e.priority < playing.get(low).priority) low = v;
    // strictly lower priority is evicted; equal priority waits its turn (no ping-pong)
    if (low && playing.get(low).priority < priority) {
      const evicted = playing.get(low);
      playing.delete(low);
      try { low.pause(); } catch { /* detached */ }
      evicted.onEvict?.();
    } else {
      return false;
    }
  }
  playing.set(video, { priority, onEvict });
  waiters.delete(video);
  return true;
}

export function release(video) {
  waiters.delete(video);
  if (playing.delete(video)) queueFlush();
}

export function waitForSlot(video, priority, retry) {
  if (playing.has(video)) return;
  waiters.set(video, { priority, retry });
  if (playing.size < MAX_PLAYING) queueFlush();
}

export function cancelWait(video) { waiters.delete(video); }

function queueFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const order = [...waiters.entries()].sort((a, b) => b[1].priority - a[1].priority);
    for (const [v, w] of order) {
      if (playing.size >= MAX_PLAYING) break;
      waiters.delete(v);
      w.retry();
    }
  });
}

export const playingCount = () => playing.size;
