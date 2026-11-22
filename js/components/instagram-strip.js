/**
 * Instagram strip. `instagramStrip(posts, { title })` -> raw HTML string.
 * Default export mounts into el using config.instagramPosts (latest 8).
 * With no posts, renders follow cards for each config.socials.instagram account.
 * Styles live in css/pages/gear-doctor.css (.igstrip*) — pages using this must link it.
 */
import { config } from "../core/config.js";
import { html, esc } from "../core/render.js";

function postCard(p) {
  const alt = p.caption || p.account || "Instagram post";
  return html`<li class="igstrip__item"><a class="igstrip__post" href="${p.url}" target="_blank" rel="noopener noreferrer">
    <img src="${p.image}" alt="${alt}" loading="lazy" decoding="async">
    ${p.account ? html`<span class="igstrip__acct">${p.account}</span>` : ""}
  </a></li>`;
}

function followCard(a) {
  const cta = config.gearDoctor?.followCta || "";
  return html`<li class="igstrip__item"><a class="igstrip__follow" href="${a.url}" target="_blank" rel="noopener noreferrer">
    <span class="igstrip__handle">${a.handle}</span>
    <span class="igstrip__label">${a.label}</span>
    <span class="btn btn--ghost igstrip__btn">${cta}</span>
  </a></li>`;
}

export function instagramStrip(posts = [], { title = "" } = {}) {
  const list = (posts || []).slice(0, 8);
  const items = list.length
    ? list.map((p) => String(postCard(p)))
    : (config.socials?.instagram || []).map((a) => String(followCard(a)));
  if (!items.length) return "";
  const mod = list.length ? "" : " igstrip--follow";
  return `<div class="igstrip${mod}">${title ? `<h2 class="igstrip__title">${esc(title)}</h2>` : ""}<ul class="igstrip__list">${items.join("")}</ul></div>`;
}

export default function mount(el) {
  if (!el) return;
  const out = instagramStrip(config.instagramPosts, { title: config.home?.instagramTitle });
  el.innerHTML = out;
}
