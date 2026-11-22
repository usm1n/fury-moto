/**
 * Cart state. Persists to localStorage (try/catch) with in-memory fallback.
 * Line key = productId + size + color. Emits "cart:change" on every mutation.
 * Listens to "cart:add" so any component can add without importing this file.
 *
 *   import cart from "../data/cart.js";
 *   cart.add({ productId, size, color, qty }); cart.setQty(key, n); cart.remove(key);
 *   cart.items() -> [{ key, productId, size, color, qty, product, lineTotal }]
 */
import { config, formatPrice } from "../core/config.js";
import { on, emit } from "../core/bus.js";

const KEY = "gd-cart-v1";
let memory = [];

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch {}
  return memory;
}
function save(lines) {
  memory = lines;
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  emit("cart:change", summary());
}

const product = (id) => (config.products || []).find((p) => p.id === id);
const keyOf = (l) => [l.productId, l.size || "", l.color || ""].join("|");

export function items() {
  return load()
    .map((l) => ({ ...l, key: keyOf(l), product: product(l.productId) }))
    .filter((l) => l.product)
    .map((l) => ({ ...l, lineTotal: l.product.price * l.qty }));
}

export function summary() {
  const list = items();
  return { items: list, count: list.reduce((n, l) => n + l.qty, 0), subtotal: list.reduce((n, l) => n + l.lineTotal, 0) };
}

export function add({ productId, size = "", color = "", qty = 1 }) {
  const lines = load();
  const k = keyOf({ productId, size, color });
  const hit = lines.find((l) => keyOf(l) === k);
  if (hit) hit.qty += qty; else lines.push({ productId, size, color, qty });
  save(lines);
}
export function setQty(key, qty) {
  const lines = load().map((l) => (keyOf(l) === key ? { ...l, qty: Math.max(1, Math.min(99, qty | 0)) } : l));
  save(lines);
}
export function remove(key) { save(load().filter((l) => keyOf(l) !== key)); }
export function clear() { save([]); }

/** Pre-filled WhatsApp order message (section 5 of the brief). */
export function orderMessage() {
  const { items: list, subtotal } = summary();
  const lines = list.map((l, i) =>
    `${i + 1}. ${l.product.title}${l.size ? ` — Size ${l.size}` : ""}${l.color ? ` — ${l.color}` : ""} × ${l.qty} = ${formatPrice(l.lineTotal)}`);
  return [
    `Hi ${config.store?.shortName || ""}! I'd like to order:`,
    "",
    ...lines,
    "",
    `Total: ${formatPrice(subtotal)} (${config.store?.currency || "PKR"})`,
    config.store?.cashOnDelivery ? "Payment: Cash on delivery" : "",
    "",
    "Name: ",
    "City / address: ",
  ].filter((s, i, a) => !(s === "" && a[i - 1] === "")).join("\n");
}

on("cart:add", (d) => add(d));

export default { items, summary, add, setQty, remove, clear, orderMessage };
