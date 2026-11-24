/** Shop page: filters ⇄ URL, grid, category strip, mobile filter drawer. */
import { config } from "../core/config.js";
import { html, raw, esc, renderTemplate } from "../core/render.js";
import { on, emit } from "../core/bus.js";
import { refresh } from "../core/app.js";
import { getProducts, getFacets, getCategories } from "../data/products.js";
import { skeletonCards, showError } from "../components/api-state.js";
import { initQuickView } from "../components/quick-view.js";

const ui = () => config.ui || {};
const FOCUSABLE = 'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])';
const PAGE_SIZE = 24;
const SORTS = [["featured", "sortFeatured"], ["price-asc", "sortPriceAsc"], ["price-desc", "sortPriceDesc"], ["new", "sortNew"], ["name", "sortName"]];
const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

let productCard = null;
async function loadCard() {
  try {
    ({ productCard } = await import("../components/product-card.js"));
  } catch {
    productCard = (p) => raw(`<article class="pcard" data-product-id="${esc(p.id)}"><a href="product.html?slug=${esc(p.id)}">${esc(p.title)}</a></article>`);
  }
}

function readState() {
  const q = new URLSearchParams(location.search);
  return {
    cat: q.get("cat") || "", brand: list(q.get("brand")), size: list(q.get("size")), cert: list(q.get("cert")),
    min: q.get("min") || "", max: q.get("max") || "", sort: q.get("sort") || "featured", q: q.get("q") || "", stock: q.get("stock") === "1",
  };
}

function writeState(s) {
  const q = new URLSearchParams();
  if (s.cat) q.set("cat", s.cat);
  if (s.brand.length) q.set("brand", s.brand.join(","));
  if (s.size.length) q.set("size", s.size.join(","));
  if (s.cert.length) q.set("cert", s.cert.join(","));
  if (s.min !== "") q.set("min", s.min);
  if (s.max !== "") q.set("max", s.max);
  if (s.sort && s.sort !== "featured") q.set("sort", s.sort);
  if (s.q) q.set("q", s.q);
  if (s.stock) q.set("stock", "1");
  const qs = q.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
}

