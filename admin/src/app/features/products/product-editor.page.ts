import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminProductsIdGet } from '../../api/fn/admin-products/api-admin-products-id-get';
import { apiAdminProductsPost } from '../../api/fn/admin-products/api-admin-products-post';
import { apiAdminProductsIdPut } from '../../api/fn/admin-products/api-admin-products-id-put';
import { apiAdminProductsIdPublishPost } from '../../api/fn/admin-products/api-admin-products-id-publish-post';
import { apiAdminProductsIdUnpublishPost } from '../../api/fn/admin-products/api-admin-products-id-unpublish-post';
import { apiAdminProductsIdDuplicatePost } from '../../api/fn/admin-products/api-admin-products-id-duplicate-post';
import { apiAdminProductsIdDelete } from '../../api/fn/admin-products/api-admin-products-id-delete';
import { apiAdminBrandsGet } from '../../api/fn/admin-catalog/api-admin-brands-get';
import { apiAdminCategoriesGet } from '../../api/fn/admin-catalog/api-admin-categories-get';
import { apiCertificationsGet } from '../../api/fn/public/api-certifications-get';
import { AdminProduct } from '../../api/models/admin-product';
import { Certification } from '../../api/models/certification';
import { Image } from '../../api/models/image';
import { ProductUpsert } from '../../api/models/product-upsert';
import { Variant } from '../../api/models/variant';
import { HasUnsavedChanges } from '../../core/guards';
import { Problem, fieldError, problemOf } from '../../core/http';
import { slugify, storefrontUrl } from '../../core/format';
import { ProductImages } from './product-images';
import { ProductPreview } from './product-preview';
import { SpecGroup, SpecsEditor, newSpecGroup } from './specs-editor';
import { VariantsGrid } from './variants-grid';

type Badge = 'New' | 'Rider\'s pick' | 'Sale';
const BADGES: Badge[] = ['New', 'Rider\'s pick', 'Sale'];
interface Opt { label: string; value: number }

/** compare-at must be higher than price when set */
function compareAtValidator(c: AbstractControl): ValidationErrors | null {
  const compare = c.value as number | null;
  const price = c.parent?.get('price')?.value as number | null | undefined;
  return compare != null && price != null && compare <= price ? { compareAt: true } : null;
}

