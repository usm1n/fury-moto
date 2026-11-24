import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Skeleton, Tag } from '../../shared/ui/ui';
import { Api } from '../../api/api';
import { apiAdminAuditGet } from '../../api/fn/admin-audit/api-admin-audit-get';
import { AuditEntry } from '../../api/models/audit-entry';
import { formatDate } from '../../core/format';
import { problemOf } from '../../core/http';
import { relativeTime } from '../orders/order-helpers';
import { AUDIT_ENTITIES, auditActionSeverity, auditLink } from '../content/content-helpers';

@Component({
  selector: 'gd-audit.page',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule, Skeleton, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .filters { display: flex; gap: .5rem; align-items: center; margin-bottom: 1rem; }
    .filters select { min-width: 12rem; flex: 1; max-width: 20rem; }
    table { width: 100%; min-width: 46rem; border-collapse: collapse; font-size: .92rem; }
    th { text-align: left; padding: .7rem .85rem; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--p-surface-300);
      background: var(--p-surface-800); border-bottom: 1px solid var(--p-surface-700); }
    td { padding: .7rem .85rem; border-bottom: 1px solid var(--p-surface-700); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .tablewrap { overflow-x: auto; }
    mat-paginator { background: transparent; margin-top: .75rem; }
    .sub { color: var(--p-surface-300); font-size: .8rem; }
    .strong { font-weight: 600; color: var(--p-surface-0); }
    .cards { display: grid; gap: .6rem; }
    .acard { display: grid; gap: .35rem; padding: .8rem; background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .acard .r1 { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .sum { overflow-wrap: anywhere; }
    .link { display: inline-flex; align-items: center; min-height: 44px; }
    td .link { min-height: 0; }
    .error { display: grid; gap: .75rem; justify-items: center; }
  `,
  template: `
    <div class="page-head"><h1 class="page-title">Activity</h1></div>

    <div class="filters">
      <select class="gd-input" aria-label="Filter by type" [ngModel]="entity()" (ngModelChange)="setEntity($event)">
        @for (o of entities; track o.label) { <option [ngValue]="o.value">{{ o.label }}</option> }
      </select>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <mat-icon style="font-size:1.6rem;width:1.6rem;height:1.6rem">warning</mat-icon>
        <div>{{ err }}</div>
        <button mat-flat-button type="button" (click)="load()"><mat-icon>refresh</mat-icon>Try again</button>
      </div>
    } @else if (loading() && rows().length === 0) {
      @for (i of [1, 2, 3, 4, 5]; track i) { <gd-skeleton height="72px" /><div style="height:.5rem"></div> }
    } @else if (rows().length === 0) {
      <div class="card empty">
        @if (entity()) {
          <p>No activity for this type yet.</p>
          <button mat-stroked-button type="button" (click)="setEntity(null)">Show all</button>
        } @else { <p>No activity recorded yet. Changes you make in the admin will show up here.</p> }
      </div>
    } @else {
      @if (mobile()) {
        <div class="cards" [style.opacity]="loading() ? .6 : 1">
          @for (r of rows(); track r.id) {
            <div class="acard">
              <div class="r1"><gd-tag [value]="r.action" [severity]="sev(r.action)" /><span class="sub" [title]="exact(r.at)">{{ ago(r.at) }}</span></div>
              <div class="sum">{{ r.summary }}</div>
              <div class="sub">{{ r.by || 'system' }}
                @if (link(r); as l) { · <a class="link" [routerLink]="l">{{ r.entity }} #{{ r.entityId }}</a> } @else { · {{ r.entity }} }</div>
            </div>
          }
        </div>
      } @else {
        <div class="card tablewrap" style="padding:0" [style.opacity]="loading() ? .6 : 1">
          <table>
            <thead><tr><th>When</th><th>By</th><th>Action</th><th>Item</th><th>What changed</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
              <tr>
                <td class="sub" [title]="exact(r.at)">{{ ago(r.at) }}</td>
                <td>{{ r.by || 'system' }}</td>
                <td><gd-tag [value]="r.action" [severity]="sev(r.action)" /></td>
                <td>@if (link(r); as l) { <a class="link" [routerLink]="l">{{ r.entity }} #{{ r.entityId }}</a> } @else { {{ r.entity }}@if (r.entityId) { <span class="sub"> #{{ r.entityId }}</span> } }</td>
                <td>{{ r.summary }}</td>
              </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <mat-paginator [length]="total()" [pageSize]="pageSize" [pageIndex]="page() - 1" [hidePageSize]="true" [showFirstLastButtons]="!mobile()" (page)="onPage($event)" aria-label="Activity pages" />
    }
  `,
})
export class AuditPage {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 50;
  protected readonly entities = [{ label: 'All activity', value: null as string | null }, ...AUDIT_ENTITIES.map((e) => ({ label: e, value: e as string | null }))];
  protected readonly entity = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly rows = signal<AuditEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly mobile = signal(typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches);
  protected readonly ago = (iso: string | undefined) => relativeTime(iso);
  protected readonly exact = (iso: string | undefined) => formatDate(iso);
  protected readonly sev = (a: string | undefined) => auditActionSeverity(a);
  protected readonly link = (r: AuditEntry) => auditLink(r.entity, r.entityId);
  private requestId = 0;

  constructor() {
    effect(() => {
      this.entity();
      this.page();
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
      const res = await this.api.invoke(apiAdminAuditGet, { entity: this.entity() ?? undefined, page: this.page(), pageSize: this.pageSize });
      if (id !== this.requestId) return;
      this.rows.set(res.items ?? []);
      this.total.set(res.total ?? 0);
    } catch (e) {
      if (id !== this.requestId) return;
      this.error.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load activity');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected setEntity(v: string | null): void { this.entity.set(v); this.page.set(1); }
  protected onPage(e: PageEvent): void { this.page.set(e.pageIndex + 1); }
}
