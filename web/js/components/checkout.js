/**
 * Checkout step (cart page): details form + payment + Turnstile -> POST /api/orders -> confirmation.
 *
 *   const co = openCheckout(container, { onBack(), onChanged() });   // co.destroy() when leaving the step
 *
 * - Prices are never sent; the server re-prices. We send expectedTotal (what the shopper saw).
 * - 409 /problems/cart-changed: the returned `cart` is applied to the cart, a "cart:notice" is
 *   emitted and onChanged() fires so the page goes back to the cart step to review.
 * - 400 `errors` are mapped onto the fields (camelCase or PascalCase keys).
 * - Turnstile loads only when this step is shown (explicit render).
 */
import { config, formatPrice } from "../core/config.js";
import { html, renderTemplate } from "../core/render.js";
import { emit } from "../core/bus.js";
import { apiGet, apiPost } from "../data/api.js";
import cart, { productHref } from "../data/cart.js";
import { totalsMarkup } from "./cart-drawer.js";

const ui = config.ui || {};
const PHONE_RE = /^\+?[0-9 \-]{10,16}$/;
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Form values survive a trip back to the cart step (409 review). Cleared after a successful order. */
let draft = { name: "", phone: "", city: "", address: "", notes: "", payment: "" };

let tsPromise = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (tsPromise) return tsPromise;
  tsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => { tsPromise = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return tsPromise;
}

const FIELDS = [
  { id: "name", server: "customerName", max: 80 },
  { id: "phone", server: "phone" },
  { id: "city", server: "city", max: 60 },
  { id: "address", server: "address", max: 300 },
  { id: "notes", server: "notes", max: 500, optional: true },
];
const SERVER_KEY = { customername: "name", phone: "phone", city: "city", address: "address", notes: "notes", paymentmethod: "payment", turnstiletoken: "turnstile" };

function field(f, { label, type = "text", hint, autocomplete, multiline }) {
  const id = `co-${f.id}`;
  const attrs = html`id="${id}" name="${f.id}" autocomplete="${autocomplete || "off"}" aria-describedby="${hint ? `${id}-hint ` : ""}${id}-err"`;
  return html`
    <div class="field" data-field="${f.id}">
      <label for="${id}">${label}</label>
      ${multiline
        ? html`<textarea ${attrs} rows="3" maxlength="${f.max}">${draft[f.id]}</textarea>`
        : html`<input ${attrs} type="${type}" value="${draft[f.id]}"${f.max ? html` maxlength="${f.max}"` : ""}>`}
      ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ""}
      <p class="field__err" id="${id}-err"></p>
    </div>`;
}

