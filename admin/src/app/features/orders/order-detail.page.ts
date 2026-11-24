import { ChangeDetectionStrategy, Component, TemplateRef, ViewEncapsulation, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Message, Skeleton, Tag } from '../../shared/ui/ui';
import { Toast } from '../../shared/ui/toast.service';
import { Api } from '../../api/api';
import { apiAdminOrdersIdGet } from '../../api/fn/admin-orders/api-admin-orders-id-get';
import { apiAdminOrdersIdNotesPost } from '../../api/fn/admin-orders/api-admin-orders-id-notes-post';
import { apiAdminOrdersIdStatusPost } from '../../api/fn/admin-orders/api-admin-orders-id-status-post';
import { Order } from '../../api/models/order';
import { OrderStatus } from '../../api/models/order-status';
import { formatDate, formatPkr } from '../../core/format';
import { fieldError, problemOf } from '../../core/http';
import { NextAction, STATUS_SEVERITY, ShortItem, isNoteEntry, nextActions, packingSlipText, paymentLabel, relativeTime, shortItems } from './order-helpers';

@Component({
  selector: 'gd-order-detail.page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, Message, Skeleton, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    gd-order-detail\\.page { display: block; }
    .od h2 { font-size: 1.05rem; margin: 0 0 .6rem; }
    .od .grid { display: grid; gap: 1rem; }
    @media (min-width: 900px) { .od .grid { grid-template-columns: 3fr 2fr; align-items: start; } }
    .od .stack { display: grid; gap: 1rem; }
    .od .head { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem .9rem; margin-bottom: 1rem; }
    .od .head .page-title { margin: 0; }
    .od dl { display: grid; grid-template-columns: auto 1fr; gap: .35rem .9rem; margin: 0; }
    .od dt { color: var(--p-surface-300); font-size: .85rem; }
    .od dd { margin: 0; overflow-wrap: anywhere; }
    .od table.items { width: 100%; border-collapse: collapse; }
    .od table.items th { text-align: left; font-size: .75rem; color: var(--p-surface-300); font-weight: 500; padding: .3rem .4rem; }
    .od table.items td { padding: .5rem .4rem; border-top: 1px solid var(--p-surface-800); vertical-align: top; }
    .od .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .od .sub { color: var(--p-surface-300); font-size: .8rem; }
    .od .totals { display: grid; gap: .25rem; margin-top: .75rem; margin-left: auto; max-width: 18rem; }
    .od .totals div { display: flex; justify-content: space-between; gap: 1rem; }
    .od .totals .grand { font-weight: 700; font-size: 1.1rem; border-top: 1px solid var(--p-surface-700); padding-top: .4rem; }
    .od .actions { display: grid; gap: .5rem; }
    .od .actions .mat-mdc-button-base { min-height: 48px; width: 100%; }
    .od .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: .8rem; }
    .od .timeline li { position: relative; padding-left: 1.2rem; }
    .od .timeline li::before { content: ''; position: absolute; left: 0; top: .4rem; width: .6rem; height: .6rem; border-radius: 50%; background: var(--p-primary-500); }
    .od .timeline li::after { content: ''; position: absolute; left: calc(.3rem - 1px); top: 1.1rem; bottom: -.8rem; width: 2px; background: var(--p-surface-700); }
    .od .timeline li:last-child::after { display: none; }
    .od .short { margin: .5rem 0 0; padding-left: 1.1rem; }
    .od .error { display: grid; gap: .75rem; justify-items: center; }
    .od .noteform { display: grid; gap: .5rem; margin-top: .75rem; }
    .od .linkbtn { text-decoration: none; }
    .od .noteform button { justify-self: start; }
    .gd-status-dlg .short { margin: .5rem 0 0; padding-left: 1.1rem; }
    .od .back { display: inline-flex; align-items: center; gap: .3rem; min-height: 44px; text-decoration: none; margin-bottom: .25rem; }
    .od .phone { display: inline-flex; align-items: center; min-height: 44px; }
    @media (max-width: 640px) { .od table.items .hide-sm { display: none; } }
    .slip { display: none; }
    @media print {
      body * { visibility: hidden !important; }
      .slip, .slip * { visibility: visible !important; }
      .slip { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 1.5cm; background: #fff; color: #000; font: 14px/1.5 Arial, sans-serif; }
      .slip h1 { font-size: 20px; margin: 0 0 .5rem; }
      .slip pre { white-space: pre-wrap; font: inherit; }
    }
  `,
  template: `
    <ng-template #statusDlg>
      @if (order(); as o) {
        <h2 mat-dialog-title>{{ pending()?.label }}</h2>
        <mat-dialog-content class="gd-status-dlg">
          <p style="margin-top:0">
            @if (pending()?.status === 'Cancelled') { Cancel {{ o.orderNumber }}? @if (o.stockDeducted) { Reserved stock will be returned. } }
            @else { Change {{ o.orderNumber }} from {{ o.status }} to {{ pending()?.status }}? }
          </p>
          @if (shortList().length) {
            <gd-message severity="error">
              <div>
                Not enough stock to confirm:
                <ul class="short">
                  @for (s of shortList(); track s.variantId) {
                    <li>
                      @if (s.productId) { <a [routerLink]="['/products', s.productId]" (click)="cancelAsk()">{{ s.title }}</a> } @else { {{ s.title }} }
                      ({{ s.size }} / {{ s.color }}): need {{ s.requested }}, have {{ s.available }}
                    </li>
                  }
                </ul>
              </div>
            </gd-message>
          }
          <div class="field" style="margin-top:.75rem">
            <label for="snote">Note (optional)</label>
            <textarea class="gd-input" id="snote" rows="2" maxlength="500" [formControl]="statusNote"></textarea>
          </div>
          @if (statusError(); as se) { <small class="field-error">{{ se }}</small> }
        </mat-dialog-content>
        <mat-dialog-actions align="end">
          <button mat-button type="button" [disabled]="busy()" (click)="cancelAsk()">Back</button>
          <button mat-flat-button type="button" [class.gd-danger]="pending()?.severity === 'danger'" [disabled]="busy()" (click)="submit()">
            @if (busy()) { <mat-progress-spinner mode="indeterminate" diameter="18" /> }{{ pending()?.label ?? 'Confirm' }}
          </button>
        </mat-dialog-actions>
      }
    </ng-template>

    <div class="od">
      <a class="back" routerLink="/orders"><mat-icon>arrow_back</mat-icon> Orders</a>

      @if (error(); as err) {
        <div class="card empty error">
          <mat-icon aria-hidden="true">warning</mat-icon>
          <div>{{ err }}</div>
          <button mat-flat-button type="button" (click)="load()"><mat-icon>refresh</mat-icon>Try again</button>
        </div>
      } @else if (!order()) {
        <gd-skeleton height="2.5rem" width="60%" /><br /><gd-skeleton height="12rem" /><br /><gd-skeleton height="10rem" />
      } @else {
        @let o = order()!;
        <div class="head">
          <h1 class="page-title">{{ o.orderNumber }}</h1>
          <gd-tag [value]="o.status" [severity]="sev(o.status)" />
          <span class="muted">Placed {{ date(o.createdAt) }} ({{ ago(o.createdAt) }})</span>
        </div>

        @if (staleNotice()) {
          <gd-message severity="warn">This order was changed by someone else. It has been reloaded; check the details and try again.</gd-message><br />
        }

        <div class="grid">
          <div class="stack">
            <section class="card">
              <h2>Items</h2>
              <table class="items">
                <thead><tr><th>Item</th><th class="num">Qty</th><th class="num hide-sm">Unit</th><th class="num">Total</th></tr></thead>
                <tbody>
                  @for (i of o.items; track $index) {
                    <tr>
                      <td><a [routerLink]="['/products', i.productId]">{{ i.title }}</a><div class="sub">{{ i.size }} / {{ i.color }}</div></td>
                      <td class="num">{{ i.quantity }}</td>
                      <td class="num hide-sm">{{ pkr(i.unitPrice) }}</td>
                      <td class="num">{{ pkr(i.lineTotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <div class="totals">
                <div><span class="muted">Subtotal</span><span class="money">{{ pkr(o.subtotal) }}</span></div>
                <div><span class="muted">Delivery</span><span class="money">{{ pkr(o.deliveryFee) }}</span></div>
                <div class="grand"><span>Total</span><span class="money">{{ pkr(o.total) }}</span></div>
              </div>
              <p class="sub" style="margin:.75rem 0 0">Payment: {{ payment(o.paymentMethod) }}</p>
            </section>

            <section class="card">
              <h2>Customer</h2>
              <dl>
                <dt>Name</dt><dd>{{ o.customerName }}</dd>
                <dt>Phone</dt><dd><a class="phone" [href]="'tel:' + o.phone">{{ o.phone }}</a></dd>
                <dt>City</dt><dd>{{ o.city }}</dd>
                <dt>Address</dt><dd>{{ o.address }}</dd>
                @if (o.notes) { <dt>Notes</dt><dd>{{ o.notes }}</dd> }
              </dl>
            </section>
          </div>

          <div class="stack">
            <section class="card">
              <h2>Actions</h2>
              <div class="actions">
                @for (a of actions(); track a.status) {
                  @if (a.severity === 'danger') { <button mat-stroked-button class="gd-danger" type="button" (click)="ask(a)">{{ a.label }}</button> }
                  @else { <button mat-flat-button type="button" (click)="ask(a)">{{ a.label }}</button> }
                }
                @if (actions().length === 0) { <p class="muted" style="margin:0">This order is {{ (o.status ?? "").toLowerCase() }}; no further status changes.</p> }
                <a mat-stroked-button class="linkbtn" [href]="o.whatsappUrl" target="_blank" rel="noopener noreferrer"><mat-icon>chat</mat-icon> Message customer on WhatsApp</a>
                <button mat-stroked-button type="button" (click)="copySlip()"><mat-icon>content_copy</mat-icon>Copy packing slip</button>
                <button mat-stroked-button type="button" (click)="print()"><mat-icon>print</mat-icon>Print packing slip</button>
              </div>
            </section>

            <section class="card">
              <h2>History</h2>
              <ul class="timeline">
                @for (h of historyDesc(); track $index) {
                  <li>
                    <div>
                      @if (isNote(h)) { <span class="muted">Note ·</span> <strong>{{ h.to }}</strong> } @else if (h.from) { {{ h.from }} → <strong>{{ h.to }}</strong> } @else { <strong>{{ h.to }}</strong> }
                    </div>
                    @if (h.note) { <div>{{ h.note }}</div> }
                    <div class="sub">{{ h.by || 'Customer' }} · {{ date(h.at) }}</div>
                  </li>
                }
              </ul>
              <!-- plain (submit): this form has no [formGroup]/NgForm, so (ngSubmit) would never fire and the
                   browser would do a native submit (page reload, note lost) -->
              <form class="noteform" (submit)="$event.preventDefault(); addNote()">
                <label for="note" class="sub">Add a note</label>
                <textarea class="gd-input" id="note" rows="2" maxlength="500" [formControl]="note" placeholder="Internal note (e.g. called customer, no answer)"></textarea>
                @if (noteError(); as ne) { <small class="field-error">{{ ne }}</small> }
                <button mat-stroked-button type="submit" [disabled]="noteBusy() || !note.value.trim()">@if (noteBusy()) { <mat-progress-spinner mode="indeterminate" diameter="18" /> } @else { <mat-icon>add</mat-icon> }Add note</button>
              </form>
            </section>
          </div>
        </div>

        

        <div class="slip" aria-hidden="true">
          <h1>The Gear Doctor</h1>
          <pre>{{ slipText() }}</pre>
        </div>
      }
    </div>
  `,
})
export class OrderDetailPage {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly dialog = inject(MatDialog);
  private readonly statusDlg = viewChild.required<TemplateRef<unknown>>('statusDlg');
  private dlgRef: MatDialogRef<unknown> | null = null;

  readonly id = input.required<string>();

  protected readonly pkr = formatPkr;
  protected readonly date = formatDate;
  protected readonly ago = (iso: string | undefined) => relativeTime(iso);
  protected readonly payment = paymentLabel;
  protected readonly isNote = isNoteEntry;
  protected readonly sev = (s: OrderStatus | undefined) => STATUS_SEVERITY[s ?? 'New'];

  protected readonly order = signal<Order | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly staleNotice = signal(false);
  protected readonly pending = signal<NextAction | null>(null);
  protected readonly busy = signal(false);
  protected readonly statusError = signal<string | null>(null);
  protected readonly shortList = signal<ShortItem[]>([]);
  protected readonly noteBusy = signal(false);
  protected readonly noteError = signal<string | null>(null);

  protected readonly note = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] });
  protected readonly statusNote = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] });

  protected readonly actions = computed(() => nextActions(this.order()?.status));
  protected readonly historyDesc = computed(() => [...(this.order()?.history ?? [])].reverse());
  protected readonly slipText = computed(() => (this.order() ? packingSlipText(this.order()!) : ''));

  constructor() {
    effect(() => {
      this.id();
      untracked(() => { this.order.set(null); void this.load(); });
    });
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      this.order.set(await this.api.invoke(apiAdminOrdersIdGet, { id: Number(this.id()) }));
    } catch (e) {
      const p = problemOf(e);
      this.error.set(p.status === 404 ? 'Order not found.' : (p.detail ?? p.title ?? 'Could not load this order'));
    }
  }

  protected ask(a: NextAction): void {
    this.statusNote.reset('');
    this.statusError.set(null);
    this.shortList.set([]);
    this.pending.set(a);
    const ref = this.dialog.open(this.statusDlg(), { width: '28rem', maxWidth: '94vw', disableClose: true, ariaLabel: a.label });
    this.dlgRef = ref;
    const dismiss = () => this.cancelAsk();
    ref.backdropClick().subscribe(dismiss);
    ref.keydownEvents().subscribe((e) => { if (e.key === 'Escape') dismiss(); });
    ref.afterClosed().subscribe(() => { if (this.dlgRef === ref) { this.dlgRef = null; this.pending.set(null); } });
  }
  protected cancelAsk(): void {
    if (this.busy()) return;
    this.pending.set(null);
    this.dlgRef?.close();
  }
  private closeDialog(): void { this.pending.set(null); this.dlgRef?.close(); }

  protected async submit(): Promise<void> {
    const a = this.pending();
    const o = this.order();
    if (!a || !o || this.busy()) return;
    this.busy.set(true);
    this.statusError.set(null);
    try {
      // Status changes wait for the server (stock is deducted/restored there).
      const updated = await this.api.invoke(apiAdminOrdersIdStatusPost, {
        id: o.id!, body: { status: a.status, note: this.statusNote.value.trim() || undefined, version: o.version! },
      });
      this.order.set(updated);
      this.staleNotice.set(false);
      this.closeDialog();
      this.toast.add({ severity: 'success', summary: `Order ${updated.status?.toLowerCase()}`, detail: updated.orderNumber, life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 409 && p.type === '/problems/out-of-stock') {
        this.shortList.set(shortItems(p, o));
        this.statusError.set(null);
      } else if (p.status === 409) {
        this.closeDialog();
        this.staleNotice.set(true);
        await this.load();
      } else {
        this.statusError.set(fieldError(p, 'status') ?? p.detail ?? p.title ?? 'Could not change the status');
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async addNote(): Promise<void> {
    const o = this.order();
    const text = this.note.value.trim();
    if (!o || !text || this.noteBusy()) return;
    this.noteBusy.set(true);
    this.noteError.set(null);
    try {
      this.order.set(await this.api.invoke(apiAdminOrdersIdNotesPost, { id: o.id!, body: { note: text } }));
      this.note.reset('');
      this.toast.add({ severity: 'success', summary: 'Note added', life: 2000 });
    } catch (e) {
      const p = problemOf(e);
      this.noteError.set(fieldError(p, 'note') ?? p.detail ?? p.title ?? 'Could not add the note');
    } finally {
      this.noteBusy.set(false);
    }
  }

  protected async copySlip(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.slipText());
      this.toast.add({ severity: 'success', summary: 'Packing slip copied', life: 2000 });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Could not copy', detail: 'Your browser blocked clipboard access. Use Print instead.', life: 5000 });
    }
  }

  protected print(): void { window.print(); }
}
