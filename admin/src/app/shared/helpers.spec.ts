import { buildMatrix, chipsFromRows, normalizeHex, uniqueChips, VariantRow } from './variant-matrix';
import { fitWithin } from './image-tools';
import { slugify } from '../core/format';

const row = (o: Partial<VariantRow>): VariantRow => ({ id: null, size: 'M', color: 'Black', colorHex: null, sku: '', stock: 0, isActive: true, priceOverride: null, version: null, ...o });

describe('variant matrix', () => {
  it('builds size x colour rows', () => {
    const rows = buildMatrix(['S', 'M'], [{ name: 'Black', hex: '#000000' }, { name: 'Red', hex: '#ff0000' }], []);
    expect(rows.map((r) => `${r.size}/${r.color}`)).toEqual(['S/Black', 'S/Red', 'M/Black', 'M/Red']);
    expect(rows.every((r) => r.id === null && r.stock === 0 && r.isActive)).toBe(true);
  });
  it('keeps existing rows and drops removed combos', () => {
    const existing = [row({ id: 7, size: 'm', color: 'black', sku: 'X-M-BLK', stock: 5, version: 'v1' }), row({ id: 8, size: 'XL', color: 'Black' })];
    const rows = buildMatrix(['M'], [{ name: 'Black', hex: null }], existing);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 7, sku: 'X-M-BLK', stock: 5, version: 'v1', size: 'M', color: 'Black' });
  });
  it('falls back to defaults when no chips', () => {
    const rows = buildMatrix([], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].size).toBe('One size');
  });
  it('dedupes chips case-insensitively', () => {
    expect(uniqueChips(['M', ' m ', 'L', ''])).toEqual(['M', 'L']);
  });
  it('recovers chips from rows', () => {
    const c = chipsFromRows([row({ size: 'S', color: 'Red', colorHex: '#f00000' }), row({ size: 'M', color: 'Red' }), row({ size: 'L', color: 'Blue', isActive: false })]);
    expect(c.sizes).toEqual(['S', 'M']);
    expect(c.colors).toEqual([{ name: 'Red', hex: '#f00000' }]);
  });
  it('normalizes hex', () => {
    expect(normalizeHex('FF00AA')).toBe('#ff00aa');
    expect(normalizeHex('#12')).toBeNull();
  });
});

describe('image size math', () => {
  it('scales the longest side to the max', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000, 480)).toEqual({ width: 240, height: 480 });
  });
  it('never upscales', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe('slug', () => {
  it('slugifies like the API', () => {
    expect(slugify('AGV Pista GP RR - Carbon!')).toBe('agv-pista-gp-rr-carbon');
    expect(slugify('  Cafe  Racer ')).toBe('cafe-racer');
  });
});
