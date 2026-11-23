/**
 * Cart state. Persists to localStorage (try/catch) with in-memory fallback.
 *
 * A line is { slug, size, color, qty, title, thumbUrl, unitPrice, status, available }.
 *  - slug/size/color/qty are what the shopper chose; the rest is a display snapshot that
 *    validate() refreshes from the API ("server truth"). Line key = slug|size|color.
 *  - status: ok | price-changed | reduced | sold-out | unavailable (from POST /api/cart/validate).
 *    sold-out / unavailable lines are KEPT in the cart but marked and excluded from totals;
 *    the shopper removes them (checkout is blocked until they do). `reduced` sets qty to
 *    what is available, `price-changed` just updates the snapshot price.
 *  - Totals: subtotal/deliveryFee/total come from the last validate response; between
 *    validations they are recomputed locally (and a debounced validate follows qty changes).
 *
 *   import cart from "../data/cart.js";
 *   cart.add({ slug, size, color, qty, title, thumbUrl, price });  cart.setQty(key, n);  cart.remove(key);
 *   await cart.validate() -> { ok, changes: [string] }  (also emits "cart:notice" { changes } when non-empty)
 *   cart.applyServer(cartValidation) -> changes[]       (used for the 409 /problems/cart-changed body)
 *   cart.items() / cart.summary() -> { items, count, subtotal, deliveryFee, total, blocked, validated }
 *
 * Emits "cart:change" on every mutation. Listens to "cart:add" so any component can add
 * without importing this file.
 */
import { config, formatPrice } from "../core/config.js";
import { on, emit } from "../core/bus.js";
import { apiPost } from "./api.js";

const KEY = "gd-cart-v1";
const MAX_QTY = 10; // API limit per line
const ui = () => config.ui || {};

let memory = [];
let fee = null; // delivery fee from the API (null = not known yet)
let validated = false;
let inflight = null;
let timer = 0;

/* ---------- storage ---------- */
function normalise(l) {
  if (!l || typeof l !== "object") return null;
  const slug = l.slug || l.productId; // v1 lines used productId; seeded slugs equal the old ids
  if (!slug) return null;
  return {
    slug: String(slug),
    size: l.size || "",
    color: l.color || "",
    qty: Math.max(1, Math.min(MAX_QTY, l.qty | 0 || 1)),
    title: l.title || "",
    thumbUrl: l.thumbUrl || "",
    unitPrice: Number.isFinite(l.unitPrice) ? l.unitPrice : null,
    status: l.status || "ok",
    available: Number.isFinite(l.available) ? l.available : null,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) { memory = arr.map(normalise).filter(Boolean); return memory; }
    }
  } catch {}
  return memory;
}
function save(lines) {
  memory = lines;
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  emit("cart:change", summary());
}

export const keyOf = (l) => [l.slug, l.size || "", l.color || ""].join("|");
/** Single place that knows the product page URL for a slug. */
export const productHref = (slug) => `product.html?id=${encodeURIComponent(slug)}`;
const purchasable = (l) => l.status !== "sold-out" && l.status !== "unavailable";

/* ---------- reads ---------- */
export function items() {
  return load().map((l) => ({ ...l, key: keyOf(l), lineTotal: (l.unitPrice || 0) * l.qty, purchasable: purchasable(l) }));
}

export function summary() {
  const list = items();
  const live = list.filter((l) => l.purchasable);
  const subtotal = live.reduce((n, l) => n + l.lineTotal, 0);
  const deliveryFee = subtotal > 0 ? fee : 0;
  return {
    items: list,
    count: list.reduce((n, l) => n + l.qty, 0),
    subtotal,
    deliveryFee,                       // null until the API has told us
    total: subtotal + (deliveryFee || 0),
    blocked: list.some((l) => !l.purchasable),
    validated,
  };
}