export function openCheckout(container, { onBack, onChanged } = {}) {
  let destroyed = false;
  let widgetId = null;
  let token = "";
  let settings = null;
  let busy = false;
  let form = null;

  const status = () => form?.querySelector("[data-status]");

  renderTemplate(container, html`<p class="muted" role="status">${ui.cartChecking}</p>`);

  (async () => {
    try { settings = await apiGet("/api/settings/public"); }
    catch (e) { settings = null; }
    if (destroyed) return;
    renderForm();
  })();

  function setFieldError(id, msg) {
    const wrap = form.querySelector(`[data-field="${id}"]`);
    const input = wrap?.querySelector("input, textarea");
    const err = form.querySelector(`#co-${id}-err`);
    if (err) err.textContent = msg || "";
    if (input) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
  }
  function clearErrors() {
    FIELDS.forEach((f) => setFieldError(f.id, ""));
    const pe = form.querySelector("#co-payment-err"); if (pe) pe.textContent = "";
    const te = form.querySelector("#co-turnstile-err"); if (te) te.textContent = "";
    status().textContent = "";
  }
  function focusFirstInvalid() {
    const el = form.querySelector('[aria-invalid="true"]') || form.querySelector(".field__err:not(:empty)")?.closest("[data-field], fieldset")?.querySelector("input, textarea");
    el?.focus();
  }

  function renderForm() {
    const sum = cart.summary();
    const cod = settings?.codEnabled !== false && !!settings;
    const bank = !!settings?.bankTransferEnabled;
    const methods = [cod && "COD", bank && "BankTransfer"].filter(Boolean);
    if (!methods.includes(draft.payment)) draft.payment = methods[0] || "";
    const sitekey = settings?.turnstileSiteKey || "";

    renderTemplate(container, html`
      <div class="checkout-layout">
        <form class="checkout" novalidate aria-labelledby="co-title">
          <h2 id="co-title" class="checkout__title" tabindex="-1">${ui.coTitle}</h2>
          <div class="checkout__status" role="alert" data-status></div>
          ${!settings || !methods.length ? html`<p class="checkout__paused">${ui.coNoPayment}</p>` : ""}
          <fieldset class="checkout__group" ${methods.length ? "" : "disabled"}>
            <legend class="checkout__legend">${ui.coDetails}</legend>
            ${field(FIELDS[0], { label: ui.coName, autocomplete: "name" })}
            ${field(FIELDS[1], { label: ui.coPhone, type: "tel", hint: ui.coPhoneHint, autocomplete: "tel" })}
            ${field(FIELDS[2], { label: ui.coCity, autocomplete: "address-level2" })}
            ${field(FIELDS[3], { label: ui.coAddress, autocomplete: "street-address", multiline: true })}
            ${field(FIELDS[4], { label: ui.coNotes, multiline: true })}
          </fieldset>
          <fieldset class="checkout__group checkout__pay" ${methods.length ? "" : "disabled"} aria-describedby="co-payment-err">
            <legend class="checkout__legend">${ui.coPayment}</legend>
            ${cod ? html`<label class="pay"><input type="radio" name="payment" value="COD" ${draft.payment === "COD" ? "checked" : ""}><span class="pay__body"><strong>${ui.coCod}</strong><span class="muted">${ui.coCodNote}</span></span></label>` : ""}
            ${bank ? html`<label class="pay"><input type="radio" name="payment" value="BankTransfer" ${draft.payment === "BankTransfer" ? "checked" : ""}><span class="pay__body"><strong>${ui.coBank}</strong><span class="muted">${ui.coBankNote}</span></span></label>` : ""}
            <p class="field__err" id="co-payment-err"></p>
          </fieldset>
          <div class="checkout__ts" data-ts-wrap ${sitekey ? "" : "hidden"}>
            <p class="checkout__ts-label">${ui.coSecurity}</p>
            <div data-turnstile></div>
            <p class="field__err" id="co-turnstile-err"></p>
          </div>
          <button type="submit" class="btn btn--primary btn--block" data-submit ${methods.length ? "" : "disabled"}>${ui.coPlace} · ${formatPrice(sum.total)}</button>
          <button type="button" class="checkout__back" data-back>${ui.coBack}</button>
        </form>
        <aside class="cart-summary" aria-labelledby="co-sum-title">
          <h2 id="co-sum-title" class="cart-summary__title">${ui.coItems}</h2>
          <ul class="co-items">
            ${sum.items.filter((l) => l.purchasable).map((l) => html`
              <li class="co-item">
                <a href="${productHref(l.slug)}">${l.title || l.slug}</a>
                <span class="muted">${[l.size, l.color].filter(Boolean).join(" · ")} × ${l.qty}</span>
                <span class="price">${formatPrice(l.lineTotal)}</span>
              </li>`)}
          </ul>
          ${totalsMarkup(sum)}
        </aside>
      </div>`);

    form = container.querySelector("form.checkout");
    form.querySelector("#co-title").focus({ preventScroll: false });

    form.addEventListener("input", (e) => {
      const t = e.target;
      if (t.name && t.name in draft) draft[t.name] = t.value;
      if (t.closest("[data-field]")) setFieldError(t.closest("[data-field]").dataset.field, "");
    });
    form.addEventListener("change", (e) => { if (e.target.name === "payment") draft.payment = e.target.value; });
    form.querySelector("[data-back]").addEventListener("click", () => onBack?.());
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });

    if (sitekey) mountTurnstile(sitekey);
  }

  async function mountTurnstile(sitekey) {
    const host = form.querySelector("[data-turnstile]");
    try {
      const ts = await loadTurnstile();
      if (destroyed || !host.isConnected) return;
      widgetId = ts.render(host, {
        sitekey,
        theme: "dark",
        callback: (t) => { token = t; const te = form.querySelector("#co-turnstile-err"); if (te) te.textContent = ""; },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      });
    } catch {
      const te = form.querySelector("#co-turnstile-err");
      if (te) te.textContent = ui.coTurnstileFail;
    }
  }
  function resetTurnstile() {
    token = "";
    try { if (widgetId != null) window.turnstile?.reset(widgetId); } catch {}
  }

  function clientValidate() {
    let ok = true;
    const bad = (id, msg) => { setFieldError(id, msg); ok = false; };
    const v = (id) => (draft[id] || "").trim();
    if (!v("name")) bad("name", ui.coRequired);
    if (!v("phone")) bad("phone", ui.coRequired); else if (!PHONE_RE.test(v("phone"))) bad("phone", ui.coPhoneInvalid);
    if (!v("city")) bad("city", ui.coRequired);
    if (!v("address")) bad("address", ui.coRequired);
    if (!draft.payment) { form.querySelector("#co-payment-err").textContent = ui.coRequired; ok = false; }
    return ok;
  }

  function setBusy(b) {
    busy = b;
    const btn = form.querySelector("[data-submit]");
    btn.disabled = b;
    btn.setAttribute("aria-busy", String(b));
    btn.textContent = b ? ui.coPlacing : `${ui.coPlace} · ${formatPrice(cart.summary().total)}`;
  }

  async function submit() {
    if (busy) return;
    clearErrors();
    const okFields = clientValidate();
    const needsToken = !!settings?.turnstileSiteKey;
    if (needsToken && !token) {
      form.querySelector("#co-turnstile-err").textContent = ui.coTurnstileNeeded;
    }
    if (!okFields || (needsToken && !token)) {
      status().textContent = ui.coErrorSummary;
      if (okFields) form.querySelector("[data-turnstile] iframe, [data-turnstile]")?.focus?.();
      else focusFirstInvalid();
      return;
    }
    const sum = cart.summary();
    if (sum.blocked || !sum.items.length) { onChanged?.(); return; }

    setBusy(true);
    try {
      const res = await apiPost("/api/orders", {
        customerName: draft.name.trim(),
        phone: draft.phone.trim(),
        city: draft.city.trim(),
        address: draft.address.trim(),
        notes: draft.notes.trim() || null,
        paymentMethod: draft.payment,
        lines: sum.items.map((l) => ({ slug: l.slug, size: l.size, color: l.color, quantity: l.qty })),
        expectedTotal: sum.total,
        turnstileToken: token,
      });
      draft = { name: "", phone: "", city: "", address: "", notes: "", payment: draft.payment };
      cart.clear();
      showConfirmation(res);
    } catch (e) {
      handleError(e);
    }
  }

  function handleError(e) {
    resetTurnstile();
    setBusy(false);
    if (e?.status === 409 && e.problem?.cart) {
      const changes = cart.applyServer(e.problem.cart);
      emit("cart:notice", { changes: [ui.coCartChanged, ...changes] });
      onChanged?.();
      return;
    }
    if (e?.status === 400 && e.problem?.errors) {
      let focus = null;
      const general = [];
      for (const [k, msgs] of Object.entries(e.problem.errors)) {
        const id = SERVER_KEY[String(k).replace(/\[.*$/, "").toLowerCase()];
        const msg = [].concat(msgs).join(" ");
        if (id === "turnstile") form.querySelector("#co-turnstile-err").textContent = msg;
        else if (id === "payment") form.querySelector("#co-payment-err").textContent = msg;
        else if (id) { setFieldError(id, msg); focus ||= id; }
        else general.push(msg);
      }
      status().textContent = [ui.coErrorSummary, ...general].join(" ");
      focusFirstInvalid();
      return;
    }
    status().textContent = e?.status === 429 ? ui.coRateLimit : e?.isNetwork ? (e.title + " " + e.detail) : ui.coGenericError;
    status().scrollIntoView({ block: "nearest" });
  }

  function showConfirmation(res) {
    destroy(true);
    const url = res.whatsappUrl || "";
    renderTemplate(container, html`
      <section class="co-done" aria-labelledby="co-done-title">
        <h2 id="co-done-title" class="co-done__title" tabindex="-1">${ui.coDoneTitle}</h2>
        <dl class="co-done__facts">
          <div><dt>${ui.coDoneNumber}</dt><dd class="co-done__num" data-order-number>${res.orderNumber}</dd></div>
          <div><dt>${ui.coDoneTotal}</dt><dd class="price">${formatPrice(res.total)}</dd></div>
        </dl>
        <h3 class="co-done__sub">${ui.coNextTitle}</h3>
        <ol class="co-done__steps"><li>${ui.coNext1}</li><li>${ui.coNext2}</li><li>${ui.coNext3}</li></ol>
        <div class="co-done__actions">
          ${url ? html`<a class="btn btn--primary" data-wa-order href="${url}" target="_blank" rel="noopener">${ui.coSendWa}</a>` : ""}
          <a class="btn btn--ghost" href="shop.html">${ui.coContinue}</a>
        </div>
        <div class="co-done__fallback" data-fallback hidden>
          <p>${ui.coWaFallback}</p>
          <textarea readonly rows="8" data-msg>${res.whatsappMessage || ""}</textarea>
          <button type="button" class="btn btn--ghost" data-copy>${ui.coCopy}</button>
          <span class="co-done__copied" role="status" data-copied></span>
        </div>
      </section>`);
    const root = container.querySelector(".co-done");
    root.querySelector("#co-done-title").focus();

    // Try to open WhatsApp straight away. Popup blockers may refuse (we're past the click's gesture); then show the text.
    let opened = false;
    if (url) { try { const w = window.open(url, "_blank"); if (w) { w.opener = null; opened = true; } } catch {} }
    if (!opened && res.whatsappMessage) root.querySelector("[data-fallback]").hidden = false;

    root.querySelector("[data-copy]").addEventListener("click", async () => {
      const ta = root.querySelector("[data-msg]");
      const done = root.querySelector("[data-copied]");
      let ok = false;
      try { await navigator.clipboard.writeText(ta.value); ok = true; } catch {}
      if (!ok) { ta.focus(); ta.select(); try { ok = document.execCommand("copy"); } catch {} }
      done.textContent = ok ? ui.coCopied : "";
      if (!ok) ta.select();
    });
  }

  function destroy(keepDom) {
    destroyed = true;
    try { if (widgetId != null) window.turnstile?.remove(widgetId); } catch {}
    widgetId = null;
    if (!keepDom) container.textContent = "";
  }

  return { destroy };
}

export default openCheckout;
