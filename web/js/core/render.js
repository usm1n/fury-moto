/**
 * Rendering helpers. All config text goes through esc() unless explicitly trusted.
 *
 *   html`<p>${value}</p>`            -> escaped string (arrays are joined, raw() passes through)
 *   renderTemplate(el, string)       -> sets innerHTML, marks placeholders
 *   renderList(el, items, itemFn)    -> renders itemFn(item, i) for each item
 *   text(el, value)                  -> sets textContent, marks placeholders
 *   fill(root, obj)                  -> fills [data-bind="path.to.value"] inside root from obj
 */
import { markPlaceholders, isPlaceholder } from "./config.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("");
      else if (v === false || v == null) out += "";
      else out += esc(v);
    }
  });
  return raw(out);
}

export function renderTemplate(el, markup) {
  if (!el) return;
  el.innerHTML = String(markup);
  markPlaceholders(el);
}

export function renderList(el, items = [], itemFn, empty = "") {
  if (!el) return;
  const out = items.length ? items.map((it, i) => String(itemFn(it, i))).join("") : String(empty);
  renderTemplate(el, out);
}

export function text(el, value) {
  if (!el) return;
  el.textContent = value ?? "";
  if (isPlaceholder(value)) el.classList.add("is-placeholder");
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/** Fill every [data-bind="a.b.c"] in root with get(obj, "a.b.c"). [data-bind-attr="href:a.b"] sets attributes. */
export function fill(root, obj) {
  root.querySelectorAll("[data-bind]").forEach((el) => text(el, get(obj, el.dataset.bind)));
  root.querySelectorAll("[data-bind-attr]").forEach((el) => {
    el.dataset.bindAttr.split(";").forEach((pair) => {
      const [attr, path] = pair.split(":").map((s) => s.trim());
      const v = get(obj, path);
      if (v != null) el.setAttribute(attr, v);
    });
  });
}

/** Responsive <picture> for an image path. Emits webp + jpg srcset if `srcset` sizes exist (media pipeline naming: name-800.webp). */
export function picture({ src, alt = "", sizes = "100vw", widths = null, className = "", loading = "lazy", ratio = null }) {
  const style = ratio ? ` style="aspect-ratio:${esc(ratio)}"` : "";
  if (widths && /\.(webp|jpe?g|png)$/i.test(src)) {
    const base = src.replace(/\.(webp|jpe?g|png)$/i, "");
    const set = (ext) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
    return raw(
      `<picture class="${esc(className)}"${style}><source type="image/webp" srcset="${esc(set("webp"))}" sizes="${esc(sizes)}">` +
      `<img src="${esc(base)}-${widths[widths.length - 1]}.jpg" srcset="${esc(set("jpg"))}" sizes="${esc(sizes)}" alt="${esc(alt)}" loading="${loading}" decoding="async"></picture>`
    );
  }
  return raw(`<img class="${esc(className)}"${style} src="${esc(src)}" alt="${esc(alt)}" loading="${loading}" decoding="async">`);
}
