/**
 * SEO helpers: <title>, meta description, canonical, Open Graph, Twitter card and JSON-LD.
 * Every value comes from config.seo / config.store. Safe to call more than once (idempotent).
 *
 *   import { setSeo, productJsonLd, storeJsonLd, breadcrumbJsonLd } from "./core/seo.js";
 *   setSeo({ title: "Helmets", description: "...", url: "shop.html?cat=helmets", jsonLd: storeJsonLd() });
 */
import { config, isPlaceholder } from "./config.js";

/** Returns the trimmed string, or undefined when empty or still a [PLACEHOLDER]. */
const clean = (v) => (typeof v === "string" && v.trim() && !isPlaceholder(v) ? v.trim() : undefined);

const isAbs = (u) => /^https?:\/\//i.test(String(u));

/** Site name for og:site_name and schema. Falls back to the brand part of seo.defaultTitle. */
export function siteName() {
  const fromTitle = String(config.seo?.defaultTitle || "").split(" — ")[0].trim();
  return clean(config.store?.name) || fromTitle || clean(config.store?.shortName) || "";
}

/** Base URL for absolute links: store.siteUrl when set, otherwise the current page's folder. */
function siteBase() {
  const s = clean(config.store?.siteUrl);
  if (s) {
    try {
      const u = new URL(s);
      return u.pathname.endsWith("/") ? u.href : `${u.href}/`;
    } catch { /* fall through to location */ }
  }
  return typeof location !== "undefined" ? location.href : "https://example.com/";
}

/** Absolute URL for a site-relative path ("assets/img/x.jpg", "shop.html?cat=helmets"). */
export function absUrl(path = "") {
  if (!path) return "";
  if (isAbs(path)) return String(path);
  try {
    return new URL(String(path).replace(/^\.?\//, ""), siteBase()).href;
  } catch {
    return String(path);
  }
}

/** Canonical URL of the current page, without the hash. */
function currentPageUrl() {
  if (typeof location === "undefined") return "";
  const file = location.pathname.split("/").pop();
  const search = location.search || "";
  if (!file || file === "index.html") return `${siteBase()}${search}`;
  return absUrl(`${file}${search}`);
}

function upsert(selector, tag, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function setMeta(attr, key, content) {
  if (!content) return;
  upsert(`meta[${attr}="${key}"]`, "meta", { [attr]: key, content });
}

function setJsonLd(data) {
  const existing = [...document.head.querySelectorAll('script[type="application/ld+json"][data-seo]')];
  if (!data) {
    existing.forEach((n) => n.remove());
    return;
  }
  const el = existing[0] || document.createElement("script");
  if (!existing[0]) {
    el.type = "application/ld+json";
    el.dataset.seo = "";
    document.head.appendChild(el);
  }
  // "<" is escaped so content can never close the script tag early.
  el.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  existing.slice(1).forEach((n) => n.remove());
}

/**
 * Sets document title, description, canonical, Open Graph, Twitter and JSON-LD for the current page.
 * @param {{title?: string, description?: string, image?: string, url?: string, type?: string, jsonLd?: object|object[]}} opts
 */
export function setSeo({ title, description, image, url, type = "website", jsonLd } = {}) {
  if (typeof document === "undefined") return;
  const seo = config.seo || {};
  const fullTitle = title
    ? (seo.titleTemplate || "%s").replace("%s", () => title)
    : seo.defaultTitle || siteName();
  const desc = clean(description) || seo.description || "";
  const pageUrl = url ? absUrl(url) : currentPageUrl();
  const img = absUrl(image || seo.ogImage || "");

  document.title = fullTitle;
  setMeta("name", "description", desc);

  if (pageUrl) upsert('link[rel="canonical"]', "link", { rel: "canonical", href: pageUrl });

  setMeta("property", "og:title", fullTitle);
  setMeta("property", "og:description", desc);
  setMeta("property", "og:type", type);
  setMeta("property", "og:url", pageUrl);
  setMeta("property", "og:image", img);
  setMeta("property", "og:site_name", siteName());

  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", fullTitle);
  setMeta("name", "twitter:description", desc);
  setMeta("name", "twitter:image", img);

  setJsonLd(jsonLd || null);
}

/** schema.org Product for a config product (see js/site.config.js products[]). */
export function productJsonLd(product) {
  if (!product) return null;
  const url = absUrl(`product.html?id=${encodeURIComponent(product.id)}`);
  const brand = (config.brands || []).find((b) => b.id === product.brand || b.name === product.brand);
  const price = Number(product.price);
  const images = (product.images || []).map((i) => absUrl(i.src)).filter(Boolean);
  const name = clean(siteName());
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: clean(product.description) || clean(product.gearDoctorNote),
    sku: product.id,
    brand: { "@type": "Brand", name: brand?.name || product.brand },
    image: images.length ? images : undefined,
    url,
    offers: {
      "@type": "Offer",
      url,
      price: Number.isFinite(price) ? price : undefined,
      priceCurrency: config.store?.currency,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: name ? { "@type": "Organization", name } : undefined,
    },
  };
}

/** schema.org Store (LocalBusiness subtype) from config.store and config.socials. Placeholders are omitted. */
export function storeJsonLd() {
  const s = config.store || {};
  const socials = config.socials || {};
  const sameAs = [
    ...(socials.instagram || []).map((i) => i.url),
    socials.youtube?.url,
  ].filter((u) => clean(u));
  const street = clean(s.address);
  const city = clean(s.city);
  const phone = clean(s.phoneDisplay);
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: siteName() || undefined,
    url: clean(s.siteUrl) ? siteBase() : undefined,
    logo: absUrl("assets/img/icons/icon-512.png"),
    image: absUrl(config.seo?.ogImage || ""),
    description: config.seo?.description,
    telephone: phone,
    email: clean(s.email),
    address: street || city ? {
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: city,
      addressCountry: "PK",
    } : undefined,
    currenciesAccepted: clean(s.currency),
    paymentAccepted: s.cashOnDelivery ? "Cash on delivery" : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

/** schema.org BreadcrumbList. items: [{ name, url? }] (omit url on the current page). */
export function breadcrumbJsonLd(items = []) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url ? absUrl(it.url) : undefined,
    })),
  };
}
