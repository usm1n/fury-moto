/**
 * Public store settings (GET /api/settings/public), cached for the page's lifetime.
 * config.store values are only a fallback when the API is unreachable.
 *
 *   const s = await getSettings();        // { whatsapp, phoneDisplay, email, city, address, hours, deliveryFee, codEnabled, ... }
 *   const href = await whatsappLink(msg); // wa.me link using the settings number
 *   settingsNow()                         // cached value or null (sync, for non-async renderers)
 */
import { config, waLink, isPlaceholder } from "../core/config.js";
import { apiGet } from "./api.js";

let cached = null;
let pending = null;

const real = (v) => (isPlaceholder(v) ? "" : String(v ?? "").trim());

function fromConfig() {
  const s = config.store || {};
  return {
    whatsapp: real(s.whatsapp).replace(/\D/g, ""),
    phoneDisplay: real(s.phoneDisplay),
    email: real(s.email),
    city: real(s.city),
    address: real(s.address),
    hours: real(s.hours),
    deliveryFee: 0,
    codEnabled: !!s.cashOnDelivery,
    bankTransferEnabled: false,
    fallback: true,
  };
}

function adapt(d) {
  const str = (v) => (v == null ? "" : String(v).trim());
  return {
    whatsapp: str(d.whatsappNumber).replace(/\D/g, ""),
    phoneDisplay: str(d.phoneDisplay),
    email: str(d.email),
    city: str(d.city),
    address: str(d.address),
    hours: str(d.hours),
    deliveryFee: Number(d.deliveryFee) || 0,
    codEnabled: !!d.codEnabled,
    bankTransferEnabled: !!d.bankTransferEnabled,
    turnstileSiteKey: d.turnstileSiteKey || "",
    fallback: false,
  };
}

export function settingsNow() { return cached; }

export function getSettings() {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = apiGet("/api/settings/public")
      .then((d) => (cached = adapt(d || {})))
      .catch(() => (cached = fromConfig()));
  }
  return pending;
}

/** wa.me link using the settings number (falls back to config when the API is down). */
export async function whatsappLink(message = "") {
  const s = await getSettings();
  return waLink(message, s.whatsapp || undefined);
}
