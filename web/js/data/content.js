/**
 * Editorial content from the API: guides, FAQs, testimonials (no config fallback; the content lives in the DB).
 *   getGuides()        -> [{ id (= slug), slug, title, type, excerpt, cover, video, source }]   (no body)
 *   getGuide(slug)     -> guide + { body (Markdown), relatedProducts[] (product cards) } or null when unknown (404)
 *   getFaqs()          -> [{ q, a }]
 *   getTestimonials()  -> [{ name, bike, quote, rating }]
 * All throw ApiError (see ./api.js) when the API is unreachable; callers show the error/retry state or hide quietly.
 */
import { apiGet } from "./api.js";
import { adaptCard } from "./products.js";

const adaptGuide = (d) => ({
  id: d.slug,
  slug: d.slug,
  title: d.title || "",
  type: d.type || "",
  excerpt: d.excerpt || "",
  cover: d.coverUrl || "",
  video: d.video || null,
  source: d.source || "",
  updatedAt: d.updatedAt || "",
  body: d.body || "",
  relatedProducts: (d.relatedProducts || []).map(adaptCard),
});

export async function getGuides() {
  return ((await apiGet("/api/content/guides")) || []).map(adaptGuide);
}

export async function getGuide(slug) {
  if (!slug) return null;
  try {
    return adaptGuide(await apiGet(`/api/content/guides/${encodeURIComponent(slug)}`));
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function getFaqs() {
  return ((await apiGet("/api/content/faqs")) || []).map((f) => ({ q: f.q || "", a: f.a || "" }));
}

export async function getTestimonials() {
  return ((await apiGet("/api/content/testimonials")) || []).map((t) => ({
    name: t.name || "", bike: t.bike || "", quote: t.quote || "", rating: Math.min(5, Math.max(1, Number(t.rating) || 5)),
  }));
}
