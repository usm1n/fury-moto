/** Shared formatting helpers (money is integer PKR everywhere). */
const pkr = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

export const formatPkr = (n: number | null | undefined): string => `Rs ${pkr.format(n ?? 0)}`;

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** "AGV Pista GP RR — Carbon!" → "agv-pista-gp-rr-carbon" (same rule as the API's Slugs.From). */
export const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Storefront origin (same domain in production; the storefront dev server in development). */
export const storefrontUrl = (path = ''): string => `${location.origin}/${path.replace(/^\//, '')}`;

/** API image URLs may arrive relative ("assets/img/x.jpg"); under <base href="/admin/"> those would 404, so root them. */
export const assetUrl = (u: string | null | undefined): string => {
  if (!u) return '';
  return /^(https?:|data:|blob:|\/)/i.test(u) ? u : '/' + u;
};
