import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminProductsGet } from '../../api/fn/admin-products/api-admin-products-get';
import { apiAdminProductsIdPublishPost } from '../../api/fn/admin-products/api-admin-products-id-publish-post';
import { apiAdminProductsIdUnpublishPost } from '../../api/fn/admin-products/api-admin-products-id-unpublish-post';
import { apiAdminCategoriesGet } from '../../api/fn/admin-catalog/api-admin-categories-get';
import { apiAdminBrandsGet } from '../../api/fn/admin-catalog/api-admin-brands-get';
import { AdminProductRow } from '../../api/models/admin-product-row';
import { ProductStatus } from '../../api/models/product-status';
import { formatDate, formatPkr } from '../../core/format';
import { problemOf } from '../../core/http';

interface Option { label: string; value: number | string | null }

const STATUS_OPTIONS: Option[] = [
  { label: 'All statuses', value: null },
  { label: 'Draft', value: 'Draft' },
  { label: 'Published', value: 'Published' },
  { label: 'Archived', value: 'Archived' },
];

@Component({
  selector: 'gd-products-list.page',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule, SkeletonModule, PaginatorModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: 1rem; }
    .filters .search { grid-column: 1 / -1; position: relative; }
    .filters .search i { position: absolute; left: .8rem; top: 50%; transform: translateY(-50%); color: var(--p-surface-400); }
    .filters .search input { width: 100%; padding-left: 2.3rem; min-height: 44px; }
    .filters p-select { width: 100%; }
    @media (min-width: 760px) { .filters { grid-template-columns: 2fr 1fr 1fr 1fr; } .filters .search { grid-column: auto; } }
    .thumb { width: 48px; height: 60px; border-radius: 6px; object-fit: cover; background: var(--p-surface-800); display: block; flex: none; }
    .thumb--empty { display: grid; place-items: center; color: var(--p-surface-500); }
    .title { font-weight: 600; color: var(--p-surface-0); }
    .sub { color: var(--p-surface-300); font-size: .8rem; }
    .zero { color: var(--p-red-400); font-weight: 600; }
    tr.row { cursor: pointer; }
    .cards { display: grid; gap: .6rem; }
    .pcard { display: grid; grid-template-columns: 56px 1fr auto; gap: .75rem; align-items: center; padding: .7rem; cursor: pointer;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; min-height: 76px; }
    .pcard .meta { display: flex; flex-wrap: wrap; gap: .25rem .75rem; font-size: .8rem; color: var(--p-surface-300); margin-top: .2rem; }
    .pcard .title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .toggle-cell { display: grid; justify-items: center; gap: .2rem; font-size: .7rem; color: var(--p-surface-300); padding: .35rem; min-width: 44px; min-height: 44px; }
    .error { display: grid; gap: .75rem; justify-items: center; }
    .skeleton-row { display: grid; grid-template-columns: 56px 1fr; gap: .75rem; margin-bottom: .6rem; }
  `,
  template: `
    <div class="page-head">
      <h1 class="page-title">Products</h1>
      <a pButton routerLink="/products/new" icon="pi pi-plus" label="Add product"></a>
    </div>

    <div class="filters">
      <span class="search">
        <i class="pi pi-search"></i>
        <input pInputText type="search" placeholder="Search title, brand, SKU" aria-label="Search products" [ngModel]="q()" (ngModelChange)="search$.next($event)" />
      </span>
      <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [ngModel]="status()" (ngModelChange)="setStatus($event)" ariaLabel="Status" />
      <p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [ngModel]="category()" (ngModelChange)="setCategory($event)" ariaLabel="Category" />
      <p-select [options]="brandOptions()" optionLabel="label" optionValue="value" [ngModel]="brand()" (ngModelChange)="setBrand($event)" ariaLabel="Brand" />
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button>
      </div>
    } @else if (loading() && rows().length === 0) {
      @for (i of skeletons; track i) {
        <div class="skeleton-row"><p-skeleton width="56px" height="70px" /><p-skeleton height="70px" /></div>
      }
    } @else if (rows().length === 0) {
      <div class="card empty">
        @if (hasFilters()) {
          <p>No products match these filters.</p>
          <button pButton type="button" severity="secondary" label="Clear filters" (click)="clearFilters()"></button>
        } @else {
          <p>No products yet. Add your first one.</p>
          <a pButton routerLink="/products/new" icon="pi pi-plus" label="Add product"></a>
        }
      </div>
    } @else {
      @if (mobile()) {
        <div class="cards" [style.opacity]="loading() ? .6 : 1">
          @for (r of rows(); track r.id) {
            <div class="pcard" (click)="open(r)" role="link" tabindex="0" (keydown.enter)="open(r)">
              @if (r.thumbUrl) { <img class="thumb" [src]="r.thumbUrl" alt="" loading="lazy" /> } @else { <span class="thumb thumb--empty"><i class="pi pi-image"></i></span> }
              <div>
                <div class="title">{{ r.title }}</div>
                <div class="sub">{{ r.brand }} · {{ r.category }}</div>
                <div class="meta">
                  <span class="money">{{ pkr(r.price) }}</span>
                  <span [class.zero]="r.totalStock === 0">{{ r.totalStock === 0 ? 'Out of stock' : r.totalStock + ' in stock' }}</span>
                </div>
              </div>
              <div class="toggle-cell" (click)="$event.stopPropagation()">
                <p-toggleswitch [ngModel]="r.status === 'Published'" [disabled]="r.status === 'Archived' || busyIds().has(r.id!)" (onChange)="toggle(r, $event.checked)" [ariaLabel]="'Publish ' + r.title" />
                <span>{{ r.status }}</span>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card" style="padding:0;overflow:hidden" [style.opacity]="loading() ? .6 : 1">
          <p-table [value]="rows()" dataKey="id" [tableStyle]="{ 'min-width': '52rem' }">
            <ng-template #header>
              <tr><th style="width:64px"></th><th>Product</th><th>Brand</th><th>Category</th><th>Status</th><th>Price</th><th>Stock</th><th>Updated</th><th>Publish</th></tr>
            </ng-template>
            <ng-template #body let-r>
              <tr class="row" (click)="open(r)">
                <td>@if (r.thumbUrl) { <img class="thumb" [src]="r.thumbUrl" alt="" loading="lazy" /> } @else { <span class="thumb thumb--empty"><i class="pi pi-image"></i></span> }</td>
                <td><span class="title">{{ r.title }}</span><div class="sub">/{{ r.slug }}</div></td>
                <td>{{ r.brand }}</td>
                <td>{{ r.category }}</td>
                <td><p-tag [value]="r.status" [severity]="severity(r.status)" /></td>
                <td class="money">{{ pkr(r.price) }}</td>
                <td [class.zero]="r.totalStock === 0">{{ r.totalStock }}</td>
                <td class="sub">{{ date(r.updatedAt) }}</td>
                <td (click)="$event.stopPropagation()">
                  <p-toggleswitch [ngModel]="r.status === 'Published'" [disabled]="r.status === 'Archived' || busyIds().has(r.id)" (onChange)="toggle(r, $event.checked)" [ariaLabel]="'Publish ' + r.title" />
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
      <p-paginator [first]="page() * pageSize" [rows]="pageSize" [totalRecords]="total()" (onPageChange)="onPage($event)" [showCurrentPageReport]="!mobile()" currentPageReportTemplate="{first}-{last} of {totalRecords}" />
    }
  `,
})
export class ProductsListPage implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 20;
  protected readonly skeletons = [1, 2, 3, 4, 5, 6];
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly pkr = formatPkr;
  protected readonly date = formatDate;
  readonly search$ = new Subject<string>();

  protected readonly rows = signal<AdminProductRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busyIds = signal<ReadonlySet<number>>(new Set());
  protected readonly mobile = signal(typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches);

  protected readonly q = signal('');
  protected readonly status = signal<ProductStatus | null>(null);
  protected readonly category = signal<number | null>(null);
  protected readonly brand = signal<number | null>(null);
  protected readonly page = signal(0);
  protected readonly categoryOptions = signal<Option[]>([{ label: 'All categories', value: null }]);
  protected readonly brandOptions = signal<Option[]>([{ label: 'All brands', value: null }]);
  protected readonly hasFilters = computed(() => !!(this.q() || this.status() || this.category() || this.brand()));

  private requestId = 0;

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((v) => { this.q.set(v.trim()); this.page.set(0); });
    // Any query change reloads the list (server-side filter + paging).
    effect(() => {
      this.q(); this.status(); this.category(); this.brand(); this.page();
      untracked(() => void this.load());
    });
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(max-width: 640px)');
      const on = (e: MediaQueryListEvent) => this.mobile.set(e.matches);
      mq.addEventListener('change', on);
      this.destroyRef.onDestroy(() => mq.removeEventListener('change', on));
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const [cats, brands] = await Promise.all([this.api.invoke(apiAdminCategoriesGet), this.api.invoke(apiAdminBrandsGet)]);
      this.categoryOptions.set([{ label: 'All categories', value: null }, ...cats.map((c) => ({ label: c.name ?? '', value: c.id ?? null }))]);
      this.brandOptions.set([{ label: 'All brands', value: null }, ...brands.map((b) => ({ label: b.name ?? '', value: b.id ?? null }))]);
    } catch { /* filters just stay on "All"; the list itself reports errors */ }
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invoke(apiAdminProductsGet, {
        q: this.q() || undefined, status: this.status() ?? undefined, category: this.category() ?? undefined,
        brand: this.brand() ?? undefined, page: this.page() + 1, pageSize: this.pageSize,
      });
      if (id !== this.requestId) return;
      this.rows.set(res.items ?? []);
      this.total.set(res.total ?? 0);
    } catch (e) {
      if (id !== this.requestId) return;
      this.error.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load products');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected setStatus(v: ProductStatus | null): void { this.status.set(v); this.page.set(0); }
  protected setCategory(v: number | null): void { this.category.set(v); this.page.set(0); }
  protected setBrand(v: number | null): void { this.brand.set(v); this.page.set(0); }
  protected onPage(e: PaginatorState): void { this.page.set(Math.floor((e.first ?? 0) / this.pageSize)); }
  protected clearFilters(): void { this.search$.next(''); this.q.set(''); this.status.set(null); this.category.set(null); this.brand.set(null); this.page.set(0); }
  protected open(r: AdminProductRow): void { void this.router.navigate(['/products', r.id]); }
  protected severity(s: ProductStatus | undefined): 'success' | 'secondary' | 'warn' { return s === 'Published' ? 'success' : s === 'Archived' ? 'warn' : 'secondary'; }

  /** Optimistic publish/unpublish with rollback + toast. */
  protected async toggle(row: AdminProductRow, on: boolean): Promise<void> {
    const id = row.id!;
    const previous = row.status!;
    const next: ProductStatus = on ? 'Published' : 'Draft';
    if (next === previous) return;
    this.setBusy(id, true);
    this.patchRow(id, { status: next });
    try {
      const fn = on ? apiAdminProductsIdPublishPost : apiAdminProductsIdUnpublishPost;
      const updated = await this.api.invoke(fn, { id });
      this.patchRow(id, { status: updated.status ?? next, updatedAt: updated.updatedAt ?? row.updatedAt });
      this.toast.add({ severity: 'success', summary: on ? 'Published' : 'Unpublished', detail: row.title, life: 2500 });
    } catch (e) {
      this.patchRow(id, { status: previous });
      const p = problemOf(e);
      this.toast.add({ severity: 'error', summary: on ? 'Could not publish' : 'Could not unpublish', detail: p.detail ?? p.title, life: 6000 });
    } finally {
      this.setBusy(id, false);
    }
  }

  private patchRow(id: number, patch: Partial<AdminProductRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  private setBusy(id: number, busy: boolean): void {
    this.busyIds.update((s) => { const n = new Set(s); if (busy) n.add(id); else n.delete(id); return n; });
  }
}
