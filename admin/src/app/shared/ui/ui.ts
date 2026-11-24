import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shimmer placeholder. `<gd-skeleton width="60%" height="1rem" />`, `shape="circle"`. */
@Component({
  selector: 'gd-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.width]': 'width()', '[style.height]': 'height()', '[style.border-radius]': "shape() === 'circle' ? '50%' : radius()" },
  template: ``,
  styles: `:host { display: block; background: linear-gradient(90deg, var(--p-surface-800) 25%, var(--p-surface-700) 37%, var(--p-surface-800) 63%);
    background-size: 400% 100%; animation: gd-shimmer 1.4s ease infinite; }
    @keyframes gd-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
    @media (prefers-reduced-motion: reduce) { :host { animation: none; } }`,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly radius = input('6px');
  readonly shape = input<'rect' | 'circle'>('rect');
}

export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined;

/** Small status pill. `<gd-tag [value]="'Published'" severity="success" />` (or projected content). */
@Component({
  selector: 'gd-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'gd-tag gd-tag--' + (severity() || 'secondary')", '[class.gd-tag--round]': 'rounded()' },
  template: `{{ value() }}<ng-content />`,
  styles: `:host { display: inline-flex; align-items: center; gap: .25rem; padding: .15rem .5rem; border-radius: 6px; font-size: .75rem;
      font-weight: 600; line-height: 1.3; white-space: nowrap; background: var(--p-surface-700); color: var(--p-surface-100); }
    :host(.gd-tag--round) { border-radius: 999px; }
    :host(.gd-tag--success) { background: #14532d; color: #bbf7d0; }
    :host(.gd-tag--info) { background: #1e3a8a; color: #bfdbfe; }
    :host(.gd-tag--warn) { background: #713f12; color: #fef08a; }
    :host(.gd-tag--danger) { background: #7f1d1d; color: #fecaca; }
    :host(.gd-tag--contrast) { background: var(--p-surface-0); color: var(--p-surface-950); }`,
})
export class Tag {
  readonly value = input<string | number | null | undefined>('');
  readonly severity = input<TagSeverity>('secondary');
  readonly rounded = input(false);
}

export type MessageSeverity = 'success' | 'info' | 'warn' | 'error' | 'secondary';

/** Inline message box (banner). Content is projected. `<gd-message severity="warn">…</gd-message>` */
@Component({
  selector: 'gd-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'gd-message gd-message--' + (severity() || 'info')", role: 'status' },
  template: `<ng-content />`,
  styles: `:host { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem .75rem; padding: .7rem .9rem; border-radius: 10px;
      border: 1px solid var(--p-surface-600); background: var(--p-surface-800); color: var(--p-surface-0); font-size: .92rem; }
    :host(.gd-message--success) { border-color: #166534; background: #052e16; }
    :host(.gd-message--warn) { border-color: #854d0e; background: #2a1d05; }
    :host(.gd-message--error) { border-color: #991b1b; background: #2a0a0a; }
    :host(.gd-message--info) { border-color: #1e40af; background: #0b1530; }`,
})
export class Message {
  readonly severity = input<MessageSeverity>('info');
}
