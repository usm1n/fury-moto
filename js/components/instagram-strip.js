/**
 * Instagram strip + official embeds.
 *
 *   instagramStrip(posts, { title, account, max }) -> raw HTML string
 *   instagramEmbed(url, { caption, account })      -> raw HTML for one official embed
 *   activateEmbeds(root)                           -> loads Instagram's embed.js lazily (when the
 *                                                     embeds come near the viewport) and renders them
 *   default export mount(el)                       -> home strip (both accounts, newest first, interleaved)
 *
 * A post with an `image` renders as a light image tile linking to the post.
 * A post without one renders as Instagram's official embed (blockquote + embed.js),
 * so real posts show even before media files are downloaded. The blockquote holds a
 * plain link fallback, so nothing breaks if the script is blocked.
 * With no posts at all, renders follow cards for each config.socials.instagram account.
 * Styles live in css/pages/gear-doctor.css (.igstrip*, .igembed*).
 */
import { config } from "../core/config.js";
import { html, esc } from "../core/render.js";

const EMBED_SCRIPT = "https://www.instagram.com/embed.js";
const ig = () => config.instagram || {};
const ui = () => config.ui || {};

function postCard(p) {
  const alt = p.caption || p.account || ui().igPost || "";
  return html`<li class="igstrip__item"><a class="igstrip__post" href="${p.url}" target="_blank" rel="noopener noreferrer">
    <img src="${p.image}" alt="${alt}" loading="lazy" decoding="async">
    ${p.account ? html`<span class="igstrip__acct">${p.account}</span>` : ""}
  </a></li>`;
}

/** canonical form the embed script expects: https://www.instagram.com/p|reel/<code>/ */
const permalinkOf = (url) => {
  const m = /instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/.exec(String(url));
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : String(url).replace(/\?.*$/, "");
};

/**
 * Official embed slot. Renders a skeleton loader (Instagram-post-shaped shimmer) at the
 * embed's final height, so nothing jumps when the real post arrives. The actual
 * <blockquote> for Instagram's script is created later by activateEmbeds(), one slot at
 * a time, and the rendered post fades in over the skeleton. The link inside the skeleton
 * is the fallback if Instagram's script is blocked.
 */
export function instagramEmbed(url, { caption = "", account = "" } = {}) {
  const permalink = permalinkOf(url);
  return html`<div class="igembed-slot is-loading" data-ig-permalink="${permalink}">
    <a class="igskel" href="${permalink}" target="_blank" rel="noopener noreferrer" aria-label="${(ui().igView || "") + (account ? " — " + account : "")}">
      <span class="igskel__head"><span class="igskel__avatar"></span><span class="igskel__lines"><span></span><span></span></span><span class="igskel__btn"></span></span>
      <span class="igskel__media"><span class="igskel__play" aria-hidden="true"></span></span>
      <span class="igskel__foot"><span></span><span></span></span>
      ${account || caption ? html`<span class="igskel__text">${account ? html`<b>${account}</b>` : ""} ${caption}</span>` : ""}
    </a>
  </div>`;
}

function embedCard(p) {
  return html`<li class="igstrip__item igstrip__item--embed">${instagramEmbed(p.url, p)}</li>`;
}

function followCard(a) {
  const cta = config.gearDoctor?.followCta || "";
  return html`<li class="igstrip__item"><a class="igstrip__follow" href="${a.url}" target="_blank" rel="noopener noreferrer">
    <span class="igstrip__handle">${a.handle}</span>
    <span class="igstrip__label">${a.label}</span>
    <span class="btn btn--ghost igstrip__btn">${cta}</span>
  </a></li>`;
}

/** Newest first; posts without a date keep their config order. Alternates accounts when mixing. */
function pick(posts, { account, max }) {
  let list = (posts || []).filter((p) => p?.url && (!account || p.account === account));
  if (!account) {
    const byAcct = {};
    list.forEach((p) => (byAcct[p.account] ||= []).push(p));
    const queues = Object.values(byAcct);
    list = [];
    while (queues.some((q) => q.length)) queues.forEach((q) => q.length && list.push(q.shift()));
  }
  return list.slice(0, max);
}

