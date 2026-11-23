// Exports the storefront catalog (web/js/site.config.js) to the API seed file.
// Usage: node tools/export-seed.mjs
// Output: api/src/GearDoctor.Infrastructure/Seed/catalog.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const CONFIG_PATH = join(WEB, "js", "site.config.js");
const OUT_PATH = join(ROOT, "api", "src", "GearDoctor.Infrastructure", "Seed", "catalog.json");

// site.config.js is an ES module with no package.json "type" in web/, so load it via a data: URL.
const source = readFileSync(CONFIG_PATH, "utf8");
const { default: config } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const CERT_CODES = {
  "DOT": "DOT",
  "ECE 22.06": "ECE_22_06",
  "FIM": "FIM",
  "SNELL": "SNELL",
  "CE Level 1": "CE_L1",
  "CE Level 2": "CE_L2",
};

const fail = (msg) => { console.error("export-seed: " + msg); process.exit(1); };

const categorySlugs = new Set(config.categories.map((c) => c.id));
const brandSlugs = new Set(config.brands.map((b) => b.id));
const productIds = new Set();

const categories = config.categories.map((c, i) => ({
  name: c.title,
  slug: c.id,
  sortOrder: i,
  imageKey: c.image ?? null,
}));

const brands = config.brands.map((b, i) => ({
  name: b.name,
  slug: b.id,
  sortOrder: i,
}));

const thumbFor = (key) => {
  // "-4x5" primary image -> its "-1x1" sibling; a "-1x1" image is its own thumb.
  const candidate = key.replace(/-\d+x\d+\.webp$/, "-1x1.webp");
  return existsSync(join(WEB, candidate)) ? candidate : key;
};

const firstSentence = (text) => {
  const m = text.trim().match(/^.*?[.!?](?=\s|$)/s);
  return (m ? m[0] : text).trim();
};

const warnings = [];
let variantCount = 0;
let imageCount = 0;

const products = config.products.map((p, i) => {
  if (productIds.has(p.id)) fail(`duplicate product id ${p.id}`);
  productIds.add(p.id);
  if (!brandSlugs.has(p.brand)) fail(`product ${p.id}: unknown brand ${p.brand}`);
  if (!categorySlugs.has(p.category)) fail(`product ${p.id}: unknown category ${p.category}`);

  const certificationCodes = p.certifications.map((name) => {
    const code = CERT_CODES[name];
    if (!code) fail(`product ${p.id}: unknown certification "${name}"`);
    return code;
  });

  const specs = Object.entries(p.specs ?? {}).map(([label, value]) => ({ label, value: String(value) }));

  const images = p.images.map((img) => {
    if (!existsSync(join(WEB, img.src))) warnings.push(`${p.id}: image file missing ${img.src}`);
    imageCount++;
    return { key: img.src, thumbKey: thumbFor(img.src), alt: img.alt ?? "" };
  });

  const badges = p.badges ?? [];
  const inStock = p.inStock !== false;
  const variants = [];
  p.sizes.forEach((size, si) => {
    for (const color of p.colors) {
      // One size per in-stock product gets stock 2 so the "low stock" UI shows (first size).
      const stock = !inStock ? 0 : si === 0 ? 2 : 5;
      variants.push({ size, color: color.name, colorHex: color.hex ?? null, stock });
      variantCount++;
    }
  });

  if (p.video) warnings.push(`${p.id}: video "${p.video}" not exported (no video model in the API)`);

  return {
    slug: p.id,
    title: p.title,
    brandSlug: p.brand,
    categorySlug: p.category,
    shortDescription: firstSentence(p.description),
    description: p.description,
    gearDoctorNote: p.gearDoctorNote ?? "",
    specs,
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? null,
    badges,
    certificationCodes,
    isFeatured: badges.includes("Rider's pick"),
    sortOrder: i,
    images,
    variants,
  };
});

const out = { categories, brands, products };
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`Wrote ${OUT_PATH}`);
console.log(`Categories: ${categories.length}`);
console.log(`Brands:     ${brands.length}`);
console.log(`Products:   ${products.length} (featured: ${products.filter((p) => p.isFeatured).length}, published on import)`);
console.log(`Images:     ${imageCount}`);
console.log(`Variants:   ${variantCount} (out of stock products: ${products.filter((p) => p.variants.every((v) => v.stock === 0)).length})`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log("  - " + w);
}
