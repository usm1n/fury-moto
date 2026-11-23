/**
 * Size guide modal. openSizeGuide(categoryId, openerEl, productTitle)
 * Focus trap, ESC / backdrop closes, focus returns to the opener.
 */
import { config, waLink } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { getSettings } from "../data/settings.js";

let current = null;

export function openSizeGuide(categoryId, opener, productTitle = "") {
  if (current) current.close();
  const ui = config.ui || {};
  const g = (config.sizeGuides || {})[categoryId];
  const msg = String(ui.pdSizingMessage || "").replace("{title}", productTitle);
  const table = g && g.columns?.length
    ? html`<div class="sg__table-wrap" tabindex="0" role="region" aria-label="${ui.pdSizeGuideTitle}"><table>
        <thead><tr>${g.columns.map((c) => html`<th scope="col">${c}</th>`)}</tr></thead>
        <tbody>${(g.rows || []).map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody>
      </table></div>`
    : html`<p class="sg__note">${ui.pdSizeGuideEmpty}</p>`;

  const root = document.createElement("div");
  root.className = "sg";
  renderTemplate(root, html`
    <div class="sg__panel" role="dialog" aria-modal="true" aria-labelledby="sg-title">
      <div class="sg__head">
        <h2 id="sg-title">${ui.pdSizeGuideTitle}${productTitle ? html`<span class="sg__sub">${productTitle}</span>` : raw("")}</h2>
        <button type="button" class="sg__close" aria-label="${ui.close}">&times;</button>
      </div>
      ${g?.note ? html`<p class="sg__note">${g.note}</p>` : raw("")}
      ${table}
      <a class="btn btn--primary btn--block" href="${waLink(msg)}" target="_blank" rel="noopener">${ui.askSizing}</a>
    </div>`);
  document.body.appendChild(root);
  getSettings().then((s) => { const a = root.querySelector(".sg__panel .btn"); if (a && s.whatsapp) a.href = waLink(msg, s.whatsapp); });
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const panel = root.querySelector(".sg__panel");
  const closeBtn = root.querySelector(".sg__close");

  const focusables = () => [...panel.querySelectorAll("a[href],button,[tabindex]:not([tabindex='-1'])")].filter((e) => !e.disabled);
  function close() {
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    document.documentElement.style.overflow = prevOverflow;
    current = null;
    if (opener && document.contains(opener)) opener.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
  closeBtn.addEventListener("click", close);
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  document.addEventListener("keydown", onKey, true);
  closeBtn.focus();
  current = { close };
  return current;
}

export default openSizeGuide;
