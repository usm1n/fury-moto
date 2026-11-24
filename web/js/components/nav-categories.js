/**
 * Category links in the header / footer menus come from the admin (GET /api/categories), not the config.
 * site.config.js marks the spot with `{ categories: N }`; menus render a hidden placeholder there and
 * this module swaps in up to N links once the API answers. If the API is down the placeholder simply
 * stays empty, so a missing or renamed category never leaves a dead link.
 */
import { getCategories } from "../data/products.js";
import { esc } from "../core/render.js";

/** True for the `{ categories: N }` marker. */
export const isCategoryMarker = (item) => item && typeof item.categories === "number";

/** Placeholder markup for a marker (an <li> so it can sit inside any menu list). */
export const categoryPlaceholder = (item, cls = "") =>
  `<li hidden data-nav-cats="${Number(item.categories) || 0}" data-nav-cls="${esc(cls)}"></li>`;

let pending = null;
const load = () => (pending ||= getCategories().catch(() => []));

/**
 * Fill every placeholder inside `root`. `link(cat, cls)` returns the <li> HTML for one category.
 * Resolves with the category links that were added (for active-link highlighting).
 */
export async function fillCategoryLinks(root, link) {
  const holders = [...root.querySelectorAll("[data-nav-cats]")];
  if (!holders.length) return [];
  const cats = await load();
  const added = [];
  for (const h of holders) {
    const n = Number(h.dataset.navCats) || 0;
    const list = cats.slice(0, n);
    const htmlStr = list.map((c, i) => link(c, h.dataset.navCls || "", i)).join("");
    h.insertAdjacentHTML("afterend", htmlStr);
    h.remove();
    added.push(...list.map((c) => ({ label: c.title, href: `shop.html?cat=${encodeURIComponent(c.id)}` })));
  }
  return added;
}
