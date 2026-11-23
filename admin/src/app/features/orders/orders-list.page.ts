import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Api } from '../../api/api';
import { apiAdminOrdersGet } from '../../api/fn/admin-orders/api-admin-orders-get';
import { OrderRow } from '../../api/models/order-row';
import { OrderStatus } from '../../api/models/order-status';
import { formatPkr } from '../../core/format';
import { problemOf } from '../../core/http';
import { ORDER_STATUSES, STATUS_SEVERITY, relativeTime } from './order-helpers';

@Component({
  selector: 'gd-orders-list.page',
  imports: [FormsModule, ButtonModule, InputTextModule, PaginatorModule, SkeletonModule, TableModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .tabs { display: flex; gap: .4rem; overflow-x: auto; padding-bottom: .5rem; margin-bottom: .5rem; scrollbar-width: thin; }
    .tab { flex: none; min-height: 44px; padding: 0 .9rem; border-radius: 999px; border: 1px solid var(--p-surface-700); background: var(--p-surface-900);
      color: var(--p-surface-100); font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: .4rem; }
    .tab.active { background: var(--p-primary-500); border-color: var(--p-primary-500); color: var(--p-primary-contrast-color, #000); font-weight: 600; }
    .tab .n { font-size: .75rem; opacity: .8; font-variant-numeric: tabular-nums; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: 1rem; }
    .filters .search { grid-column: 1 / -1; position: relative; }
    .filters .search i { position: absolute; left: .8rem; top: 50%; transform: translateY(-50%); color: var(--p-surface-400); }
    .filters .search input { width: 100%; padding-left: 2.3rem; min-height: 44px; }
    .filters label { display: grid; gap: .2rem; font-size: .75rem; color: var(--p-surface-300); }
    .filters input[type=date] { min-height: 44px; width: 100%; }
    @media (min-width: 760px) { .filters { grid-template-columns: 2fr 1fr 1fr; } .filters .search { grid-column: auto; } .filters label { align-content: end; } }
    tr.row { cursor: pointer; }
    .sub { color: var(--p-surface-300); font-size: .8rem; }
    .strong { font-weight: 600; color: var(--p-surface-0); }
    .cards { display: grid; gap: .6rem; }
    .skel { margin-bottom: .6rem; }
    .ocard { display: grid; gap: .35rem; padding: .8rem; cursor: pointer; min-height: 76px;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .ocard .r1, .ocard .r2 { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .error { display: grid; gap: .75rem; justify-items: center; }
  `,
  template: `
    <div class="page-head"><h1 class="page-title">Orders</h1></div>

    <div class="tabs" role="tablist" aria-label="Order status">
      <button type="button" role="tab" class="tab" [class.active]="!status()" [attr.aria-selected]="!status()" (click)="setStatus(null)">All <span class="n">{{ allCount() }}</span></button>
      @for (s of statuses; track s) {
        <button type="button" role="tab" class="tab" [class.active]="status() === s" [attr.aria-selected]="status() === s" (click)="setStatus(s)">{{ s }} <span class="n">{{ counts()[s] ?? 0 }}</span></button>
      }
    </div>

    <div class="filters">
      <span class="search">
        <i class="pi pi-search"></i>
        <input pInputText type="search" placeholder="Order #, name or phone" aria-label="Search orders" [ngModel]="q()" (ngModelChange)="search$.next($event)" />
      </span>
      <label>From <input pInputText type="date" [ngModel]="from()" (ngModelChange)="setDate('from', $event)" [max]="to() || ''" /></label>
      <label>To <input pInputText type="date" [ngModel]="to()" (ngModelChange)="setDate('to', $event)" [min]="from() || ''" /></label>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button>
      </div>
    } @else if (loading() && rows().length === 0) {
      @for (i of skeletons; track i) { <p-skeleton class="skel" height="76px" /> }
    } @else if (rows().length === 0) {
      <div class="card empty">
        @if (hasFilters()) {
          <p>No orders match these filters.</p>
          <button pButton type="button" severity="secondary" label="Clear filters" (click)="clear()"></button>
        } @else { <p>No orders yet. They will show up here as customers check out.</p> }
      </div>
    } @else {
      @if (mobile()) {
        <div class="cards" [style.opacity]="loading() ? .6 : 1">
          @for (r of rows(); track r.id) {
            <div class="ocard" role="link" tabindex="0" (click)="open(r)" (keydown.enter)="open(r)">
              <div class="r1"><span class="strong">{{ r.orderNumber }}</span><p-tag [value]="r.status" [severity]="sev(r.status)" /></div>
              <div>{{ r.customerName }} <span class="sub">· {{ r.city }}</span></div>
              <div class="r2"><span class="sub">{{ r.itemCount }} item{{ r.itemCount === 1 ? '' : 's' }} · {{ ago(r.createdAt) }}</span><span class="money strong">{{ pkr(r.total) }}</span></div>
            </div>
          }
        </div>
      } @else {
        <div class="card" style="padding:0;overflow:hidden" [style.opacity]="loading() ? .6 : 1">
          <p-table [value]="rows()" dataKey="id" [tableStyle]="{ 'min-width': '46rem' }">
            <ng-template #header><tr><th>Order</th><th>Customer</th><th>City</th><th>Items</th><th>Total</th><th>Status</th><th>Placed</th></tr></ng-template>
            <ng-template #body let-r>
              <tr class="row" tabindex="0" (click)="open(r)" (keydown.enter)="open(r)">
                <td class="strong">{{ r.orderNumber }}</td>
                <td>{{ r.customerName }}<div class="sub">{{ r.phone }}</div></td>
                <td>{{ r.city }}</td>
                <td>{{ r.itemCount }}</td>
                <td class="money">{{ pkr(r.total) }}</td>
                <td><p-tag [value]="r.status" [severity]="sev(r.status)" /></td>
                <td class="sub">{{ ago(r.createdAt) }}</td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
      <p-paginator [first]="(page() - 1) * pageSize" [rows]="pageSize" [totalRecords]="total()" (onPageChange)="onPage($event)" [showCurrentPageReport]="!mobile()" currentPageReportTemplate="{first}-{last} of {totalRecords}" />
    }
  `,
})
export class OrdersListPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 20;
  protected readonly skeletons = [1, 2, 3, 4, 5];
  protected readonly statuses = ORDER_STATUSES;
  protected readonly pkr = formatPkr;
  protected readonly ago = (iso: string | undefined) => relativeTime(iso);
  protected readonly sev = (s: OrderStatus | undefined) => STATUS_SEVERITY[s ?? 'New'];
  readonly search$ = new Subject<string>();

  private readonly qp = toSignal(this.route.queryParamMap.pipe(map((m) => ({
    status: m.get('status'), q: m.get('q') ?? '', from: m.get('from') ?? '', to: m.get('to') ?? '', page: Math.max(1, Number(m.get('page')) || 1),
  }))), { requireSync: true });

  protected readonly status = computed(() => {
    const s = this.qp().status;
    return (ORDER_STATUSES as string[]).includes(s ?? '') ? s as OrderStatus : null;
  });
  protected readonly q = computed(() => this.qp().q);
  protected readonly from = computed(() => this.qp().from);
  protected readonly to = computed(() => this.qp().to);
  protected readonly page = computed(() => this.qp().page);
  protected readonly hasFilters = computed(() => !!(this.status() || this.q() || this.from() || this.to()));

  protected readonly rows = signal<OrderRow[]>([]);
  protected readonly total = signal(0);
  protected readonly counts = signal<Record<string, number>>({});
  protected readonly allCount = computed(() => Object.values(this.counts()).reduce((a, b) => a + b, 0));
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly mobile = signal(typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches);
  private requestId = 0;

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((v) => {
      if (v.trim() !== this.q()) this.nav({ q: v.trim() || null, page: null });
    });
    effect(() => {
      this.qp();
      untracked(() => void this.load());
    });
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(max-width: 640px)');
      const on = (e: MediaQueryListEvent) => this.mobile.set(e.matches);
      mq.addEventListener('change', on);
      this.destroyRef.onDestroy(() => mq.removeEventListener('change', on));
    }
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invoke(apiAdminOrdersGet, {
        status: this.status() ?? undefined, q: this.q() || undefined, from: this.from() || undefined, to: this.to() || undefined,
        page: this.page(), pageSize: this.pageSize,
      });
      if (id !== this.requestId) return;
      this.rows.set(res.items ?? []);
      this.total.set(res.total ?? 0);
      this.counts.set(res.countsByStatus ?? {});
    } catch (e) {
      if (id !== this.requestId) return;
      this.error.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load orders');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  private nav(params: Record<string, string | number | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
  protected setStatus(s: OrderStatus | null): void { this.nav({ status: s, page: null }); }
  protected setDate(k: 'from' | 'to', v: string | null): void { this.nav({ [k]: v || null, page: null }); }
  protected onPage(e: PaginatorState): void { const p = Math.floor((e.first ?? 0) / this.pageSize) + 1; this.nav({ page: p > 1 ? p : null }); }
  protected clear(): void { this.nav({ status: null, q: null, from: null, to: null, page: null }); }
  protected open(r: OrderRow): void { void this.router.navigate(['/orders', r.id]); }
}
