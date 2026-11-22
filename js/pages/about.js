import { config } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { icons } from "../components/footer.js";

const FALLBACK_IMG = "assets/img/stills/rider-1-1600.webp";
const ext = 'target="_blank" rel="noopener noreferrer"';

export function setMeta(title, description) {
  const tpl = config.seo?.titleTemplate || "%s";
  document.title = tpl.replace("%s", title);
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
  m.content = description || config.seo?.description || "";
}

export default function mount(main) {
  const { about, ui = {}, socials } = config;
  const story = about.story || [];
  setMeta(about.title, about.intro);

  const socialCards = [
    ...(socials?.instagram || []).map((s) => ({ ...s, icon: icons.instagram })),
    ...(socials?.youtube ? [{ ...socials.youtube, icon: icons.youtube }] : []),
  ];

  renderTemplate(main, html`
    <section class="about-hero" data-video-slot="about" aria-labelledby="about-title">
      <div class="container about-hero__inner">
        <div class="about-hero__head">
          <p class="eyebrow">${ui.aboutEyebrow}</p>
          <h1 id="about-title">${about.title}</h1>
          <p class="about-hero__intro">${about.intro}</p>
        </div>
        <div class="about-hero__beats">
          ${story.slice(0, 3).map((p) => html`<p class="about-hero__beat" data-beat>${p}</p>`)}
        </div>
      </div>
    </section>

    <section class="section about-facts" data-reveal>
      <div class="container about-facts__grid">
        <div class="about-facts__text stack">
          <h2>${ui.aboutBikesTitle}</h2>
          <ul class="about-bikes" role="list">
            ${(about.bikes || []).map((b) => html`<li class="about-bike">${b}</li>`)}
          </ul>
          ${story.length > 3 ? html`<div class="stack">${story.slice(3).map((p) => html`<p>${p}</p>`)}</div>` : ""}
          <dl class="about-stats">
            ${(about.stats || []).map((s) => html`<div class="about-stat"><dt class="muted">${s.label}</dt><dd class="display">${s.value}</dd></div>`)}
          </dl>
        </div>
        <figure class="about-photo">
          <img src="${about.image}" alt="${ui.aboutImageAlt}" width="1200" height="1500" loading="lazy" decoding="async" data-about-img>
        </figure>
      </div>
    </section>

    <section class="section about-follow" data-reveal aria-labelledby="about-follow-title">
      <div class="container stack">
        <h2 id="about-follow-title">${ui.aboutFollowTitle}</h2>
        <ul class="about-cards" role="list">
          ${socialCards.map((s) => html`
            <li><a class="about-card" href="${s.url}" ${raw(ext)} aria-label="${s.label}">
              <span class="about-card__icon">${s.icon}</span>
              <span class="about-card__body"><strong class="about-card__handle">${s.handle}</strong><span class="muted">${s.label}</span></span>
              <span class="about-card__go">${ui.openLink} &#8599;</span>
            </a></li>`)}
        </ul>
        <div class="about-cta">
          <a class="btn btn--primary" href="shop.html" data-magnetic>${ui.aboutShopCta}</a>
          <a class="btn btn--ghost" href="gear-doctor.html">${ui.aboutDoctorCta}</a>
        </div>
      </div>
    </section>`);

  const img = main.querySelector("[data-about-img]");
  let tried = false;
  img?.addEventListener("error", () => {
    if (tried) { img.closest("figure")?.remove(); return; }
    tried = true;
    img.src = FALLBACK_IMG;
  });
}