export default async function mount(main) {
  await loadCard();
  initQuickView();
  const $ = (k) => main.querySelector(`[data-shop="${k}"]`);
  const els = { eyebrow: $("eyebrow"), title: $("title"), count: $("count"), cats: $("cats"), filters: $("filters"), openBtn: $("open-filters"), sortLabel: $("sort-label"), sort: $("sort"), chips: $("chips"), grid: $("grid") };
  let state = readState();
  let facets = { brands: [], brandNames: {}, sizes: [], certifications: [], minPrice: 0, maxPrice: 0 };
  let cats = [];
  let opener = null;
  const catOf = (id) => cats.find((c) => c.id === id) || null;
  /** categories + facets for the current category; throws ApiError when the API is down */
  const loadRefs = async () => {
    [cats, facets] = await Promise.all([getCategories(), getFacets(state.cat)]);
  };

  els.eyebrow.textContent = ui().shopTitle;
  els.openBtn.textContent = ui().filters;
  els.sortLabel.textContent = ui().sortBy;
  els.filters.setAttribute("aria-label", ui().filtersTitle);
  renderTemplate(els.sort, SORTS.map(([v, k]) => html`<option value="${v}">${ui()[k]}</option>`).map(String).join(""));

  /* ---------- category strip ---------- */
  function renderCats() {
    const tile = (id, title, image, c) => {
      const slot = c?.videoSlot ? ` data-video-slot="${esc(c.videoSlot)}" data-video-start="${esc(c.videoStart ?? 0)}"` : "";
      const active = state.cat === id;
      return `<a class="cat-tile${active ? " is-active" : ""}" href="shop.html${id ? "?cat=" + encodeURIComponent(id) : ""}" data-cat="${esc(id)}"${active ? ' aria-current="page"' : ""}${slot}>
        ${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async">` : ""}<span class="cat-tile__label">${esc(title)}</span></a>`;
    };
    renderTemplate(els.cats, [tile("", ui().shopAllCategories, "", null), ...cats.map((c) => tile(c.id, c.title, c.image, c))].join(""));
    els.cats.setAttribute("aria-label", ui().shopCategories);
  }

  /* ---------- filter panel ---------- */
  function group(title, body) {
    return `<fieldset class="fgroup"><legend class="fgroup__title">${esc(title)}</legend>${body}</fieldset>`;
  }
  const check = (name, value, label, checked) =>
    `<label class="fopt"><input type="checkbox" name="${name}" value="${esc(value)}"${checked ? " checked" : ""}><span>${esc(label)}</span></label>`;

  function renderFilters() {
    const catOpts = cats.map((c) =>
      `<label class="fopt"><input type="radio" name="cat" value="${esc(c.id)}"${state.cat === c.id ? " checked" : ""}><span>${esc(c.title)}</span></label>`).join("");
    const allCat = `<label class="fopt"><input type="radio" name="cat" value=""${!state.cat ? " checked" : ""}><span>${esc(ui().shopAllCategories)}</span></label>`;
    const brandName = (id) => facets.brandNames[id] || id;
    const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
    const sizes = facets.sizes.slice().sort((a, b) => (sizeOrder.indexOf(a) + 1 || 99) - (sizeOrder.indexOf(b) + 1 || 99) || String(a).localeCompare(b, undefined, { numeric: true }));
    renderTemplate(els.filters, `
      <div class="fpanel__head"><h2 class="fpanel__title">${esc(ui().filtersTitle)}</h2>
        <button class="fpanel__close" type="button" data-f-close aria-label="${esc(ui().close)}">&times;</button></div>
      <div class="fpanel__body">
        ${group(ui().filterCategory, allCat + catOpts)}
        ${facets.brands.length ? group(ui().filterBrand, facets.brands.map((b) => check("brand", b, brandName(b), state.brand.includes(b))).join("")) : ""}
        ${sizes.length ? group(ui().filterSize, `<div class="fsizes">${sizes.map((s) => `<label class="fsize"><input type="checkbox" name="size" value="${esc(s)}"${state.size.includes(s) ? " checked" : ""}><span>${esc(s)}</span></label>`).join("")}</div>`) : ""}
        ${group(ui().filterPrice, `<div class="fprice">
          <label><span class="visually-hidden">${esc(ui().filterPriceMin)}</span><input type="number" inputmode="numeric" min="0" name="min" placeholder="${esc(ui().filterPriceMin)}${facets.minPrice ? " " + facets.minPrice : ""}" value="${esc(state.min)}"></label>
          <label><span class="visually-hidden">${esc(ui().filterPriceMax)}</span><input type="number" inputmode="numeric" min="0" name="max" placeholder="${esc(ui().filterPriceMax)}${facets.maxPrice ? " " + facets.maxPrice : ""}" value="${esc(state.max)}"></label></div>`)}
        ${facets.certifications.length ? group(ui().filterCert, facets.certifications.map((c) => check("cert", c, c, state.cert.includes(c))).join("")) : ""}
        <label class="fopt fopt--toggle"><input type="checkbox" name="stock"${state.stock ? " checked" : ""}><span>${esc(ui().filterInStock)}</span></label>
      </div>
      <div class="fpanel__foot">
        <button class="btn btn--ghost" type="button" data-f-clear>${esc(ui().filterClear)}</button>
        <button class="btn btn--primary" type="button" data-f-close data-f-apply>${esc(ui().filterApply)}</button>
      </div>`);
  }

  function readInputs() {
    const f = els.filters;
    const vals = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((i) => i.value);
    const num = (n) => { const v = f.querySelector(`input[name="${n}"]`)?.value; return v === "" || v == null || Number(v) < 0 ? "" : String(Math.round(Number(v))); };
    return { ...state, brand: vals("brand"), size: vals("size"), cert: vals("cert"), min: num("min"), max: num("max"), stock: !!f.querySelector('input[name="stock"]:checked') };
  }

  /* ---------- chips ---------- */
  function renderChips() {
    const chips = [];
    const add = (label, key, value) => chips.push(`<button class="chip" type="button" data-chip-key="${key}" data-chip-val="${esc(value ?? "")}" aria-label="${esc(ui().filterRemove)}: ${esc(label)}">${esc(label)}<span aria-hidden="true">&times;</span></button>`);
    if (state.cat) add(catOf(state.cat)?.title || state.cat, "cat");
    state.brand.forEach((b) => add(facets.brandNames[b] || b, "brand", b));
    state.size.forEach((s) => add(`${ui().filterSize} ${s}`, "size", s));
    state.cert.forEach((c) => add(c, "cert", c));
    if (state.min !== "") add(`${ui().filterPriceMin} ${state.min}`, "min");
    if (state.max !== "") add(`${ui().filterPriceMax} ${state.max}`, "max");
    if (state.stock) add(ui().filterInStock, "stock");
    if (state.q) add(`"${state.q}"`, "q");
    renderTemplate(els.chips, chips.length ? `<span class="visually-hidden">${esc(ui().activeFilters)}</span>${chips.join("")}<button class="chip chip--clear" type="button" data-chip-clear>${esc(ui().filterClear)}</button>` : "");
  }

  /* ---------- results ---------- */
  let token = 0;
  let loaded = [];          // products shown so far (grows with "Load more")
  let total = 0;
  const filtersOf = (page) => ({ cat: state.cat, brand: state.brand, size: state.size, cert: state.cert, min: state.min, max: state.max, q: state.q, sort: state.sort, inStock: state.stock, page, pageSize: PAGE_SIZE });
  const cardsHtml = (items, from = 0) => items.map((p, i) => String(productCard(p, { loading: from + i < 4 ? "eager" : "lazy" }))).join("");

  async function renderResults() {
    const my = ++token;
    loaded = []; total = 0;
    els.grid.classList.remove("is-empty");
    renderTemplate(els.grid, skeletonCards(8));
    let res;
    try {
      res = await getProducts(filtersOf(1));
    } catch (e) {
      if (my !== token) return;
      console.warn("[shop]", e);
      els.grid.classList.add("is-empty");
      showError(els.grid, e, () => init());
      return;
    }
    if (my !== token) return;
    loaded = res.items; total = res.total;
    const cat = catOf(state.cat);
    els.title.textContent = state.q ? `${ui().resultsFor} “${state.q}”` : cat?.title || ui().shopAll;
    els.count.textContent = total === 1 ? ui().shopCountOne : String(ui().shopCount).replace("{n}", total);
    document.title = String(config.seo?.titleTemplate || "%s").replace("%s", cat && !state.q ? cat.title : state.q ? `${ui().resultsFor} ${state.q}` : ui().shopTitle);
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = ui().shopDescription;
    els.sort.value = state.sort;
    renderChips();
    if (!loaded.length) {
      // No filters and still nothing: the store itself is empty, so don't blame the filters.
      const filtered = !!els.chips.querySelector("[data-chip-clear]");
      renderTemplate(els.grid, filtered
        ? `<div class="shop-empty"><h2>${esc(ui().noResultsTitle)}</h2><p class="muted">${esc(ui().noResultsText)}</p><button class="btn btn--primary" type="button" data-chip-clear>${esc(ui().filterClear)}</button></div>`
        : `<div class="shop-empty"><h2>${esc(ui().shopEmptyTitle)}</h2><p class="muted">${esc(ui().shopEmptyText)}</p></div>`);
      els.grid.classList.add("is-empty");
    } else {
      renderTemplate(els.grid, cardsHtml(loaded));
    }
    syncMore();
    refresh(els.grid);
  }

  /** "Load more" button under the grid while more pages exist */
  function syncMore() {
    let more = main.querySelector("[data-shop-more]");
    if (loaded.length >= total) { more?.remove(); return; }
    if (!more) {
      more = document.createElement("div");
      more.className = "shop-more";
      more.dataset.shopMore = "";
      more.innerHTML = `<button class="btn btn--ghost" type="button">${esc(ui().loadMore)}</button>`;
      els.grid.after(more);
      more.querySelector("button").addEventListener("click", loadMore);
    }
  }
  async function loadMore() {
    const my = token;
    const btn = main.querySelector("[data-shop-more] button");
    if (btn) btn.disabled = true;
    try {
      const res = await getProducts(filtersOf(Math.floor(loaded.length / PAGE_SIZE) + 1));
      if (my !== token) return;
      const from = loaded.length;
      loaded = loaded.concat(res.items);
      els.grid.insertAdjacentHTML("beforeend", cardsHtml(res.items, from));
      syncMore();
      refresh(els.grid);
    } catch (e) { console.warn("[shop] more", e); if (btn) btn.disabled = false; }
  }

  async function apply(next, { rebuildFilters = false, push = true } = {}) {
    const catChanged = next.cat !== state.cat;
    state = next;
    if (push) writeState(state);
    if (catChanged) { try { facets = await getFacets(state.cat); } catch (e) { console.warn("[shop]", e); } prune(); renderCats(); refresh(els.cats); }
    if (catChanged || rebuildFilters) renderFilters();
    emit("filter:change", { cat: state.cat, brand: state.brand, size: state.size, cert: state.cert, min: state.min, max: state.max, sort: state.sort, q: state.q });
    await renderResults();
  }
  /** drop selections no longer in the facets of the new category */
  function prune() {
    state.brand = state.brand.filter((b) => facets.brands.includes(b));
    state.size = state.size.filter((s) => facets.sizes.includes(s));
    state.cert = state.cert.filter((c) => facets.certifications.includes(c));
    writeState(state);
  }

  /* ---------- events ---------- */
  els.filters.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "cat") return apply({ ...readInputs(), cat: t.value });
    apply(readInputs());
  });
  els.filters.addEventListener("click", (e) => {
    if (e.target.closest("[data-f-clear]")) return apply({ ...state, cat: state.cat, brand: [], size: [], cert: [], min: "", max: "", stock: false, q: "" }, { rebuildFilters: true });
    if (e.target.closest("[data-f-close]")) closeDrawer();
  });
  els.sort.addEventListener("change", () => apply({ ...state, sort: els.sort.value }));
  main.addEventListener("click", (e) => {
    const clear = e.target.closest("[data-chip-clear]");
    if (clear) return apply({ ...state, cat: "", brand: [], size: [], cert: [], min: "", max: "", stock: false, q: "" }, { rebuildFilters: true });
    const chip = e.target.closest("[data-chip-key]");
    if (!chip) return;
    const k = chip.dataset.chipKey, v = chip.dataset.chipVal;
    const next = { ...state };
    if (["brand", "size", "cert"].includes(k)) next[k] = state[k].filter((x) => x !== v);
    else if (k === "stock") next.stock = false;
    else next[k] = "";
    apply(next, { rebuildFilters: true });
  });
  els.cats.addEventListener("click", (e) => {
    const a = e.target.closest("[data-cat]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    apply({ ...state, cat: a.dataset.cat });
  });
  window.addEventListener("popstate", async () => {
    const next = readState();
    try { facets = await getFacets(next.cat); } catch (e) { console.warn("[shop]", e); }
    state = next;
    renderCats(); refresh(els.cats); renderFilters();
    await renderResults();
  });

  /* ---------- mobile drawer ---------- */
  const mq = window.matchMedia("(min-width: 1024px)");
  let backdrop = null;
  function openDrawer() {
    opener = document.activeElement;
    els.filters.classList.add("is-open");
    els.filters.setAttribute("role", "dialog");
    els.filters.setAttribute("aria-modal", "true");
    els.openBtn.setAttribute("aria-expanded", "true");
    backdrop = document.createElement("div");
    backdrop.className = "shop-backdrop";
    backdrop.addEventListener("click", closeDrawer);
    document.body.appendChild(backdrop);
    document.documentElement.style.overflow = "hidden";
    els.filters.querySelector(FOCUSABLE)?.focus();
  }
  function closeDrawer() {
    if (!els.filters.classList.contains("is-open")) return;
    els.filters.classList.remove("is-open");
    els.filters.setAttribute("role", "complementary");
    els.filters.removeAttribute("aria-modal");
    els.openBtn.setAttribute("aria-expanded", "false");
    backdrop?.remove(); backdrop = null;
    document.documentElement.style.overflow = "";
    opener?.focus?.();
  }
  els.openBtn.addEventListener("click", openDrawer);
  mq.addEventListener?.("change", closeDrawer);
  els.filters.addEventListener("keydown", (e) => {
    if (!els.filters.classList.contains("is-open")) return;
    if (e.key === "Escape") return closeDrawer();
    if (e.key !== "Tab") return;
    const f = [...els.filters.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  /* ---------- initial render ---------- */
  async function init() {
    renderTemplate(els.grid, skeletonCards(8));
    els.grid.classList.remove("is-empty");
    try { await loadRefs(); } catch (e) {
      console.warn("[shop]", e);
      els.grid.classList.add("is-empty");
      showError(els.grid, e, () => init());
      return;
    }
    renderCats(); refresh(els.cats);
    renderFilters();
    await renderResults();
    emit("filter:change", { cat: state.cat, brand: state.brand, size: state.size, cert: state.cert, min: state.min, max: state.max, sort: state.sort, q: state.q });
  }
  await init();
  // search overlay on this page may navigate with ?q= via link; also react to bus search events if any
  on("shop:set", (d) => apply({ ...state, ...d }, { rebuildFilters: true }));
}