export function instagramStrip(posts = [], { title = "", account = "", max } = {}) {
  const hasImages = (posts || []).some((p) => p.image);
  const limit = max ?? (hasImages ? ig().stripCount ?? 8 : ig().embedCount ?? 6);
  const list = pick(posts, { account, max: limit });
  const items = list.length
    ? list.map((p) => String(p.image ? postCard(p) : embedCard(p)))
    : (config.socials?.instagram || []).map((a) => String(followCard(a)));
  if (!items.length) return "";
  const mod = !list.length ? " igstrip--follow" : list.some((p) => !p.image) ? " igstrip--embeds" : "";
  const follow = list.length
    ? `<p class="igstrip__more">${(config.socials?.instagram || [])
        .map((a) => `<a class="btn btn--ghost" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.handle)}</a>`).join(" ")}</p>`
    : "";
  return `<div class="igstrip${mod}">${title ? `<h2 class="igstrip__title">${esc(title)}</h2>` : ""}<ul class="igstrip__list">${items.join("")}</ul>${follow}</div>`;
}

/* ------------------------------------------------------------- embed loader */

const idle = (fn, timeout = 2000) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 300));

let scriptPromise = null;
function loadScript() {
  if (window.instgrm) return Promise.resolve();
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = EMBED_SCRIPT;
    s.onload = resolve;
    s.onerror = reject;
    document.body.append(s);
  });
  return scriptPromise;
}

/* scroll-pause detector: building an embed (iframe + layout) mid-scroll is what stutters */
let lastScroll = 0;
addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
const whenScrollPauses = (ms = 180) => new Promise((resolve) => {
  const check = () => (performance.now() - lastScroll >= ms ? resolve() : setTimeout(check, ms));
  check();
});

/* one embed at a time, in document order of arrival */
const queue = [];
let working = false;

async function work() {
  if (working) return;
  working = true;
  try {
    await loadScript();
    while (queue.length) {
      const slot = queue.shift();
      if (!slot.isConnected) continue;
      await whenScrollPauses();
      await new Promise((r) => idle(r, 800));
      await renderSlot(slot);
    }
  } catch {
    // script blocked / offline: keep the skeletons as plain links, stop shimmering
    document.querySelectorAll(".igembed-slot.is-loading").forEach((el) => el.classList.replace("is-loading", "is-fallback"));
    queue.length = 0;
  }
  working = false;
}

/** Create this slot's blockquote, let Instagram render it, fade it in, resolve when done (or after 8 s). */
function renderSlot(slot) {
  return new Promise((resolve) => {
    const bq = document.createElement("blockquote");
    bq.className = "instagram-media igembed";
    bq.dataset.instgrmPermalink = slot.dataset.igPermalink;
    bq.dataset.instgrmVersion = "14";
    slot.append(bq);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      mo.disconnect();
      clearTimeout(timer);
      slot.classList.remove("is-loading");
      slot.classList.add("is-ready");               // CSS fades the post in over the skeleton
      setTimeout(resolve, 250);                     // breathing room before the next embed
    };
    const mo = new MutationObserver(() => {
      const frame = slot.querySelector("iframe");
      if (frame && !frame.dataset.igWatched) {
        frame.dataset.igWatched = "";
        frame.addEventListener("load", () => setTimeout(finish, 120), { once: true });
      }
    });
    mo.observe(slot, { childList: true, subtree: true });
    const timer = setTimeout(finish, 8000);
    window.instgrm?.Embeds?.process();
  });
}

/**
 * Activate every embed slot inside root:
 *   - Instagram's script is fetched while the browser is idle after page load (not mid-scroll)
 *   - each slot is queued when it comes within ~1 screen of the viewport
 *   - slots are built one at a time, only while scrolling has paused
 */
export function activateEmbeds(root = document) {
  if (ig().embeds === false) return;
  const slots = [...root.querySelectorAll(".igembed-slot:not([data-ig-watched])")];
  if (!slots.length) return;
  slots.forEach((el) => (el.dataset.igWatched = ""));

  const warm = () => idle(() => loadScript().catch(() => {}));
  if (document.readyState === "complete") warm(); else addEventListener("load", warm, { once: true });

  if (!("IntersectionObserver" in window)) { queue.push(...slots); work(); return; }
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e) => { io.unobserve(e.target); queue.push(e.target); });
    queue.sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    work();
  }, { rootMargin: "100% 0px" });
  slots.forEach((el) => io.observe(el));
}

export default function mount(el) {
  if (!el) return;
  el.innerHTML = instagramStrip(config.instagramPosts, { title: config.home?.instagramTitle });
  activateEmbeds(el);
}
