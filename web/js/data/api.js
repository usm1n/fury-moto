/**
 * Storefront API client. The ONLY module that talks to /api (same origin in production
 * and in local dev via tools/dev-server.mjs). Everything else goes through
 * js/data/products.js and js/data/cart.js.
 *
 *   import { apiGet, apiPost, ApiError } from "./api.js";
 *   const page = await apiGet("/api/products", { category: "helmets", page: 1 });
 *
 * - GETs are memoised per URL for the page's lifetime (the CDN caches for 60 s anyway).
 * - Errors throw ApiError { status, title, detail, problem } (RFC 9457 ProblemDetails).
 * - status 0 = network/timeout → callers show the "can't reach the store" state + retry.
 */
const TIMEOUT_MS = 12000;
const memo = new Map();

export class ApiError extends Error {
  constructor(status, problem = {}) {
    super(problem.title || (status ? `Request failed (${status})` : "Can't reach the store"));
    this.name = "ApiError";
    this.status = status;
    this.title = problem.title || this.message;
    this.detail = problem.detail || "";
    this.problem = problem;
  }
  get isNetwork() { return this.status === 0; }
}

const qs = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    u.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
};

async function request(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, { title: "Can't reach the store", detail: "Check your connection and try again." });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, data || {});
  return data;
}

/** GET with per-page memoisation. Pass { fresh: true } to bypass the memo. */
export function apiGet(path, params, { fresh = false } = {}) {
  const url = path + qs(params);
  if (!fresh && memo.has(url)) return memo.get(url);
  const p = request("GET", url).catch((e) => { memo.delete(url); throw e; });
  memo.set(url, p);
  return p;
}

export const apiPost = (path, body) => request("POST", path, body);
