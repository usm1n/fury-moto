import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { Api } from '../../api/api';
import { apiAdminDashboardGet } from '../../api/fn/admin-orders/api-admin-dashboard-get';
import { Dashboard } from '../../api/models/dashboard';
import { formatPkr } from '../../core/format';
import { problemOf } from '../../core/http';

@Component({
  selector: 'gd-dashboard.page',
  imports: [RouterLink, ButtonModule, SkeletonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-bottom: 1.25rem; }
    .stat { padding: 1rem; text-align: left; font: inherit; color: inherit; display: grid; gap: .25rem; min-height: 96px; }
    .stat.primary { grid-column: 1 / -1; cursor: pointer; border-color: var(--p-primary-500); }
    .stat .label { font-size: .8rem; color: var(--p-surface-300); text-transform: uppercase; letter-spacing: .04em; }
    .stat .value { font-family: 'Anton', Impact, sans-serif; font-size: 2rem; line-height: 1.1; }
    @media (min-width: 760px) { .stats { grid-template-columns: repeat(3, 1fr); } .stat.primary { grid-column: auto; } }
    h2 { font-size: 1.05rem; margin: 0 0 .6rem; }
    .low { display: grid; gap: .5rem; margin-bottom: 1.25rem; }
    .low a { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .7rem .9rem; min-height: 56px;
      text-decoration: none; color: inherit; background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .low .t { font-weight: 600; }
    .low .s { font-size: .8rem; color: var(--p-surface-300); }
    .error { display: grid; gap: .75rem; justify-items: center; }
    .add { width: 100%; min-height: 56px; font-size: 1.1rem; }
    @media (min-width: 760px) { .add { width: auto; } }
  `,
  template: `
    <div class="page-head">
      <h1 class="page-title">Dashboard</h1>
      <a pButton class="add" routerLink="/products/new" size="large"><span pButtonIcon class="pi pi-plus"></span><span pButtonLabel>Add product</span></a>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" (click)="load()"><span pButtonIcon class="pi pi-refresh"></span><span pButtonLabel>Try again</span></button>
      </div>
    } @else if (!data()) {
      <div class="stats">
        <p-skeleton height="96px" /><p-skeleton height="96px" /><p-skeleton height="96px" />
      </div>
      <p-skeleton height="56px"/><p-skeleton height="56px" />
    } @else {
      @let d = data()!;
      <div class="stats">
        <button type="button" class="card stat primary" (click)="openNew()" aria-label="View new orders">
          <span class="label">New orders</span>
          <span class="value">{{ d.newOrders ?? 0 }}</span>
          <span class="muted">Tap to review</span>
        </button>
        <div class="card stat">
          <span class="label">Revenue this month</span>
          <span class="value money">{{ pkr(d.revenueThisMonth) }}</span>
        </div>
        <div class="card stat">
          <span class="label">Orders this month</span>
          <span class="value">{{ d.ordersThisMonth ?? 0 }}</span>
        </div>
      </div>

      <h2>Low stock</h2>
      @if ((d.lowStock ?? []).length === 0) {
        <div class="card empty">Nothing running low.
        </div>
      } @else {
        <div class="low">
          @for (l of d.lowStock; track $index) {
            <a [routerLink]="['/products', l.productId]">
              <span><span class="t">{{ l.title }}</span><br /><span class="s">{{ l.size }} / {{ l.color }}</span></span>
              <p-tag [value]="l.stock === 0 ? 'Out' : l.stock + ' left'" [severity]="l.stock === 0 ? 'danger' : 'warn'" />
            </a>
          }
        </div>
      }
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pkr = formatPkr;
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
    // "Refresh on return": reload when the tab becomes visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') void this.load(); };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.data.set(await this.api.invoke(apiAdminDashboardGet));
    } catch (e) {
      if (!this.data()) this.error.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load the dashboard');
    }
  }

  protected openNew(): void { void this.router.navigate(['/orders'], { queryParams: { status: 'New' } }); }
}
