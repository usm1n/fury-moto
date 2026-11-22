import { config, waLink } from "../core/config.js";
import { html, raw, renderTemplate, esc } from "../core/render.js";
import { icons } from "../components/footer.js";
import { setMeta } from "./about.js";

const ext = 'target="_blank" rel="noopener noreferrer"';

export default function mount(main) {
  const { contact, store, ui = {}, faqs = [] } = config;
  setMeta(contact.title, contact.text);
  const topics = ui.formTopics || [];
  const tel = String(store.phoneDisplay || "").replace(/[^\d+]/g, "");

  const card = (icon, label, value, href, external) => html`
    <li>${href
      ? html`<a class="c-card" href="${href}" ${raw(external ? ext : "")}>${icon}<span><span class="c-card__label muted">${label}</span><strong>${value}</strong></span></a>`
      : html`<div class="c-card">${icon}<span><span class="c-card__label muted">${label}</span><strong>${value}</strong></span></div>`}</li>`;

  const field = (id, label, control) => html`<div class="field"><label for="${id}">${label}</label>${control}<p class="field__err" id="${id}-err" role="alert"></p></div>`;

  renderTemplate(main, html`
    <section class="section contact-head" data-video-slot="shop-header" data-reveal>
      <div class="container stack">
        <p class="eyebrow">${ui.contactEyebrow}</p>
        <h1>${contact.title}</h1>
        <p class="about-hero__intro">${contact.text}</p>
      </div>
    </section>

    <section class="section contact-main">
      <div class="container contact-grid">
        <ul class="c-cards" role="list" data-reveal>
          ${card(icons.whatsapp, ui.contactWhatsapp, store.phoneDisplay, waLink(""), true)}
          ${card(icons.phone, ui.contactPhone, store.phoneDisplay, tel ? `tel:${tel}` : null)}
          ${card(icons.mail, ui.contactEmail, store.email, `mailto:${store.email}`)}
          ${card(icons.pin, ui.contactVisit, `${store.address}, ${store.city}`, null)}
          ${card(icons.clock, ui.contactHours, store.hours, null)}
        </ul>

        <form class="c-form" id="contact-form" novalidate data-reveal aria-labelledby="c-form-title">
          <h2 id="c-form-title">${ui.contactFormTitle}</h2>
          ${field("cf-name", ui.formName, html`<input id="cf-name" name="name" type="text" autocomplete="name" required aria-describedby="cf-name-err">`)}
          ${field("cf-phone", ui.formPhone, html`<input id="cf-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required aria-describedby="cf-phone-err">`)}
          ${field("cf-topic", ui.formTopic, html`<select id="cf-topic" name="topic">${topics.map((t) => html`<option value="${t.id}">${t.label}</option>`)}</select>`)}
          ${field("cf-msg", ui.formMessage, html`<textarea id="cf-msg" name="message" rows="5" required aria-describedby="cf-msg-err"></textarea>`)}
          <button class="btn btn--primary btn--block" type="submit" data-magnetic>${ui.formSend}</button>
          <p class="muted c-form__note">${contact.formNote}</p>
        </form>
      </div>
    </section>

    ${store.mapEmbedUrl ? html`
    <section class="container contact-map" data-reveal>
      <iframe src="${store.mapEmbedUrl}" title="${ui.contactMapTitle}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
    </section>` : ""}

    ${faqs.length ? html`
    <section class="section" data-reveal aria-labelledby="c-faq-title">
      <div class="container c-faq">
        <h2 id="c-faq-title">${ui.contactFaqTitle}</h2>
        ${faqs.map((f) => html`<details class="c-faq__item"><summary>${f.q}</summary><p class="muted">${f.a}</p></details>`)}
      </div>
    </section>` : ""}`);

  const form = main.querySelector("#contact-form");
  const err = (id, msg) => {
    const input = form.querySelector(`#${id}`);
    form.querySelector(`#${id}-err`).textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const name = (v.name || "").trim(), phone = (v.phone || "").trim(), msg = (v.message || "").trim();
    const results = [
      err("cf-name", name.length >= 2 ? "" : ui.formErrorName),
      err("cf-phone", phone.replace(/\D/g, "").length >= 7 ? "" : ui.formErrorPhone),
      err("cf-msg", msg.length >= 3 ? "" : ui.formErrorMessage),
    ];
    if (results.includes(false)) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const topic = topics.find((t) => t.id === v.topic)?.label || v.topic;
    const text = `${ui.formGreeting}\n${ui.formName}: ${name}\n${ui.formPhone}: ${phone}\n${ui.formTopic}: ${topic}\n\n${msg}`;
    const url = waLink(text);
    form.dataset.lastUrl = url;
    window.open(url, "_blank", "noopener,noreferrer");
  });
}