@Component({
  selector: 'gd-product-editor.page',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, InputNumberModule, TextareaModule, SelectModule, MultiSelectModule,
    ToggleSwitchModule, TagModule, SkeletonModule, ProductImages, ProductPreview, SpecsEditor, VariantsGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .layout { display: grid; gap: 1rem; }
    @media (min-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; } .aside { position: sticky; top: 72px; } }
    .main { display: grid; gap: 1rem; min-width: 0; }
    section.card h2 { margin: 0 0 .9rem; font-size: 1.05rem; }
    .row2 { display: grid; gap: .75rem; } @media (min-width: 640px) { .row2 { grid-template-columns: 1fr 1fr; } }
    input[pInputText], textarea, p-select, p-multiselect, p-inputnumber { width: 100%; }
    input[pInputText], textarea { min-height: 44px; }
    .hint { color: var(--p-surface-400); font-size: .75rem; }
    .inline { display: flex; align-items: center; gap: .6rem; min-height: 44px; }
    .banner { padding: .8rem 1rem; border-radius: 10px; border: 1px solid var(--p-yellow-500); display: flex; gap: .75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 1rem; }
    .bar { position: sticky; z-index: 15; bottom: calc(56px + env(safe-area-inset-bottom)); display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
      margin-top: 1rem; padding: .6rem; background: color-mix(in srgb, var(--p-surface-900) 96%, transparent); border: 1px solid var(--p-surface-600); border-radius: 12px; backdrop-filter: blur(8px); }
    @media (min-width: 900px) { .bar { bottom: .5rem; } }
    .bar .sp { flex: 1; }
    .head { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
    .head .page-title { margin: 0; }
    .unsaved { color: var(--p-yellow-400); font-size: .8rem; }
  `,
  template: `
    <div class="head">
      <a routerLink="/products" pButton class="p-button-text" severity="secondary" icon="pi pi-arrow-left" aria-label="Back to products"></a>
      <h1 class="page-title">{{ isNew() ? 'New product' : (form.controls.title.value || 'Edit product') }}</h1>
      @if (product(); as p) { <p-tag [value]="p.status ?? 'Draft'" [severity]="p.status === 'Published' ? 'success' : 'secondary'" /> }
    </div>

    @if (loadError(); as err) {
      <div class="card empty"><p>{{ err }}</p><button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button></div>
    } @else if (loading()) {
      <p-skeleton height="14rem" borderRadius="12px" /><div style="height:1rem"></div><p-skeleton height="12rem" borderRadius="12px" />
    } @else {
      @if (stale()) {
        <div class="banner"><span>Changed elsewhere. Reload to get the latest version (your unsaved edits here will be lost).</span>
          <button pButton type="button" size="small" icon="pi pi-refresh" label="Reload" (click)="reload()"></button></div>
      }
      @if (formError(); as fe) { <div class="banner" style="border-color:var(--p-red-400)">{{ fe }}</div> }

      <div class="layout">
        <form class="main" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <section class="card">
            <h2>Details</h2>
            <div class="field"><label for="title">Title</label>
              <input pInputText id="title" formControlName="title" maxlength="160" (input)="onTitle()" />
              @if (err('title'); as m) { <small class="field-error">{{ m }}</small> }</div>
            <div class="field"><label for="slug">URL slug</label>
              <input pInputText id="slug" formControlName="slug" maxlength="160" (input)="slugTouched = true" />
              <small class="hint">{{ slugPreview() }}</small>
              @if (err('slug'); as m) { <small class="field-error">{{ m }}</small> }</div>
            <div class="row2">
              <div class="field"><label for="brand">Brand</label>
                <p-select inputId="brand" formControlName="brandId" [options]="brands()" optionLabel="label" optionValue="value" placeholder="Choose brand" [filter]="true" appendTo="body" />
                @if (err('brandId'); as m) { <small class="field-error">{{ m }}</small> }</div>
              <div class="field"><label for="category">Category</label>
                <p-select inputId="category" formControlName="categoryId" [options]="categories()" optionLabel="label" optionValue="value" placeholder="Choose category" appendTo="body" />
                @if (err('categoryId'); as m) { <small class="field-error">{{ m }}</small> }</div>
            </div>
            <div class="field"><label for="short">Short description</label>
              <input pInputText id="short" formControlName="shortDescription" maxlength="240" /></div>
            <div class="field"><label for="desc">Description</label>
              <textarea pTextarea id="desc" formControlName="description" rows="6" [autoResize]="true"></textarea>
              <small class="hint">Markdown-lite: blank line = new paragraph, "- item" = bullet, **bold**.</small></div>
            <div class="field"><label for="note">Gear Doctor note</label>
              <textarea pTextarea id="note" formControlName="gearDoctorNote" rows="3" [autoResize]="true" placeholder="Why Umair recommends it, fit advice..."></textarea></div>
          </section>

          <section class="card">
            <h2>Pricing</h2>
            <div class="row2">
              <div class="field"><label for="price">Price (Rs)</label>
                <p-inputnumber inputId="price" formControlName="price" [min]="0" [useGrouping]="true" inputStyleClass="w-full" styleClass="w-full" />
                @if (err('price'); as m) { <small class="field-error">{{ m }}</small> }</div>
              <div class="field"><label for="cmp">Compare-at price (Rs)</label>
                <p-inputnumber inputId="cmp" formControlName="compareAtPrice" [min]="0" [useGrouping]="true" inputStyleClass="w-full" styleClass="w-full" placeholder="Optional" />
                @if (form.controls.compareAtPrice.errors?.['compareAt']) { <small class="field-error">Must be higher than the price.</small> }
                @else if (err('compareAtPrice'); as m) { <small class="field-error">{{ m }}</small> }</div>
            </div>
            <div class="field"><label for="badges">Badges</label>
              <p-multiselect inputId="badges" formControlName="badges" [options]="badgeOptions" placeholder="None" appendTo="body" display="chip" /></div>
            <div class="inline"><p-toggleswitch formControlName="isFeatured" inputId="feat" ariaLabel="Featured" /><label for="feat">Featured on the storefront home</label></div>
          </section>

          <section class="card">
            <h2>Certifications</h2>
            <p-multiselect formControlName="certificationIds" [options]="certOptions()" optionLabel="label" optionValue="value" placeholder="Select certifications" appendTo="body" display="chip" ariaLabel="Certifications" />
          </section>

          <section class="card">
            <h2>Specs</h2>
            <gd-specs-editor [array]="form.controls.specs" />
          </section>
        </form>

        <aside class="aside">
          <gd-product-preview [imageUrl]="previewImage()" [badges]="v().badges ?? []" [brand]="brandName()" [title]="v().title ?? ''"
            [price]="v().price ?? null" [compareAt]="v().compareAtPrice ?? null" [certs]="certNames()" />
        </aside>
      </div>

      <div class="main" style="margin-top:1rem">
        <section class="card">
          <h2>Variants and stock</h2>
          <gd-variants-grid [productId]="productId()" [variants]="variants()" (saved)="onVariantsSaved($event)" (reload)="reload()" (dirtyChange)="variantsDirty.set($event)" />
        </section>
        <section class="card">
          <h2>Photos</h2>
          <gd-product-images [productId]="productId()" [images]="images()" [defaultAlt]="form.controls.title.value" (changed)="onImages($event)" />
        </section>
      </div>

      <div class="bar" role="toolbar" aria-label="Product actions">
        <button pButton type="button" icon="pi pi-save" [loading]="busy() === 'save'" [disabled]="!!busy()" (click)="save()">{{ isNew() ? 'Save draft' : 'Save' }}</button>
        @if (product()?.status === 'Published') {
          <button pButton type="button" severity="secondary" icon="pi pi-eye-slash" label="Unpublish" [loading]="busy() === 'unpublish'" [disabled]="!!busy()" (click)="setPublished(false)"></button>
        } @else {
          <button pButton type="button" severity="success" icon="pi pi-send" label="Publish" [loading]="busy() === 'publish'" [disabled]="!!busy()" (click)="setPublished(true)"></button>
        }
        @if (!isNew()) {
          <button pButton type="button" severity="secondary" icon="pi pi-copy" label="Duplicate" [loading]="busy() === 'dup'" [disabled]="!!busy()" (click)="duplicate()"></button>
          <a pButton severity="secondary" class="p-button-outlined" icon="pi pi-external-link" label="View on store" [href]="storeUrl()" target="_blank" rel="noopener"></a>
        }
        <span class="sp"></span>
        @if (hasUnsavedChanges()) { <span class="unsaved">Unsaved changes</span> }
        @if (!isNew()) { <button pButton type="button" severity="danger" class="p-button-text" icon="pi pi-trash" label="Delete" [disabled]="!!busy()" (click)="confirmDelete()"></button> }
      </div>
      @if (isNew()) { <p class="hint" style="margin-top:.5rem">Save once to add photos and variants.</p> }
    }
  `,
})
export class ProductEditorPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** route param (absent on /products/new) */
  readonly id = input<string>();

  protected readonly badgeOptions = BADGES;
  protected readonly product = signal<AdminProduct | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal<'save' | 'publish' | 'unpublish' | 'dup' | 'delete' | null>(null);
  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly serverProblem = signal<Problem | null>(null);
  protected readonly variantsDirty = signal(false);
  protected readonly brands = signal<Opt[]>([]);
  protected readonly categories = signal<Opt[]>([]);
  protected readonly certs = signal<Certification[]>([]);
  protected slugTouched = false;

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    slug: [''],
    brandId: this.fb.control<number | null>(null, Validators.required),
    categoryId: this.fb.control<number | null>(null, Validators.required),
    shortDescription: [''],
    description: [''],
    gearDoctorNote: [''],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    compareAtPrice: this.fb.control<number | null>(null, compareAtValidator),
    badges: this.fb.control<Badge[]>([]),
    isFeatured: [false],
    certificationIds: this.fb.control<number[]>([]),
    specs: this.fb.array<SpecGroup>([]),
  });

  protected readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly productId = computed(() => this.product()?.id ?? null);
  protected readonly isNew = computed(() => !this.productId());
  protected readonly variants = computed<readonly Variant[]>(() => this.product()?.variants ?? []);
  protected readonly images = computed<readonly Image[]>(() => this.product()?.images ?? []);
  protected readonly previewImage = computed(() => this.images()[0]?.thumbUrl ?? this.images()[0]?.url ?? null);
  protected readonly certOptions = computed(() => this.certs().map((c) => ({ label: c.name ?? c.code ?? '', value: c.id! })));
  protected readonly brandName = computed(() => this.brands().find((b) => b.value === this.v().brandId)?.label ?? '');
  protected readonly certNames = computed(() => {
    const ids = this.v().certificationIds ?? [];
    return this.certs().filter((c) => ids.includes(c.id!)).map((c) => c.code ?? c.name ?? '');
  });
  protected readonly slugPreview = computed(() => `${location.origin}/products/${this.v().slug || slugify(this.v().title ?? '') || '...'}`);
  protected readonly storeUrl = computed(() => this.product()?.storefrontUrl || storefrontUrl(`products/${this.product()?.slug ?? ''}`));

  constructor() {
    this.form.controls.price.valueChanges.subscribe(() => this.form.controls.compareAtPrice.updateValueAndValidity({ emitEvent: false }));
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  hasUnsavedChanges(): boolean { return this.form.dirty || this.variantsDirty(); }

  protected err(field: string): string | null {
    const c = this.form.get(field);
    const server = fieldError(this.serverProblem(), field);
    if (server) return server;
    if (c && c.touched && c.errors?.['required']) return 'Required';
    if (c && c.touched && c.errors?.['min']) return 'Must be greater than 0';
    return null;
  }

  protected onTitle(): void {
    if (!this.slugTouched && this.isNew()) this.form.controls.slug.setValue(slugify(this.form.controls.title.value));
  }

  protected reload(): void { void this.load(this.id()); }

  async load(idParam: string | undefined = this.id()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.stale.set(false);
    this.formError.set(null);
    this.serverProblem.set(null);
    try {
      const id = idParam ? Number(idParam) : null;
      const [brands, cats, certs, product] = await Promise.all([
        this.api.invoke(apiAdminBrandsGet), this.api.invoke(apiAdminCategoriesGet), this.api.invoke(apiCertificationsGet),
        id ? this.api.invoke(apiAdminProductsIdGet, { id }) : Promise.resolve(null),
      ]);
      const label = (n?: string, active?: boolean) => `${n ?? ''}${active === false ? ' (inactive)' : ''}`;
      this.brands.set(brands.map((b) => ({ label: label(b.name, b.isActive), value: b.id! })));
      this.categories.set(cats.map((c) => ({ label: label(c.name, c.isActive), value: c.id! })));
      this.certs.set(certs);
      this.product.set(product);
      this.fillForm(product);
    } catch (e) {
      const p = problemOf(e);
      this.loadError.set(p.status === 404 ? 'This product no longer exists.' : (p.detail ?? p.title ?? 'Could not load the product'));
    } finally {
      this.loading.set(false);
    }
  }

  private fillForm(p: AdminProduct | null): void {
    const f = this.form;
    f.controls.specs.clear();
    for (const s of p?.specs ?? []) f.controls.specs.push(newSpecGroup(this.fb, s.label, s.value));
    f.patchValue({
      title: p?.title ?? '', slug: p?.slug ?? '', brandId: p?.brandId ?? null, categoryId: p?.categoryId ?? null,
      shortDescription: p?.shortDescription ?? '', description: p?.description ?? '', gearDoctorNote: p?.gearDoctorNote ?? '',
      price: p?.price ?? null, compareAtPrice: p?.compareAtPrice ?? null, badges: p?.badges ?? [], isFeatured: p?.isFeatured ?? false,
      certificationIds: p?.certificationIds ?? [],
    });
    this.slugTouched = !!p;
    f.markAsPristine();
    f.markAsUntouched();
  }

  private body(): ProductUpsert {
    const r = this.form.getRawValue();
    return {
      title: r.title.trim(), slug: r.slug.trim() || null, brandId: r.brandId!, categoryId: r.categoryId!,
      shortDescription: r.shortDescription, description: r.description, gearDoctorNote: r.gearDoctorNote,
      price: r.price!, compareAtPrice: r.compareAtPrice, badges: r.badges, isFeatured: r.isFeatured,
      certificationIds: r.certificationIds, specs: r.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
      version: this.product()?.version ?? null,
    };
  }

  /** Returns true when saved (or nothing to save). */
  protected async save(): Promise<boolean> {
    if (this.busy()) return false;
    this.form.markAllAsTouched();
    this.serverProblem.set(null);
    this.formError.set(null);
    if (this.form.invalid) {
      this.toast.add({ severity: 'warn', summary: 'Check the highlighted fields', life: 3500 });
      return false;
    }
    this.busy.set('save');
    try {
      const existing = this.product();
      if (!existing?.id) {
        const created = await this.api.invoke(apiAdminProductsPost, { body: this.body() });
        this.form.markAsPristine();
        this.toast.add({ severity: 'success', summary: 'Draft saved', detail: 'You can now add photos and variants.', life: 3500 });
        await this.router.navigate(['/products', created.id], { replaceUrl: true });
      } else {
        const saved = await this.api.invoke(apiAdminProductsIdPut, { id: existing.id, body: this.body() });
        this.product.update((p) => ({ ...saved, variants: saved.variants ?? p?.variants, images: saved.images ?? p?.images }));
        this.form.markAsPristine();
        this.toast.add({ severity: 'success', summary: 'Saved', life: 2500 });
      }
      return true;
    } catch (e) {
      this.handleSaveError(e);
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  private handleSaveError(e: unknown): void {
    const p = problemOf(e);
    if (p.status === 409 && (p.type ?? '').includes('stale')) { this.stale.set(true); return; }
    this.serverProblem.set(p);
    if (p.errors && Object.keys(p.errors).length) {
      this.form.markAllAsTouched();
      this.formError.set(p.title ?? 'Please fix the highlighted fields.');
    } else {
      this.formError.set(p.detail ?? p.title ?? 'Could not save');
    }
    this.toast.add({ severity: 'error', summary: 'Could not save', detail: p.detail ?? p.title, life: 6000 });
  }

  protected async setPublished(publish: boolean): Promise<void> {
    if (this.busy()) return;
    const existing = this.product();
    if (publish && (this.form.dirty || !existing?.id)) {
      if (!(await this.save())) return;
      if (!this.product()?.id) { return; }   // new product: URL switched; publish from the new page
    }
    const id = this.product()?.id;
    if (!id) return;
    this.busy.set(publish ? 'publish' : 'unpublish');
    try {
      const updated = await this.api.invoke(publish ? apiAdminProductsIdPublishPost : apiAdminProductsIdUnpublishPost, { id });
      this.product.update((p) => ({ ...(p ?? {}), ...updated, variants: updated.variants ?? p?.variants, images: updated.images ?? p?.images }));
      this.toast.add({ severity: 'success', summary: publish ? 'Published' : 'Back to draft', life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      this.toast.add({ severity: 'error', summary: publish ? 'Could not publish' : 'Could not unpublish', detail: p.detail ?? p.title, life: 7000 });
    } finally {
      this.busy.set(null);
    }
  }

  protected async duplicate(): Promise<void> {
    const id = this.productId();
    if (!id || this.busy()) return;
    if (this.hasUnsavedChanges() && !confirm('Duplicate the saved version? Your unsaved edits are not included.')) return;
    this.busy.set('dup');
    try {
      const copy = await this.api.invoke(apiAdminProductsIdDuplicatePost, { id });
      this.form.markAsPristine(); this.variantsDirty.set(false);
      this.toast.add({ severity: 'success', summary: 'Duplicated as a draft', life: 3000 });
      await this.router.navigate(['/products', copy.id]);
    } catch (e) {
      this.toast.add({ severity: 'error', summary: 'Could not duplicate', detail: problemOf(e).detail, life: 6000 });
    } finally {
      this.busy.set(null);
    }
  }

  protected confirmDelete(): void {
    const id = this.productId();
    if (!id) return;
    this.confirm.confirm({
      header: 'Delete this product?', message: `"${this.product()?.title}" and its photos will be permanently removed. Past orders keep their own copy.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Cancel', acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        this.busy.set('delete');
        try {
          await this.api.invoke(apiAdminProductsIdDelete, { id });
          this.form.markAsPristine(); this.variantsDirty.set(false);
          this.toast.add({ severity: 'success', summary: 'Product deleted', life: 3000 });
          await this.router.navigate(['/products']);
        } catch (e) {
          const p = problemOf(e);
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: p.detail ?? p.title, life: 7000 });
        } finally {
          this.busy.set(null);
        }
      },
    });
  }

  protected onVariantsSaved(vs: Variant[]): void { this.product.update((p) => (p ? { ...p, variants: vs } : p)); }
  protected onImages(imgs: Image[]): void { this.product.update((p) => (p ? { ...p, images: imgs } : p)); }
}
