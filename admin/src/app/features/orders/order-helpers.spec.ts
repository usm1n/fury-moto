import { Order } from '../../api/models/order';
import { nextActions, packingSlipText, relativeTime, shortItems } from './order-helpers';

const order: Order = {
  id: 1, orderNumber: 'GD-1001', customerName: 'Ali Khan', phone: '03001234567', city: 'Lahore', address: '12 Mall Road',
  notes: 'Call first', subtotal: 9000, deliveryFee: 300, total: 9300, paymentMethod: 'COD', status: 'New',
  items: [{ productId: 5, variantId: 9, title: 'Helmet', size: 'L', color: 'Black', quantity: 2, unitPrice: 4500, lineTotal: 9000 }],
};

describe('order helpers', () => {
  it('offers only valid next statuses', () => {
    expect(nextActions('New').map((a) => a.status)).toEqual(['Confirmed', 'Cancelled']);
    expect(nextActions('Confirmed').map((a) => a.status)).toEqual(['Shipped', 'Cancelled']);
    expect(nextActions('Shipped').map((a) => a.status)).toEqual(['Delivered', 'Cancelled']);
    expect(nextActions('Delivered')).toEqual([]);
    expect(nextActions('Cancelled')).toEqual([]);
  });
  it('builds the packing slip', () => {
    const t = packingSlipText(order);
    expect(t).toContain('GD-1001');
    expect(t).toContain('Address: 12 Mall Road, Lahore');
    expect(t).toContain('2 x Helmet (L / Black)');
    expect(t).toContain('COD amount: Rs 9,300');
  });
  it('shows zero COD for bank transfer', () => {
    expect(packingSlipText({ ...order, paymentMethod: 'BankTransfer' })).toContain('COD amount: Rs 0');
  });
  it('formats relative time', () => {
    const now = new Date('2026-01-10T12:00:00Z').getTime();
    expect(relativeTime('2026-01-10T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-01-10T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-01-10T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-01-08T12:00:00Z', now)).toBe('2 d ago');
  });
  it('maps short items to products', () => {
    const s = shortItems({ items: [{ variantId: 9, title: 'Helmet', size: 'L', color: 'Black', requested: 2, available: 1 }] }, order);
    expect(s[0].productId).toBe(5);
    expect(shortItems(null, order)).toEqual([]);
  });
});
