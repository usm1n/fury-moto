import { ChangeDetectionStrategy, Component, DestroyRef, inject, model, signal } from '@angular/core';
import { AssetUrlPipe } from '../../shared/asset-url.pipe';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { Subject, debounceTime } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Api } from '../../api/api';
import { apiAdminProductsGet } from '../../api/fn/admin-products/api-admin-products-get';
import { AdminProductRow } from '../../api/models/admin-product-row';
import { MAX_RELATED, moveItem } from './content-helpers';

export interface RelatedItem { id: number; title: string; thumbUrl?: string | null }

/** Related-products picker: search the admin catalogue, add up to 8 chips, drag to reorder. */
@Component({
  selector: 'gd-guide-related',
  imports: [AssetUrlPipe, FormsModule, CdkDropList, CdkDrag, CdkDragHandle, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .search { position: relative; }
    .search i { position: absolute; left: .8rem; top: 50%; transform: translateY(-50%); color: var(--p-surface-400); }
    .search input { width: 100%; min-height: 44px; padding-left: 2.3rem; }
    .results { display: grid; gap: .3rem; margin-top: .5rem; }
    .res { display: flex; align-items: center; gap: .6rem; min-height: 48px; padding: .3rem .6rem; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
      background: var(--p-surface-950); border: 1px solid var(--p-surface-700); border-radius: 10px; }
    .res:disabled { opacity: .45; cursor: default; }
    .thumb { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; background: var(--p-surface-800); flex: none; }
    .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .chips { display: grid; gap: .4rem; margin-top: .75rem; }
    .chip { display: flex; align-items: center; gap: .4rem; min-height: 52px; padding: .25rem .4rem; background: var(--p-surface-950); border: 1px solid var(--p-surface-600); border-radius: 10px; }
    .handle { cursor: grab; color: var(--p-surface-400); min-width: 44px; min-height: 44px; display: grid; place-items: center; touch-action: none; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,.5); border-radius: 10px; background: var(--p-surface-800); }
    .cdk-drag-placeholder { opacity: .3; }
    .hint { color: var(--p-surface-400); font-size: .75rem; }
  `,
  template: `
    <div class="search">
      <i class="pi pi-search"></i>
      <input pInputText type="search" placeholder="Search products to add" aria-label="Search products to add" [ngModel]="q()" (ngModelChange)="onQ($event)"
        [disabled]="items().length >= max" autocomplete="off" />
    </div>
    @if (items().length >= max) { <p class="hint">Maximum of {{ max }} related products reached.</p> }
    @if (searching()) { <p class="hint">Searching...</p> }
    @else if (searchError()) { <p class="field-error">{{ searchError() }}</p> }
    @else if (q().trim() && results().length === 0) { <p class="hint">No products match.</p> }
    @if (results().length) {
      <div class="results">
        @for (r of results(); track r.id) {
          <button type="button" class="res" [disabled]="has(r.id!) || items().length >= max" (click)="add(r)">
            @if (r.thumbUrl) { <img class="thumb" [src]="r.thumbUrl | assetUrl" alt="" loading="lazy" /> } @else { <span class="thumb"></span> }
            <span class="grow">{{ r.title }}<br /><small class="hint">{{ r.brand }} · {{ r.status }}</small></span>
            <i class="pi" [class.pi-check]="has(r.id!)" [class.pi-plus]="!has(r.id!)"></i>
          </button>
        }
      </div>
    }
    @if (items().length) {
      <div class="chips" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (it of items(); track it.id) {
          <div class="chip" cdkDrag>
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><i class="pi pi-bars"></i></span>
            @if (it.thumbUrl) { <img class="thumb" [src]="it.thumbUrl | assetUrl" alt="" /> } @else { <span class="thumb"></span> }
            <span class="grow">{{ it.title }}</span>
            <button pButton type="button" class="p-button-text" severity="danger" [attr.aria-label]="'Remove ' + it.title" (click)="remove(it.id)"><span pButtonIcon class="pi pi-times"></span></button>
          </div>
        }
      </div>
    } @else {
      <p class="hint" style="margin-top:.6rem">No related products. Pick up to {{ max }}; they show under the guide on the storefront (published ones only).</p>
    }
  `,
})
export class GuideRelated {
  private readonly api = inject(Api);

  readonly items = model.required<RelatedItem[]>();

  protected readonly max = MAX_RELATED;
  protected readonly q = signal('');
  protected readonly results = signal<AdminProductRow[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal<string | null>(null);
  private readonly search$ = new Subject<string>();
  private seq = 0;

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(inject(DestroyRef))).subscribe((q) => void this.run(q));
  }

  protected has(id: number): boolean { return this.items().some((i) => i.id === id); }

  protected onQ(v: string): void {
    this.q.set(v);
    if (!v.trim()) { this.seq++; this.results.set([]); this.searching.set(false); return; }
    this.search$.next(v.trim());
  }

  private async run(q: string): Promise<void> {
    const mine = ++this.seq;
    this.searching.set(true);
    this.searchError.set(null);
    try {
      const page = await this.api.invoke(apiAdminProductsGet, { q, pageSize: 8 });
      if (mine === this.seq) this.results.set(page.items ?? []);
    } catch {
      if (mine === this.seq) this.searchError.set('Search failed. Try again.');
    } finally {
      if (mine === this.seq) this.searching.set(false);
    }
  }

  protected add(r: AdminProductRow): void {
    if (this.has(r.id!) || this.items().length >= MAX_RELATED) return;
    this.items.update((l) => [...l, { id: r.id!, title: r.title ?? `Product #${r.id}`, thumbUrl: r.thumbUrl }]);
  }
  protected remove(id: number): void { this.items.update((l) => l.filter((i) => i.id !== id)); }
  protected drop(e: CdkDragDrop<RelatedItem[]>): void {
    if (e.previousIndex !== e.currentIndex) this.items.update((l) => moveItem(l, e.previousIndex, e.currentIndex));
  }
}
