/** Pure helpers shared by the content screens (unit-tested in content-helpers.spec.ts). */
import { slugify } from '../../core/format';
import { GuideType } from '../../api/models/guide-type';

export const GUIDE_TYPES: { label: string; value: GuideType }[] = [
  { label: 'Safety', value: 'safety' },
  { label: 'Buying guide', value: 'buying' },
  { label: 'Myth buster', value: 'myth' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Riding', value: 'riding' },
];
export const guideTypeLabel = (t: string | undefined): string => GUIDE_TYPES.find((x) => x.value === t)?.label ?? (t ?? '');
export const GUIDE_TYPE_SEVERITY: Record<GuideType, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
  safety: 'danger', buying: 'info', myth: 'warn', maintenance: 'success', riding: 'secondary',
};

export const MAX_RELATED = 8;
export const COVER_MAX_PX = 1600;

export interface TextEdit { text: string; start: number; end: number }
export type MdTool = 'h2' | 'bold' | 'list' | 'link';

/** Apply a toolbar action to `text` with selection [start, end]; returns new text and the selection to restore. */
export function applyMdTool(text: string, start: number, end: number, tool: MdTool): TextEdit {
  const sel = text.slice(start, end);
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  switch (tool) {
    case 'bold': {
      const inner = sel || 'bold text';
      return { text: `${text.slice(0, start)}**${inner}**${text.slice(end)}`, start: start + 2, end: start + 2 + inner.length };
    }
    case 'link': {
      const label = sel || 'link text';
      const url = 'https://';
      const head = `${text.slice(0, start)}[${label}](`;
      return { text: `${head}${url})${text.slice(end)}`, start: head.length, end: head.length + url.length };
    }
    case 'h2': {
      if (text.startsWith('## ', lineStart)) return { text, start, end };
      return { text: `${text.slice(0, lineStart)}## ${text.slice(lineStart)}`, start: start + 3, end: end + 3 };
    }
    case 'list': {
      const i = text.indexOf('\n', end);
      const blockEnd = i === -1 ? text.length : i;
      const block = text.slice(lineStart, blockEnd);
      const out = block.split('\n').map((l) => (/^\s*[-*]\s/.test(l) ? l : `- ${l}`)).join('\n');
      return { text: text.slice(0, lineStart) + out + text.slice(blockEnd), start: lineStart, end: lineStart + out.length };
    }
  }
}

/** Slug derived from the title (used until the slug is edited by hand). */
export const autoSlug = (title: string): string => slugify(title).slice(0, 80);

/** Pure array move (returns a copy). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/** Where an audit entry's entity should link to in the admin, or null. */
export function auditLink(entity: string | undefined, id: string | null | undefined): string[] | null {
  if (!id || !/^\d+$/.test(id)) return null;
  switch ((entity ?? '').toLowerCase()) {
    case 'product': return ['/products', id];
    case 'order': return ['/orders', id];
    case 'guide': return ['/guides', id];
    default: return null;
  }
}

export const AUDIT_ENTITIES = ['Product', 'Order', 'Guide', 'Category', 'Brand', 'Faq', 'Testimonial', 'Settings', 'Auth'];

export function auditActionSeverity(action: string | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  const verb = (action ?? '').split('.').pop() ?? '';
  if (verb === 'delete' || verb === 'login-failed') return 'danger';
  if (verb === 'create' || verb === 'publish') return 'success';
  if (verb === 'update' || verb === 'stock' || verb === 'status') return 'info';
  if (verb === 'unpublish' || verb === 'password-change') return 'warn';
  return 'secondary';
}

/** Count shown on the Home badge. */
export const stockAlertCount = (a: { lowStock?: number; soldOut?: number } | null | undefined): number => (a?.lowStock ?? 0) + (a?.soldOut ?? 0);
