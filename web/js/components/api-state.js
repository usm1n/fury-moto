/**
 * Shared loading / error states for API-backed regions.
 *   skeletonCards(n)            -> HTML string of n .pcard--skeleton cards (same box as a real card)
 *   showError(el, err, retry)   -> friendly error block with a Retry button (calls retry())
 *   isApiDown(err)              -> true for network failures and 5xx
 */
import { config } from "../core/config.js";
import { esc } from "../core/render.js";

export const isApiDown = (e) => !!e && (e.isNetwork === true || e.status === 0 || e.status >= 500);

export function skeletonCards(n = 8) {
  const card = `<article class="pcard pcard--skeleton" aria-hidden="true">
    <div class="pcard__frame"><div class="pcard__media"><span class="skeleton"></span></div></div>
    <div class="pcard__body"><span class="skeleton skeleton--line w-40"></span><span class="skeleton skeleton--line w-90"></span><span class="skeleton skeleton--line w-60"></span></div></article>`;
  return Array.from({ length: n }, () => card).join("");
}

export function errorMarkup(err) {
  const ui = config.ui || {};
  const down = isApiDown(err);
  return `<div class="api-error" role="alert"><h2>${esc(down ? ui.apiErrorTitle : ui.apiErrorOtherTitle)}</h2>
    <p class="muted">${esc(down ? ui.apiErrorText : (err?.detail || ui.apiErrorOtherText))}</p>
    <button class="btn btn--primary" type="button" data-api-retry>${esc(ui.retry)}</button></div>`;
}

export function showError(el, err, retry) {
  if (!el) return;
  el.innerHTML = errorMarkup(err);
  el.querySelector("[data-api-retry]")?.addEventListener("click", () => retry?.());
}
