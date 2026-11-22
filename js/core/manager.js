/**
 * Shared video manager: environment checks + global play budget.  [API FROZEN — Phase 1]
 * Owned by the Video-engine agent (may extend internals, must keep exports).
 *
 *   canPlayMotion()          -> false if reduced-motion, Save-Data or 2g
 *   requestPlay(video, prio) -> true if allowed to play; may pause the lowest-priority player (max 2)
 *   release(video)           -> call when a video pauses/leaves viewport
 *   isDesktop()              -> matchMedia("(min-width: 900px) and (orientation: landscape)")
 */
export const MAX_PLAYING = 2;
const playing = new Map(); // video -> priority

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function saveData() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
}

export const canPlayMotion = () => !prefersReducedMotion() && !saveData();

export const isDesktop = () => window.matchMedia("(min-width: 900px) and (orientation: landscape)").matches;

export function requestPlay(video, priority = 0) {
  if (playing.has(video)) return true;
  if (playing.size >= MAX_PLAYING) {
    let low = null;
    for (const [v, p] of playing) if (!low || p < playing.get(low)) low = v;
    if (low && playing.get(low) <= priority) { low.pause(); playing.delete(low); }
    else return false;
  }
  playing.set(video, priority);
  return true;
}

export function release(video) { playing.delete(video); }

export const playingCount = () => playing.size;
