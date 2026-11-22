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

/** Official embed markup. Instagram's script swaps the blockquote for an iframe. */
export function instagramEmbed(url, { caption = "", account = "" } = {}) {
  // canonical form the embed script expects: https://www.instagram.com/p|reel/<code>/
  const m = /instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/.exec(String(url));
  const permalink = m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : String(url).replace(/\?.*$/, "");
  return html`<blockquote class="instagram-media igembed" data-instgrm-permalink="${permalink}" data-instgrm-version="14">
    <a class="igembed__fallback" href="${permalink}" target="_blank" rel="noopener noreferrer">
      ${account ? html`<span class="igembed__acct">${account}</span>` : ""}
      ${caption ? html`<span class="igembed__caption">${caption}</span>` : ""}
      <span class="igembed__cta">${ui().igView || ""}</span>
    </a>
  </blockquote>`;
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

/** Render every official embed inside root, loading Instagram's script only when one comes near. */
export function activateEmbeds(root = document) {
  if (ig().embeds === false) return;
  const quotes = [...root.querySelectorAll("blockquote.instagram-media:not([data-ig-watched])")];
  if (!quotes.length) return;
  quotes.forEach((q) => (q.dataset.igWatched = ""));
  const go = () => loadScript().then(() => window.instgrm?.Embeds?.process()).catch(() => { /* fallback links stay */ });
  if (!("IntersectionObserver" in window)) return go();
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); go(); }
  }, { rootMargin: "600px 0px" });
  quotes.forEach((q) => io.observe(q));
}

export default function mount(el) {
  if (!el) return;
  el.innerHTML = instagramStrip(config.instagramPosts, { title: config.home?.instagramTitle });
  activateEmbeds(el);
}
