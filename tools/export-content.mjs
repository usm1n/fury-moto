// One-off export of storefront content (guides, FAQs, testimonials) from web/js/site.config.js
// to the API seed file api/src/GearDoctor.Infrastructure/Seed/content.json (Phase 4).
// Usage: node tools/export-content.mjs   (run before the content is removed from the config)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(ROOT, "web", "js", "site.config.js"), "utf8");
const { default: config } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const guides = (config.guides || []).map((g, i) => ({
  slug: g.id, title: g.title, type: g.type, excerpt: g.excerpt, body: g.body,
  coverKey: g.cover ?? null, video: g.video ?? null, source: g.source ?? null,
  relatedProductSlugs: g.relatedProducts ?? [], sortOrder: i, isPublished: true,
}));
const faqs = (config.faqs || []).map((f, i) => ({ q: f.q, a: f.a, sortOrder: i, isPublished: true }));
const testimonials = (config.testimonials || []).map((t, i) => ({
  name: t.name, bike: t.bike ?? null, quote: t.quote, rating: t.rating ?? 5, sortOrder: i, isPublished: true,
}));
if (!guides.length) { console.error("export-content: no guides in config (already exported?)"); process.exit(1); }
const out = join(ROOT, "api", "src", "GearDoctor.Infrastructure", "Seed", "content.json");
writeFileSync(out, JSON.stringify({ guides, faqs, testimonials }, null, 2) + "\n");
console.log(`wrote ${out}: ${guides.length} guides, ${faqs.length} faqs, ${testimonials.length} testimonials`);
