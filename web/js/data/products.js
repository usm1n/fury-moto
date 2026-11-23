/**
 * Catalogue data access. The ONLY place that knows where products come from: the public API
 * (GET /api/products, /api/products/{slug}, /facets, /featured, /api/categories, /brands, /certifications).
 *
 * API DTOs are adapted into the shape the storefront components use:
 *   product = { id (= slug), slug, title, brand (slug), brandName, category (slug), categoryName,
 *               price, compareAtPrice, badges[], certifications[] (display names), inStock, sizes[],
 *               images[{ src (4:5 / full), thumb (1:1), alt }],
 *               // detail only:
 *               shortDescription, description, gearDoctorNote, specs{label:value}, certificationDetails[],
 *               colors[{name,hex}], variants[{size,color,colorHex,price,available,lowStock}], related[] }
 * Everything is async and throws ApiError (see ./api.js) when the API is unreachable.
 */
import { config } from "../core/config.js";
import { apiGet } from "./api.js";

export { ApiError } from "./api.js";

/* ---------- adapters ---------- */
const adaptImage = (i) => ({ src: i.url, thumb: i.thumbUrl || i.url, alt: i.alt || "", width: i.width, height: i.height });

export function adaptCard(d) {
  return {
    id: d.slug,
    slug: d.slug,
    title: d.title,
    brand: d.brand?.slug || "",
    brandName: d.brand?.name || "",
    category: d.category?.slug || "",
    categoryName: d.category?.name || "",
    price: d.price,
    compareAtPrice: d.compareAtPrice ?? null,
    badges: d.badges || [],
    certifications: d.certifications || [],
    images: (d.images || []).map(adaptImage),
    inStock: !!d.inStock,
    sizes: d.sizes || [],
  };
}

function adaptDetail(d) {
  const p = adaptCard(d);
  const seen = new Map();
  (d.variants || []).forEach((v) => { if (!seen.has(v.color)) seen.set(v.color, { name: v.color, hex: v.colorHex || "#777777" }); });
  return {
    ...p,
    shortDescription: d.shortDescription || "",
    description: d.description || "",
    gearDoctorNote: d.gearDoctorNote || "",
    specs: Object.fromEntries((d.specs || []).map((s) => [s.label, s.value])),
    certificationDetails: d.certificationDetails || [],
    colors: [...seen.values()].filter((c) => c.name),
    variants: d.variants || [],
    related: (d.related || []).map(adaptCard),
  };
}

/* ---------- reference data (cached by apiGet) ---------- */
export async function getCategories() {
  const design = config.categoryTiles || {};
  return (await apiGet("/api/categories")).map((c) => ({
    id: c.slug, title: c.name, image: c.imageUrl || "", count: c.productCount ?? 0,
    ...(design[c.slug] || {}),               // videoSlot / videoStart (design-only, see site.config.js)
  }));
}
export async function getBrands() {
  return (await apiGet("/api/brands")).map((b) => ({ id: b.slug, name: b.name, logo: b.logoUrl || "" }));
}
export async function getCertifications() {
  return (await apiGet("/api/certifications")).map((c) => ({ code: c.code, name: c.name, description: c.description || "" }));
}

/* ---------- products ---------- */
/**
 * @param {{cat?:string, brand?:string[], size?:string[], cert?:string[], min?:number|string, max?:number|string, q?:string, sort?:string, inStock?:boolean, page?:number, pageSize?:number}} [f]
 * @returns {Promise<{items:object[], total:number, page:number, pageSize:number}>}
 */
export async function getProducts(f = {}) {
  let certCodes = f.cert;
  if (f.cert?.length) {
    // The shop URL carries cert display names ("ECE 22.06"); the API wants codes ("ECE_22_06").
    const certs = await getCertifications().catch(() => []);
    certCodes = f.cert.map((c) => certs.find((x) => x.name === c || x.code === c)?.code || c);
  }
  const page = await apiGet("/api/products", {
    category: f.cat, brand: f.brand, size: f.size, cert: certCodes,
    minPrice: f.min, maxPrice: f.max, inStock: f.inStock ? "true" : "",
    q: f.q, sort: f.sort && f.sort !== "featured" ? f.sort : "", page: f.page > 1 ? f.page : "", pageSize: f.pageSize,
  });
  return { items: (page.items || []).map(adaptCard), total: page.total ?? 0, page: page.page ?? 1, pageSize: page.pageSize ?? 24 };
}

/** @returns product detail or null when the slug is unknown (404). Other errors throw. */
export async function getProduct(slug) {
  if (!slug) return null;
  try {
    return adaptDetail(await apiGet(`/api/products/${encodeURIComponent(slug)}`));
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function searchProducts(q, limit = 8) {
  return (await getProducts({ q, pageSize: limit })).items;
}

/** Related products come with the detail DTO. */
export async function getRelated(product, limit = 4) {
  if (!product) return [];
  if (product.related) return product.related.slice(0, limit);
  return (await getProduct(product.slug))?.related?.slice(0, limit) || [];
}

export async function getFeatured() {
  return (await apiGet("/api/products/featured")).map(adaptCard);
}

/** Filter options for the shop sidebar. certifications are display names (what the shop URL carries). */
export async function getFacets(cat) {
  const d = await apiGet("/api/products/facets", { category: cat });
  return {
    brands: (d.brands || []).map((b) => b.slug),
    brandNames: Object.fromEntries((d.brands || []).map((b) => [b.slug, b.name])),
    sizes: d.sizes || [],
    certifications: (d.certifications || []).map((c) => c.name),
    minPrice: d.minPrice || 0,
    maxPrice: d.maxPrice || 0,
  };
}

export { getSettings } from "./settings.js";
