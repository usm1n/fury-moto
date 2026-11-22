/**
 * Tiny event bus. Events (see docs/CONTRACTS.md):
 *   "cart:add"      detail { productId, size, color, qty }
 *   "cart:change"   detail { items, count, subtotal }
 *   "cart:open" / "cart:close"
 *   "filter:change" detail { cat, brand[], size[], cert[], min, max, sort, q }
 *   "search:open" / "search:close"
 *   "video:play" / "video:pause"  detail { el }
 */
const target = new EventTarget();

export function on(type, handler) {
  const fn = (e) => handler(e.detail, e);
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}

export function emit(type, detail = {}) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export default { on, emit };
