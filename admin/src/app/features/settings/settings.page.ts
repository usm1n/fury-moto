import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { map, startWith } from 'rxjs';
import { Api } from '../../api/api';
import { apiAdminSettingsGet } from '../../api/fn/admin-settings/api-admin-settings-get';
import { apiAdminSettingsPut } from '../../api/fn/admin-settings/api-admin-settings-put';
import { AdminSettings } from '../../api/models/admin-settings';
import { HasUnsavedChanges } from '../../core/guards';
import { Problem, fieldError, problemOf } from '../../core/http';

const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim());

@Component({
  selector: 'gd-settings.page',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, InputTextModule, SkeletonModule, TextareaModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    form { display: grid; gap: 1rem; max-width: 46rem; }
    h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
    .hint { color: var(--p-surface-300); font-size: .8rem; }
    input, textarea, p-inputnumber { width: 100%; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 44px; margin-bottom: .5rem; }
    .row label { flex: 1; }
    .two { display: grid; gap: 0 .75rem; }
    @media (min-width: 640px) { .two { grid-template-columns: 1fr 1fr; } }
    .bar { position: sticky; z-index: 15; bottom: calc(56px + env(safe-area-inset-bottom)); display: flex; gap: .75rem; align-items: center; justify-content: flex-end;
      padding: .6rem; background: color-mix(in srgb, var(--p-surface-900) 96%, transparent); border: 1px solid var(--p-surface-600); border-radius: 12px; backdrop-filter: blur(8px); }
    @media (min-width: 900px) { .bar { bottom: .5rem; } }
    .unsaved { color: var(--p-yellow-400); font-size: .85rem; margin-right: auto; }
    .error { display: grid; gap: .75rem; justify-items: center; }
  `,
  template: `
    <h1 class="page-title">Settings</h1>

    @if (loadError(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button>
      </div>
    } @else if (!loaded()) {
      <p-skeleton height="12rem" /><br /><p-skeleton height="10rem" />
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <section class="card">
          <h2>Contact</h2>
          <div class="field">
            <label for="wa">WhatsApp number</label>
            <input pInputText id="wa" formControlName="whatsappNumber" inputmode="numeric" autocomplete="off" placeholder="92300XXXXXXX" />
            <span class="hint">Digits only with country code, no + or spaces (e.g. 923001234567). Customers' order messages go here.</span>
            @if (err('whatsappNumber', 'whatsappNumber'); as e) { <small class="field-error">{{ e }}</small> }
          </div>
          <div class="two">
            <div class="field">
              <label for="phone">Phone (shown on the site)</label>
              <input pInputText id="phone" formControlName="phoneDisplay" inputmode="tel" placeholder="0300 1234567" />
              @if (err('phoneDisplay'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input pInputText id="email" type="email" formControlName="email" inputmode="email" />
              @if (err('email'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
            <div class="field">
              <label for="city">City</label>
              <input pInputText id="city" formControlName="city" />
              @if (err('city'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
            <div class="field">
              <label for="hours">Opening hours</label>
              <input pInputText id="hours" formControlName="hours" placeholder="Mon-Sat, 10am-8pm" />
              @if (err('hours'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="addr">Shop address</label>
            <textarea pTextarea id="addr" rows="2" formControlName="address"></textarea>
            @if (err('address'); as e) { <small class="field-error">{{ e }}</small> }
          </div>
        </section>

        <section class="card">
          <h2>Orders and payment</h2>
          <div class="two">
            <div class="field">
              <label for="fee">Delivery fee (PKR)</label>
              <p-inputnumber inputId="fee" formControlName="deliveryFee" [min]="0" [useGrouping]="false" mode="decimal" inputStyleClass="w-full" styleClass="w-full" />
              @if (err('deliveryFee'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
            <div class="field">
              <label for="low">Low-stock threshold</label>
              <p-inputnumber inputId="low" formControlName="lowStockThreshold" [min]="0" [useGrouping]="false" mode="decimal" inputStyleClass="w-full" styleClass="w-full" />
              <span class="hint">Variants at or below this show on the dashboard.</span>
              @if (err('lowStockThreshold'); as e) { <small class="field-error">{{ e }}</small> }
            </div>
          </div>
          <div class="row"><label for="cod">Cash on delivery</label><p-toggleswitch inputId="cod" formControlName="codEnabled" /></div>
          <div class="row"><label for="bank">Bank transfer</label><p-toggleswitch inputId="bank" formControlName="bankTransferEnabled" /></div>
          @if (err('codEnabled'); as e) { <small class="field-error">{{ e }}</small> }
          @if (bankOn()) {
            <div class="two" style="margin-top:.5rem">
              <div class="field">
                <label for="bn">Bank name</label>
                <input pInputText id="bn" formControlName="bankName" />
                @if (form.controls.bankName.touched && form.controls.bankName.hasError('required')) { <small class="field-error">Bank name is required.</small> }
              </div>
              <div class="field">
                <label for="at">Account title</label>
                <input pInputText id="at" formControlName="accountTitle" />
                @if (form.controls.accountTitle.touched && form.controls.accountTitle.hasError('required')) { <small class="field-error">Account title is required.</small> }
              </div>
            </div>
            <div class="field">
              <label for="iban">IBAN</label>
              <input pInputText id="iban" formControlName="iban" autocapitalize="characters" placeholder="PK00 XXXX 0000 0000 0000 0000" />
              @if (form.controls.iban.touched && form.controls.iban.hasError('required')) { <small class="field-error">IBAN is required.</small> }
            </div>
            @if (err('bankDetails'); as e) { <small class="field-error">{{ e }}</small> }
          }
        </section>

        <div class="bar">
          @if (form.dirty) { <span class="unsaved">Unsaved changes</span> }
          <button pButton type="submit" label="Save settings" icon="pi pi-check" [loading]="saving()" [disabled]="saving() || !form.dirty"></button>
        </div>
      </form>
    }
  `,
})
export class SettingsPage implements OnInit, HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(MessageService);

  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly problem = signal<Problem | null>(null);

  protected readonly form = this.fb.group({
    whatsappNumber: ['', Validators.pattern(/^[0-9]{10,15}$/)],
    phoneDisplay: [''],
    email: ['', Validators.email],
    city: [''],
    address: [''],
    hours: [''],
    deliveryFee: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    lowStockThreshold: this.fb.control<number | null>(5, [Validators.required, Validators.min(0)]),
    codEnabled: [true],
    bankTransferEnabled: [false],
    bankName: [''],
    accountTitle: [''],
    iban: [''],
  });

  protected readonly bankOn = toSignal(
    this.form.controls.bankTransferEnabled.valueChanges.pipe(startWith(this.form.controls.bankTransferEnabled.value), map((v) => !!v)),
    { initialValue: false },
  );
  protected readonly hasProblem = computed(() => !!this.problem());

  constructor() {
    // Bank fields are required only while bank transfer is on.
    this.form.controls.bankTransferEnabled.valueChanges.subscribe((on) => this.applyBankValidators(on));
  }

  ngOnInit(): void { void this.load(); }

  hasUnsavedChanges(): boolean { return this.form.dirty; }

  private applyBankValidators(on: boolean): void {
    for (const c of [this.form.controls.bankName, this.form.controls.accountTitle, this.form.controls.iban]) {
      if (on) c.setValidators(Validators.required); else c.clearValidators();
      c.updateValueAndValidity({ emitEvent: false });
    }
  }

  /** Server message for a field (with optional alias key), falling back to nothing; client errors show on blur. */
  protected err(field: string, alias?: string): string | null {
    const server = fieldError(this.problem(), field) ?? (alias ? fieldError(this.problem(), alias) : null)
      ?? fieldError(this.problem(), field.charAt(0).toUpperCase() + field.slice(1));
    if (server) return server;
    const c = this.form.get(field);
    if (c?.touched && c.hasError('pattern')) return 'WhatsApp number must be 10-15 digits, no spaces or +.';
    if (c?.touched && c.hasError('email')) return 'Enter a valid email address.';
    if (c?.touched && (c.hasError('required') || c.hasError('min'))) return 'Enter a number of 0 or more.';
    return null;
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.patch(await this.api.invoke(apiAdminSettingsGet));
      this.loaded.set(true);
    } catch (e) {
      this.loadError.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load settings');
    }
  }

  private patch(s: AdminSettings): void {
    this.form.reset({
      whatsappNumber: s.whatsappNumber ?? '', phoneDisplay: s.phoneDisplay ?? '', email: s.email ?? '', city: s.city ?? '',
      address: s.address ?? '', hours: s.hours ?? '', deliveryFee: s.deliveryFee, lowStockThreshold: s.lowStockThreshold,
      codEnabled: s.codEnabled, bankTransferEnabled: !!s.bankTransferEnabled,
      bankName: s.bankDetails?.bankName ?? '', accountTitle: s.bankDetails?.accountTitle ?? '', iban: s.bankDetails?.iban ?? '',
    });
    this.applyBankValidators(!!s.bankTransferEnabled);
  }

  protected async save(): Promise<void> {
    this.problem.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.toast.add({ severity: 'warn', summary: 'Check the highlighted fields', life: 3500 });
      return;
    }
    const v = this.form.getRawValue();
    const body: AdminSettings = {
      whatsappNumber: nullable(v.whatsappNumber), phoneDisplay: nullable(v.phoneDisplay), email: nullable(v.email), city: nullable(v.city),
      address: nullable(v.address), hours: nullable(v.hours), deliveryFee: v.deliveryFee ?? 0, lowStockThreshold: v.lowStockThreshold ?? 0,
      codEnabled: v.codEnabled, bankTransferEnabled: v.bankTransferEnabled,
      bankDetails: v.bankTransferEnabled ? { bankName: v.bankName.trim(), accountTitle: v.accountTitle.trim(), iban: v.iban.trim() } : null,
    };
    this.saving.set(true);
    try {
      this.patch(await this.api.invoke(apiAdminSettingsPut, { body }));
      this.toast.add({ severity: 'success', summary: 'Settings saved', life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      this.problem.set(p);
      this.toast.add({ severity: 'error', summary: 'Could not save settings', detail: p.errors ? 'Fix the highlighted fields and try again.' : (p.detail ?? p.title), life: 6000 });
    } finally {
      this.saving.set(false);
    }
  }
}