/* ---------- mutations ---------- */
export function add({ slug, productId, size = "", color = "", qty = 1, title = "", thumbUrl = "", price = null }) {
  const s = slug || productId;
  if (!s) return;
  const lines = load();
  const k = keyOf({ slug: s, size: size || "", color: color || "" });
  const hit = lines.find((l) => keyOf(l) === k);
  if (hit) {
    hit.qty = Math.min(MAX_QTY, hit.qty + qty);
    if (title && !hit.title) hit.title = title;
    if (thumbUrl && !hit.thumbUrl) hit.thumbUrl = thumbUrl;
  } else {
    lines.push(normalise({ slug: s, size, color, qty, title, thumbUrl, unitPrice: price }));
  }
  validated = false;
  save(lines);
  // Missing snapshot (older add paths) → fill it from the API.
  if (lines.some((l) => !l.title || l.unitPrice == null)) validateSoon(0);
}
export function setQty(key, qty) {
  save(load().map((l) => (keyOf(l) === key ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty | 0)) } : l)));
  validateSoon();
}
export function remove(key) { save(load().filter((l) => keyOf(l) !== key)); validateSoon(); }
export function clear() { fee = null; validated = false; save([]); }

/* ---------- server truth ---------- */
const fmt = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));

/** Merge a CartValidation (validate response, or `cart` on a 409) into the stored lines. Returns change messages. */
export function applyServer(v) {
  if (!v || !Array.isArray(v.lines)) return [];
  const changes = [];
  const byKey = new Map(v.lines.map((r) => [keyOf(r), r]));
  const lines = load().map((l) => {
    const r = byKey.get(keyOf(l));
    if (!r) return l;
    const next = { ...l };
    const title = r.title || l.title || l.slug;
    const old = l.unitPrice;
    if (r.status !== "unavailable" || r.unitPrice) next.unitPrice = r.unitPrice || l.unitPrice;
    if (r.title) next.title = r.title;
    if (r.thumbUrl) next.thumbUrl = r.thumbUrl;
    next.available = r.available;
    next.status = r.status === "price-changed" ? "ok" : r.status;
    if (old != null && next.unitPrice != null && old !== next.unitPrice && purchasable(next)) {
      changes.push(fmt(ui().chgPrice, { title, from: formatPrice(old), to: formatPrice(next.unitPrice) }));
    }
    if (r.status === "reduced") {
      if (next.qty > r.available) next.qty = r.available;
      changes.push(fmt(ui().chgReduced, { title, n: r.available }));
    } else if (r.status === "sold-out" && l.status !== "sold-out") changes.push(fmt(ui().chgSoldOut, { title }));
    else if (r.status === "unavailable" && l.status !== "unavailable") changes.push(fmt(ui().chgUnavailable, { title }));
    return next;
  });
  if (typeof v.deliveryFee === "number") fee = v.deliveryFee;
  validated = true;
  save(lines);
  return changes;
}

/**
 * POST /api/cart/validate. Safe to call often (concurrent calls share one request).
 * Resolves { ok, changes, error? }; never rejects. Emits "cart:notice" when something changed.
 */
export function validate() {
  clearTimeout(timer);
  if (inflight) return inflight;
  const lines = load();
  if (!lines.length) { fee = null; validated = true; return Promise.resolve({ ok: true, changes: [] }); }
  inflight = (async () => {
    try {
      const res = await apiPost("/api/cart/validate", {
        lines: lines.map((l) => ({ slug: l.slug, size: l.size, color: l.color, quantity: l.qty })),
      });
      const changes = applyServer(res);
      if (changes.length) emit("cart:notice", { changes });
      return { ok: true, changes };
    } catch (error) {
      return { ok: false, changes: [], error };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
function validateSoon(ms = 450) {
  clearTimeout(timer);
  timer = setTimeout(() => { validate(); }, ms);
}

/** Local fallback only (the real WhatsApp text now comes from POST /api/orders). */
export function orderMessage() {
  const { items: list, total } = summary();
  const rows = list.filter((l) => l.purchasable).map((l, i) =>
    `${i + 1}. ${l.title}${l.size ? ` — Size ${l.size}` : ""}${l.color ? ` — ${l.color}` : ""} × ${l.qty} = ${formatPrice(l.lineTotal)}`);
  return [`Hi ${config.store?.shortName || ""}! I'd like to order:`, "", ...rows, "", `Total: ${formatPrice(total)}`].join("\n");
}

on("cart:add", (d) => add(d));

export default { items, summary, add, setQty, remove, clear, validate, applyServer, orderMessage, keyOf, productHref };
