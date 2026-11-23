import { config, waLink } from "../core/config.js";
import { html, raw, renderTemplate } from "../core/render.js";
import { getSettings, settingsNow } from "../data/settings.js";

const svg = (d) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`);
export const icons = {
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor"/>'),
  youtube: svg('<path d="M22 8.2c-.2-1.3-.9-2.1-2.2-2.3C18 5.600 12 5.600 12 5.600s-6 0-7.800.3C2.900 6.100 2.200 6.900 2 8.200 1.800 9.500 1.800 12 1.800 12s0 2.500.2 3.800c.2 1.300.9 2.100 2.200 2.300 1.800.3 7.800.3 7.800.3s6 0 7.800-.3c1.300-.2 2-1 2.200-2.300.2-1.300.2-3.800.2-3.800s0-2.500-.2-3.800z"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'),
  whatsapp: svg('<path d="M3 21l1.6-4.700A8.500 8.500 0 1 1 8 19.500z"/><path d="M9 9.500c.5 2 2.500 4 5 5l1.200-1.200-1.700-1-.8.700c-.8-.4-1.600-1.200-2-2l.7-.8-1-1.700z" fill="currentColor" stroke="none"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  pin: svg('<path d="M12 21s7-6.200 7-12a7 7 0 0 0-14 0c0 5.800 7 12 7 12z"/><circle cx="12" cy="9" r="2.500"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};

const ext = 'target="_blank" rel="noopener noreferrer"';

export default function mount(el) {
  const { store, socials, footer, ui = {} } = config;
  const ig = socials?.instagram || [];
  const yt = socials?.youtube;
  const cols = footer?.columns || [];
  const taglines = store.secondaryTaglines || [];

  const social = [
    ...ig.map((s) => html`<li><a class="footer__social" href="${s.url}" ${raw(ext)} aria-label="${s.label} (Instagram)">${icons.instagram}<span>${s.handle}</span></a></li>`),
    yt ? html`<li><a class="footer__social" href="${yt.url}" ${raw(ext)} aria-label="${yt.label}">${icons.youtube}<span>${yt.handle}</span></a></li>` : "",
  ];

  // contact details come from the API settings; rendered empty-safe, then patched when they arrive
  const contactList = (st) => html`
    <ul class="footer__list" data-footer-contact>
      <li><a href="${waLink("", st.whatsapp || undefined)}" ${raw(ext)}>${icons.whatsapp}<span>${ui.contactWhatsapp}</span></a></li>
      ${st.email ? html`<li><a href="mailto:${st.email}">${icons.mail}<span>${st.email}</span></a></li>` : ""}
      ${st.city ? html`<li><span class="footer__plain">${icons.pin}<span>${st.city}</span></span></li>` : ""}
      ${st.hours ? html`<li><span class="footer__plain">${icons.clock}<span>${st.hours}</span></span></li>` : ""}
    </ul>`;
  const fallbackSettings = settingsNow() || { whatsapp: "", email: store.email, city: store.city, hours: store.hours };
  const contact = contactList(fallbackSettings);

  const column = (title, body, i) => html`
    <details class="footer__col" data-col>
      <summary class="footer__col-title">${title}</summary>
      ${body}
    </details>`;

  const linkCols = cols.map((c, i) => column(c.title, html`<ul class="footer__list">${c.links.map((l) => html`<li><a href="${l.href}">${l.label}</a></li>`)}</ul>`, i));

  renderTemplate(el, html`
    <footer class="footer" data-scene="footer">
      <div class="container footer__inner">
        <div class="footer__brand" data-reveal>
          <p class="footer__name display">${store.name}</p>
          <p class="footer__tagline">${store.tagline}</p>
          <p class="footer__blurb muted">${footer.blurb}</p>
        </div>
        <nav class="footer__cols" aria-label="${ui.footerNav}">
          ${linkCols}
          ${column(ui.footerContact, contact)}
          ${column(ui.footerFollow, html`<ul class="footer__list">${social}</ul>`)}
        </nav>
        <div class="footer__bottom">
          <p class="footer__legal muted">${footer.legal}</p>
          <p class="footer__taglines muted">${taglines.join(" · ")}</p>
        </div>
      </div>
    </footer>`);

  getSettings().then((st) => {
    const list = el.querySelector("[data-footer-contact]");
    if (list) list.outerHTML = String(contactList(st));
  });

  // Desktop: all columns open and non-collapsible. Mobile: accordions, closed.
  const mq = window.matchMedia("(min-width: 800px)");
  const cols$ = [...el.querySelectorAll("[data-col]")];
  const sync = () => cols$.forEach((d) => { d.open = mq.matches; });
  sync();
  mq.addEventListener?.("change", sync);
  cols$.forEach((d) => d.querySelector("summary").addEventListener("click", (e) => { if (mq.matches) e.preventDefault(); }));
}
