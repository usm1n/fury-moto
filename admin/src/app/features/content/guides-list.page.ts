import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Skeleton, Tag } from '../../shared/ui/ui';
import { Toast } from '../../shared/ui/toast.service';
import { Api } from '../../api/api';
import { apiAdminGuidesGet } from '../../api/fn/admin-content/api-admin-guides-get';
import { apiAdminGuidesIdPut } from '../../api/fn/admin-content/api-admin-guides-id-put';
import { apiAdminGuidesReorderPost } from '../../api/fn/admin-content/api-admin-guides-reorder-post';
import { AdminGuide } from '../../api/models/admin-guide';
import { problemOf } from '../../core/http';
import { relativeTime } from '../orders/order-helpers';
import { GUIDE_TYPE_SEVERITY, guideTypeLabel, moveItem } from './content-helpers';

@Component({
  selector: 'gd-guides-list.page',
  imports: [FormsModule, RouterLink, CdkDropList, CdkDrag, CdkDragHandle, MatButtonModule, MatIconModule, MatSlideToggleModule, Skeleton, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 820px; }
    .list { display: grid; gap: .5rem; }
    .item { display: flex; align-items: center; gap: .5rem; padding: .5rem .6rem; min-height: 64px;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .item.is-draft .title { opacity: .7; }
    .handle { cursor: grab; color: var(--p-surface-400); min-width: 44px; min-height: 44px; display: grid; place-items: center; touch-action: none; }
    .body { flex: 1; min-width: 0; display: grid; gap: .25rem; color: inherit; text-decoration: none; }
    .title { font-weight: 600; overflow-wrap: anywhere; color: var(--p-surface-0); }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; color: var(--p-surface-400); font-size: .78rem; }
    .pub { display: grid; justify-items: center; gap: .15rem; font-size: .65rem; color: var(--p-surface-400); min-width: 52px; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,.5); border-radius: 12px; background: var(--p-surface-800); }
    .cdk-drag-placeholder { opacity: .3; }
    .cdk-drag-animating { transition: transform 200ms ease; }
    .error { display: grid; gap: .75rem; justify-items: center; }
  `,
  template: `
    <div class="page-head">
      <h1 class="page-title">Guides</h1>
      <a routerLink="/guides/new" mat-flat-button><mat-icon>add</mat-icon>New guide</a>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <mat-icon aria-hidden="true">warning</mat-icon>
        <div>{{ err }}</div>
        <button mat-flat-button type="button" (click)="load()"><mat-icon>refresh</mat-icon>Try again</button>
      </div>
    } @else if (loading()) {
      <div class="list">@for (i of [1, 2, 3, 4]; track i) { <gd-skeleton height="64px" radius="12px" /> }</div>
    } @else if (items().length === 0) {
      <div class="card empty"><p>No guides yet. Guides show on the storefront once published.</p>
        <a routerLink="/guides/new" mat-flat-button><mat-icon>add</mat-icon>Write the first guide</a></div>
    } @else {
      <div class="list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (g of items(); track g.id) {
          <div class="item" [class.is-draft]="!g.isPublished" cdkDrag>
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><mat-icon>drag_indicator</mat-icon></span>
            <a class="body" [routerLink]="['/guides', g.id]">
              <span class="title">{{ g.title }}</span>
              <span class="meta">
                <gd-tag [value]="typeLabel(g.type)" [severity]="sev(g.type)" />
                <span>/{{ g.slug }}</span><span>· updated {{ ago(g.updatedAt) }}</span>
              </span>
            </a>
            <div class="pub"><mat-slide-toggle [ngModel]="g.isPublished" (change)="togglePublish(g, $event.checked)" [aria-label]="'Published: ' + g.title" />{{ g.isPublished ? 'Live' : 'Draft' }}</div>
          </div>
        }
      </div>
      <p class="muted" style="font-size:.8rem;margin-top:.75rem">Drag to set the order shown on the storefront.</p>
    }
  `,
})
export class GuidesListPage implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly items = signal<AdminGuide[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly typeLabel = guideTypeLabel;
  protected readonly sev = (t: AdminGuide['type']) => GUIDE_TYPE_SEVERITY[t ?? 'safety'];
  protected readonly ago = (iso: string | undefined) => relativeTime(iso);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.api.invoke(apiAdminGuidesGet));
    } catch (e) {
      const p = problemOf(e);
      this.error.set(p.detail ?? p.title ?? 'Could not load guides');
    } finally {
      this.loading.set(false);
    }
  }

  protected async togglePublish(g: AdminGuide, on: boolean): Promise<void> {
    this.replace({ ...g, isPublished: on });
    try {
      const saved = await this.api.invoke(apiAdminGuidesIdPut, {
        id: g.id!,
        body: {
          title: g.title!, slug: g.slug, type: g.type!, excerpt: g.excerpt ?? '', body: g.body ?? '', video: g.video, source: g.source,
          relatedProductIds: g.relatedProductIds ?? [], isPublished: on, version: g.version,
        },
      });
      this.replace(saved);
      this.toast.add({ severity: 'success', summary: on ? 'Guide published' : 'Guide set to draft', detail: g.title, life: 2500 });
    } catch (e) {
      this.replace(g);
      const p = problemOf(e);
      if (p.status === 409) {
        this.toast.add({ severity: 'warn', summary: 'Guide changed elsewhere', detail: 'Reloading the list.', life: 4000 });
        void this.load();
      } else {
        this.toast.add({ severity: 'error', summary: 'Could not update', detail: p.detail ?? p.title, life: 6000 });
      }
    }
  }

  protected async drop(e: CdkDragDrop<AdminGuide[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const before = this.items();
    const next = moveItem(before, e.previousIndex, e.currentIndex);
    this.items.set(next);
    try {
      await this.api.invoke(apiAdminGuidesReorderPost, { body: { ids: next.map((x) => x.id!) } });
    } catch (err) {
      this.items.set(before);
      const p = problemOf(err);
      this.toast.add({ severity: 'error', summary: 'Could not save the new order', detail: p.detail ?? p.title, life: 6000 });
    }
  }

  private replace(g: AdminGuide): void { this.items.update((l) => l.map((x) => (x.id === g.id ? g : x))); }
}
