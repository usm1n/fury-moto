/**
 * Config loader. Import `config` from here (not from site.config.js directly) so
 * theme + devMode are applied exactly once.
 *
 *   import { config, applyTheme, isPlaceholder, markPlaceholders, formatPrice, waLink } from "./core/config.js";
 */
import config from "../site.config.js";

export { config };

export const PLACEHOLDER_RE = /\[PLACEHOLDER/i;
export const isPlaceholder = (v) => typeof v === "string" && PLACEHOLDER_RE.test(v);

let applied = false;
export function applyTheme() {
  if (applied) return;
  applied = true;
  const root = document.documentElement;
  const { colors = {}, fonts = {}, radius, grain } = config.theme || {};
  Object.entries(colors).forEach(([k, v]) => root.style.setProperty(`--color-${k}`, v));
  if (fonts.display) root.style.setProperty("--font-display", `"${fonts.display}", "Impact", "Arial Narrow", sans-serif`);
  if (fonts.body) root.style.setProperty("--font-body", `"${fonts.body}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`);
  if (radius) root.style.setProperty("--radius", radius);
  // overlay rgb triplet from bg colour
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(colors.bg || "");
  if (m) root.style.setProperty("--color-overlay", m.slice(1).map((h) => parseInt(h, 16)).join(", "));
  root.classList.toggle("has-grain", !!grain);
  root.classList.toggle("dev-mode", !!config.devMode);
  root.classList.add("js");
  loadFonts([fonts.display, fonts.body].filter(Boolean));
}

function loadFonts(families) {
  if (!families.length) return;
  // Single-weight display faces (Anton, Bebas Neue…) reject a weight range, so only the body font asks for one.
  const SINGLE_WEIGHT = /^(Anton|Bebas Neue|Oswald Bold)$/i;
  const q = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}${SINGLE_WEIGHT.test(f) ? "" : ":wght@400;500;600;700"}`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${q}&display=swap`;
  // Pages ship a static <link data-theme-fonts> for the default fonts so text renders early.
  // Only touch it if config.theme.fonts was changed to something else.
  const existing = document.querySelector("link[data-theme-fonts]");
  if (existing) { if (existing.href !== href) existing.href = href; return; }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.themeFonts = "";
  document.head.appendChild(link);
}

/** Add .is-placeholder to any element inside root whose own text contains [PLACEHOLDER. */
export function markPlaceholders(root = document.body) {
  if (!config.devMode || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (PLACEHOLDER_RE.test(n.nodeValue) && n.parentElement) n.parentElement.classList.add("is-placeholder");
  }
  root.querySelectorAll?.("[href*='PLACEHOLDER'], [src*='PLACEHOLDER'], [alt*='PLACEHOLDER']").forEach((el) => el.classList.add("is-placeholder"));
}

/** Console report of every placeholder value still in config (devMode only). */
export function reportPlaceholders() {
  if (!config.devMode) return;
  const found = [];
  const walk = (v, path) => {
    if (isPlaceholder(v)) found.push(`${path}: ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k));
  };
  walk(config, "");
  if (found.length) console.info(`[devMode] ${found.length} placeholders left in site.config.js:\n` + found.join("\n"));
}

const nf = new Intl.NumberFormat(config.store?.locale || "en-PK", { maximumFractionDigits: 0 });
export const formatPrice = (n) => `${config.store?.currencySymbol || "Rs"} ${nf.format(Number(n) || 0)}`;

/** wa.me link with pre-filled message. Returns "#" if the number is still a placeholder. */
export function waLink(message = "") {
  // Never pull digits out of a "[PLACEHOLDER: … e.g. 923001234567]" string — that would message a stranger.
  const rawNum = config.store?.whatsapp;
  const num = isPlaceholder(rawNum) ? "" : String(rawNum || "").replace(/\D/g, "");
  const base = num ? `https://wa.me/${num}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const getVideo = (id) => (config.videos || []).find((v) => v.id === id) || null;
export const getSlot = (section) => (config.videoSlots || []).find((s) => s.section === section) || null;
export const getCategory = (id) => (config.categories || []).find((c) => c.id === id) || null;
export const getBrand = (id) => (config.brands || []).find((b) => b.id === id || b.name === id) || null;
export const getGuide = (id) => (config.guides || []).find((g) => g.id === id) || null;
