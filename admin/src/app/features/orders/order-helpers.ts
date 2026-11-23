import { Order } from '../../api/models/order';
import { OrderStatus } from '../../api/models/order-status';
import { formatPkr } from '../../core/format';

export const ORDER_STATUSES: OrderStatus[] = ['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

export type TagSeverity = 'info' | 'warn' | 'success' | 'danger' | 'secondary' | 'contrast';

export const STATUS_SEVERITY: Record<OrderStatus, TagSeverity> = {
  New: 'info', Confirmed: 'warn', Shipped: 'contrast', Delivered: 'success', Cancelled: 'danger',
};

export interface NextAction { status: OrderStatus; label: string; severity: 'primary' | 'danger'; }

/** Valid next statuses for an order (New→Confirm/Cancel, Confirmed→Ship/Cancel, Shipped→Delivered/Cancel). */
export function nextActions(status: OrderStatus | undefined): NextAction[] {
  switch (status) {
    case 'New': return [{ status: 'Confirmed', label: 'Confirm order', severity: 'primary' }, { status: 'Cancelled', label: 'Cancel order', severity: 'danger' }];
    case 'Confirmed': return [{ status: 'Shipped', label: 'Mark shipped', severity: 'primary' }, { status: 'Cancelled', label: 'Cancel order', severity: 'danger' }];
    case 'Shipped': return [{ status: 'Delivered', label: 'Mark delivered', severity: 'primary' }, { status: 'Cancelled', label: 'Cancel order', severity: 'danger' }];
    default: return [];
  }
}

/** "5 min ago", "3 h ago", "2 d ago", otherwise a short date. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const paymentLabel = (m: string | undefined): string =>
  m === 'COD' ? 'Cash on delivery' : m === 'BankTransfer' ? 'Bank transfer' : (m ?? '');

/** Plain-text packing slip (copied to clipboard / shown in print view). */
export function packingSlipText(o: Order): string {
  const cod = o.paymentMethod === 'COD';
  const lines = [
    `PACKING SLIP - ${o.orderNumber}`,
    '',
    `Customer: ${o.customerName}`,
    `Phone: ${o.phone}`,
    `Address: ${o.address}, ${o.city}`,
  ];
  if (o.notes) lines.push(`Notes: ${o.notes}`);
  lines.push('', 'Items:');
  for (const i of o.items ?? []) lines.push(`- ${i.quantity} x ${i.title} (${i.size} / ${i.color}) - ${formatPkr(i.lineTotal)}`);
  lines.push('', `Subtotal: ${formatPkr(o.subtotal)}`, `Delivery: ${formatPkr(o.deliveryFee)}`, `Total: ${formatPkr(o.total)}`,
    `Payment: ${paymentLabel(o.paymentMethod)}`, `COD amount: ${cod ? formatPkr(o.total) : 'Rs 0 (prepaid)'}`);
  return lines.join('\n');
}

/** Items short of stock from a 409 /problems/out-of-stock body. */
export interface ShortItem { variantId: number; title: string; size: string; color: string; requested: number; available: number; productId?: number }
export function shortItems(problem: Record<string, unknown> | null | undefined, order: Order | null): ShortItem[] {
  const raw = Array.isArray(problem?.['items']) ? problem['items'] as ShortItem[] : [];
  return raw.map((s) => ({ ...s, productId: order?.items?.find((i) => i.variantId === s.variantId)?.productId }));
}
