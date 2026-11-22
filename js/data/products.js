/**
 * Product data access. The ONLY place that knows where products come from.
 * Today: site.config.js. Later: swap the bodies for fetch() calls to an API —
 * keep the signatures (all async) and nothing else in the site changes.
 */
import { config } from "../core/config.js";

const all = () => config.products || [];

/** @param {{cat?:string, brand?:string[], size?:string[], cert?:string[], min?:number, max?:number, q?:string, sort?:string, inStock?:boolean}} [f] */
export async function getProducts(f = {}) {
  let list = all().slice();
  if (f.cat) list = list.filter((p) => p.category === f.cat);
  if (f.brand?.length) list = list.filter((p) => f.brand.includes(p.brand));
  if (f.size?.length) list = list.filter((p) => (p.sizes || []).some((s) => f.size.includes(s)));
  if (f.cert?.length) list = list.filter((p) => (p.certifications || []).some((c) => f.cert.includes(c)));
  if (f.min != null && f.min !== "") list = list.filter((p) => p.price >= Number(f.min));
  if (f.max != null && f.max !== "") list = list.filter((p) => p.price <= Number(f.max));
  if (f.inStock) list = list.filter((p) => p.inStock);
  if (f.q) list = searchIn(list, f.q);
  return sortProducts(list, f.sort);
}

export async function getProduct(id) {
  return all().find((p) => p.id === id) || null;
}

export async function searchProducts(q, limit = 8) {
  return searchIn(all(), q).slice(0, limit);
}

export async function getRelated(product, limit = 4) {
  if (!product) return [];
  const others = all().filter((p) => p.id !== product.id);
  const same = others.filter((p) => p.category === product.category);
  const rest = others.filter((p) => p.category !== product.category);
  return [...same, ...rest].slice(0, limit);
}

/** Facet values present in the catalogue (for building filter UIs). */
export async function getFacets(cat) {
  const list = cat ? all().filter((p) => p.category === cat) : all();
  const uniq = (arr) => [...new Set(arr)];
  const prices = list.map((p) => p.price);
  return {
    brands: uniq(list.map((p) => p.brand)),
    sizes: uniq(list.flatMap((p) => p.sizes || [])),
    certifications: uniq(list.flatMap((p) => p.certifications || [])),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
}

function searchIn(list, q) {
  const terms = String(q).toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  const cats = Object.fromEntries((config.categories || []).map((c) => [c.id, c.title]));
  const brands = Object.fromEntries((config.brands || []).map((b) => [b.id, b.name]));
  return list.filter((p) => {
    const hay = [p.title, p.brand, brands[p.brand], p.category, cats[p.category]].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function sortProducts(list, sort) {
  const l = list.slice();
  switch (sort) {
    case "price-asc": return l.sort((a, b) => a.price - b.price);
    case "price-desc": return l.sort((a, b) => b.price - a.price);
    case "name": return l.sort((a, b) => a.title.localeCompare(b.title));
    case "new": return l.sort((a, b) => (b.badges || []).includes("New") - (a.badges || []).includes("New"));
    default: return l; // "featured" = config order
  }
}
