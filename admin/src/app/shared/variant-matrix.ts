/** Pure helpers for the size x colour variant grid. */

export interface ColorChip { name: string; hex: string | null }

export interface VariantRow {
  id: number | null;
  size: string;
  color: string;
  colorHex: string | null;
  sku: string;
  stock: number;
  isActive: boolean;
  priceOverride: number | null;
  version: string | null;
}

export const DEFAULT_SIZE = 'One size';
export const DEFAULT_COLOR = 'Standard';

const norm = (s: string): string => s.trim().toLowerCase();
export const variantKey = (size: string, color: string): string => `${norm(size)}|${norm(color)}`;

/** Trim, drop blanks and case-insensitive duplicates, keep first spelling and order. */
export function uniqueChips(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t && !seen.has(norm(t))) { seen.add(norm(t)); out.push(t); }
  }
  return out;
}

/**
 * Size x colour matrix. Rows that already exist (matched by size+colour, case-insensitive) keep their
 * id/sku/stock/version; new combinations start at stock 0, active. Rows whose combination is gone are
 * dropped (the API deactivates absent rows). No sizes / no colours fall back to a single default.
 */
export function buildMatrix(sizes: readonly string[], colors: readonly ColorChip[], existing: readonly VariantRow[]): VariantRow[] {
  const sz = sizes.length ? sizes : [DEFAULT_SIZE];
  const cl = colors.length ? colors : [{ name: DEFAULT_COLOR, hex: null }];
  const byKey = new Map(existing.map((r) => [variantKey(r.size, r.color), r]));
  const rows: VariantRow[] = [];
  for (const size of sz) {
    for (const c of cl) {
      const prev = byKey.get(variantKey(size, c.name));
      rows.push(prev
        ? { ...prev, size, color: c.name, colorHex: c.hex ?? prev.colorHex }
        : { id: null, size, color: c.name, colorHex: c.hex, sku: '', stock: 0, isActive: true, priceOverride: null, version: null });
    }
  }
  return rows;
}

/** Recover the chip lists from saved rows (only active rows; default placeholders are not chips). */
export function chipsFromRows(rows: readonly VariantRow[]): { sizes: string[]; colors: ColorChip[] } {
  const active = rows.filter((r) => r.isActive);
  const sizes = uniqueChips(active.map((r) => r.size)).filter((s) => s !== DEFAULT_SIZE);
  const colors: ColorChip[] = [];
  for (const r of active) {
    if (r.color === DEFAULT_COLOR && !r.colorHex) continue;
    if (!colors.some((c) => norm(c.name) === norm(r.color))) colors.push({ name: r.color, hex: r.colorHex });
  }
  return { sizes, colors };
}

export const normalizeHex = (hex: string): string | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
};

const COLOR_HEX: Record<string, string> = {
  black: '#111111', 'matte black': '#1c1c1c', 'gloss black': '#0a0a0a', carbon: '#2b2b2b', white: '#f5f5f5',
  red: '#d32f2f', blue: '#1e66d0', 'navy': '#14213d', 'navy blue': '#14213d', green: '#2e7d32', yellow: '#f9d71c',
  orange: '#f57c00', grey: '#8a8a8a', gray: '#8a8a8a', silver: '#c0c0c0', 'matte grey': '#6b6b6b', 'matte gray': '#6b6b6b',
  fluo: '#d4ff00', 'fluo yellow': '#d4ff00', 'hi-vis yellow': '#d4ff00', 'hi vis yellow': '#d4ff00', 'hi-viz yellow': '#d4ff00',
  brown: '#6d4c41', tan: '#c8a97e', pink: '#ec407a', purple: '#7b1fa2', gold: '#d4af37',
};

/** Sensible swatch for a well-known colour name, or null when unknown (caller keeps its default). */
export function colorHexForName(name: string): string | null {
  return COLOR_HEX[name.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}
