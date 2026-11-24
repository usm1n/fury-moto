import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminProductsIdVariantsPut } from '../../api/fn/admin-products/api-admin-products-id-variants-put';
import { Variant } from '../../api/models/variant';
import { problemOf } from '../../core/http';
import { ColorChip, VariantRow, buildMatrix, colorHexForName, chipsFromRows, normalizeHex, uniqueChips } from '../../shared/variant-matrix';

const toRows = (vs: readonly Variant[]): VariantRow[] => vs.map((v) => ({
  id: v.id ?? null, size: v.size ?? '', color: v.color ?? '', colorHex: v.colorHex ?? null, sku: v.sku ?? '',
  stock: v.stock ?? 0, isActive: v.isActive ?? true, priceOverride: v.priceOverride ?? null, version: v.version ?? null,
}));
const snapshot = (rows: readonly VariantRow[]): string => JSON.stringify(rows.map((r) => [r.id, r.size, r.color, r.colorHex, r.sku, r.stock, r.isActive, r.priceOverride]));

/** Sizes + colours as chips -> size x colour matrix with stock, SKU and active toggle. Saves with PUT /variants. */
@Component({
  selector: 'gd-variants-grid',
  imports: [FormsModule, ButtonModule, InputTextModule, InputNumberModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .chips { display: flex; flex-wrap: wrap; gap: .4rem; margin: .4rem 0 .6rem; }
    .chip { display: inline-flex; align-items: center; gap: .35rem; padding: .25rem .3rem .25rem .7rem; border-radius: 999px; background: var(--p-surface-800); border: 1px solid var(--p-surface-600); font-size: .85rem; min-height: 32px; }
    .chip button { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; color: var(--p-surface-300); }
    .chip button:hover { background: var(--p-surface-700); }
    .swatch { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--p-surface-400); flex: none; }
    .adder { display: flex; gap: .4rem; align-items: center; }
    .adder input[type=text], .adder input.name { flex: 1; min-width: 0; min-height: 44px; }
    .adder input[type=color] { width: 44px; height: 44px; padding: 2px; background: none; border: 1px solid var(--p-surface-600); border-radius: 8px; }
    h4 { margin: 1rem 0 0; font-size: .85rem; color: var(--p-surface-200); font-weight: 500; }
    .grid { display: grid; gap: .5rem; margin-top: 1rem; }
    .vrow { display: grid; grid-template-columns: 1fr auto; gap: .5rem .75rem; align-items: center; padding: .65rem; background: var(--p-surface-950); border: 1px solid var(--p-surface-700); border-radius: 10px; }
    .vrow.off { opacity: .55; }
    .vname { display: flex; align-items: center; gap: .5rem; font-weight: 600; }
    .vfields { grid-column: 1 / -1; display: grid; grid-template-columns: 110px 1fr; gap: .5rem; }
    .vfields input { min-height: 44px; width: 100%; }
    .lbl { font-size: .7rem; color: var(--p-surface-400); display: block; margin-bottom: .15rem; }
    .foot { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: 1rem; }
    .stale { margin-top: .75rem; padding: .7rem; border: 1px solid var(--p-yellow-500); border-radius: 8px; display: flex; gap: .75rem; align-items: center; justify-content: space-between; }
  `,
  template: `
    @if (!productId()) {
      <p class="muted"><i class="pi pi-info-circle"></i> Save the product once to add sizes and stock.</p>
    } @else {
      <h4>Sizes</h4>
      <div class="chips">
        @for (s of sizes(); track s) {
          <span class="chip">{{ s }}<button type="button" (click)="removeSize(s)" [attr.aria-label]="'Remove size ' + s"><i class="pi pi-times"></i></button></span>
        }
      </div>
      <form class="adder" (ngSubmit)="addSizes()">
        <input pInputText type="text" name="size" [(ngModel)]="sizeInput" placeholder="e.g. S, M, L (comma separated)" aria-label="Add sizes" />
        <button pButton type="submit" severity="secondary" aria-label="Add size" [disabled]="!sizeInput.trim()"><span pButtonIcon class="pi pi-plus"></span></button>
      </form>

      <h4>Colours</h4>
      <div class="chips">
        @for (c of colors(); track c.name) {
          <span class="chip"><span class="swatch" [style.background]="c.hex ?? 'transparent'"></span>{{ c.name }}<button type="button" (click)="removeColor(c.name)" [attr.aria-label]="'Remove colour ' + c.name"><i class="pi pi-times"></i></button></span>
        }
      </div>
      <form class="adder" (ngSubmit)="addColor()">
        <input pInputText class="name" type="text" name="colorName" [(ngModel)]="colorName" placeholder="Colour name, e.g. Matte black" aria-label="Colour name" />
        <input type="color" name="colorHex" [(ngModel)]="colorHex" aria-label="Colour swatch" />
        <button pButton type="submit" severity="secondary" aria-label="Add colour" [disabled]="!colorName.trim()"><span pButtonIcon class="pi pi-plus"></span></button>
      </form>

      <div class="grid">
        @for (r of rows(); track r.size + '|' + r.color; let i = $index) {
          <div class="vrow" [class.off]="!r.isActive">
            <div class="vname"><span class="swatch" [style.background]="r.colorHex ?? 'transparent'"></span>{{ r.size }} · {{ r.color }}</div>
            <p-toggleswitch [ngModel]="r.isActive" (onChange)="patch(i, { isActive: $event.checked })" [ariaLabel]="'Active ' + r.size + ' ' + r.color" />
            <div class="vfields">
              <div><label class="lbl" [attr.for]="'stk' + i">Stock</label>
                <p-inputnumber [inputId]="'stk' + i" [ngModel]="r.stock" (ngModelChange)="patch(i, { stock: $event ?? 0 })" [min]="0" [showButtons]="false" inputStyleClass="w-full" styleClass="w-full" /></div>
              <div><label class="lbl" [attr.for]="'sku' + i">SKU (blank = auto)</label>
                <input pInputText [id]="'sku' + i" [ngModel]="r.sku" (ngModelChange)="patch(i, { sku: $event })" [placeholder]="'auto'" maxlength="60" /></div>
            </div>
          </div>
        } @empty {
          <p class="muted">Add sizes and colours above, or just save to create a single "One size / Standard" variant.</p>
        }
      </div>

      @if (stale()) {
        <div class="stale"><span>Variants changed elsewhere. Reload to see the latest.</span><button pButton type="button" size="small" (click)="reload.emit()"><span pButtonLabel>Reload</span></button></div>
      }
      <div class="foot">
        <button pButton type="button" [loading]="saving()" [disabled]="!dirty() || saving()" (click)="save()"><span pButtonIcon class="pi pi-save"></span><span pButtonLabel>Save variants</span></button>
        @if (dirty()) { <span class="muted">Unsaved variant changes</span> }
        <span class="muted">Removed combinations are deactivated, not deleted.</span>
      </div>
    }
  `,
})
export class VariantsGrid {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);

  readonly productId = input<number | null>(null);
  readonly variants = input<readonly Variant[]>([]);
  readonly saved = output<Variant[]>();
  readonly reload = output<void>();
  readonly dirtyChange = output<boolean>();

  /** Reset from the saved list whenever the parent hands over a new one. */
  protected readonly rows = linkedSignal<readonly Variant[], VariantRow[]>({ source: this.variants, computation: (v) => toRows(v) });
  protected readonly sizes = linkedSignal<readonly Variant[], string[]>({ source: this.variants, computation: (v) => chipsFromRows(toRows(v)).sizes });
  protected readonly colors = linkedSignal<readonly Variant[], ColorChip[]>({ source: this.variants, computation: (v) => chipsFromRows(toRows(v)).colors });
  protected readonly saving = signal(false);
  protected readonly stale = signal(false);
  private readonly baseline = computed(() => snapshot(toRows(this.variants())));
  readonly dirty = computed(() => snapshot(this.rows()) !== this.baseline());

  protected sizeInput = '';
  protected colorName = '';
  protected colorHex = '#222222';

  private lastDirty = false;
  private emitDirty(): void { const d = this.dirty(); if (d !== this.lastDirty) { this.lastDirty = d; this.dirtyChange.emit(d); } }

  private rebuild(sizes: string[], colors: ColorChip[]): void {
    this.sizes.set(sizes);
    this.colors.set(colors);
    this.rows.set(buildMatrix(sizes, colors, this.rows()));
    this.emitDirty();
  }

  protected addSizes(): void {
    const added = this.sizeInput.split(/[,\n]/);
    this.sizeInput = '';
    this.rebuild(uniqueChips([...this.sizes(), ...added]), this.colors());
  }
  protected removeSize(s: string): void { this.rebuild(this.sizes().filter((x) => x !== s), this.colors()); }

  protected addColor(): void {
    const name = this.colorName.trim();
    if (!name || this.colors().some((c) => c.name.toLowerCase() === name.toLowerCase())) { this.colorName = ''; return; }
    const mapped = this.colorHex === '#222222' ? colorHexForName(name) : null;
    const hex = mapped ?? normalizeHex(this.colorHex);
    this.colorName = '';
    this.rebuild(this.sizes(), [...this.colors(), { name, hex }]);
  }
  protected removeColor(name: string): void { this.rebuild(this.sizes(), this.colors().filter((c) => c.name !== name)); }

  protected patch(i: number, p: Partial<VariantRow>): void {
    this.rows.update((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
    this.emitDirty();
  }

  protected async save(): Promise<void> {
    const id = this.productId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    try {
      let rows = this.rows();
      if (rows.length === 0) rows = buildMatrix([], [], []);
      const body = rows.map((r) => ({
        id: r.id, size: r.size, color: r.color, colorHex: r.colorHex, sku: r.sku.trim() || null,
        stock: r.stock, isActive: r.isActive, priceOverride: r.priceOverride, version: r.version,
      }));
      const saved = await this.api.invoke(apiAdminProductsIdVariantsPut, { id, body });
      this.stale.set(false);
      this.saved.emit(saved);
      this.lastDirty = false;
      this.dirtyChange.emit(false);
      this.toast.add({ severity: 'success', summary: 'Variants saved', life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 409 && (p.type ?? '').includes('stale')) this.stale.set(true);
      else this.toast.add({ severity: 'error', summary: 'Could not save variants', detail: p.detail ?? p.title, life: 7000 });
    } finally {
      this.saving.set(false);
    }
  }
}
