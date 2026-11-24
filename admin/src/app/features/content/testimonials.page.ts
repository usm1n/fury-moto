import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { RatingModule } from 'primeng/rating';
import { TextareaModule } from 'primeng/textarea';
import { SkeletonModule } from 'primeng/skeleton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminTestimonialsGet } from '../../api/fn/admin-content/api-admin-testimonials-get';
import { apiAdminTestimonialsPost } from '../../api/fn/admin-content/api-admin-testimonials-post';
import { apiAdminTestimonialsIdPut } from '../../api/fn/admin-content/api-admin-testimonials-id-put';
import { apiAdminTestimonialsIdDelete } from '../../api/fn/admin-content/api-admin-testimonials-id-delete';
import { apiAdminTestimonialsReorderPost } from '../../api/fn/admin-content/api-admin-testimonials-reorder-post';
import { AdminTestimonial } from '../../api/models/admin-testimonial';
import { Problem, fieldError, problemOf } from '../../core/http';
import { moveItem } from './content-helpers';

@Component({
  selector: 'gd-testimonials.page',
  imports: [FormsModule, ReactiveFormsModule, CdkDropList, CdkDrag, CdkDragHandle, ButtonModule, DialogModule, InputTextModule, RatingModule, TextareaModule, SkeletonModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 820px; }
    .list { display: grid; gap: .5rem; }
    .item { display: flex; align-items: center; gap: .5rem; padding: .5rem .6rem; min-height: 72px;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .item.is-draft .body { opacity: .6; }
    .handle { cursor: grab; color: var(--p-surface-400); min-width: 44px; min-height: 44px; display: grid; place-items: center; touch-action: none; }
    .body { flex: 1; min-width: 0; display: grid; gap: .2rem; }
    .who { font-weight: 600; overflow-wrap: anywhere; }
    .bike { color: var(--p-surface-400); font-size: .8rem; font-weight: 400; }
    .quote { color: var(--p-surface-300); font-size: .85rem; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .stars { color: var(--p-yellow-400); letter-spacing: .1em; font-size: .85rem; }
    .actions { display: flex; align-items: center; gap: .1rem; flex-wrap: wrap; justify-content: flex-end; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,.5); border-radius: 12px; background: var(--p-surface-800); }
    .cdk-drag-placeholder { opacity: .3; }
    .cdk-drag-animating { transition: transform 200ms ease; }
    .error { display: grid; gap: .75rem; justify-items: center; }
    .hint { color: var(--p-surface-400); font-size: .75rem; }
    .counter { text-align: right; } .counter.over { color: var(--p-red-400); }
    .inline { display: flex; align-items: center; gap: .6rem; min-height: 44px; }
    form input, form textarea { width: 100%; min-height: 44px; }
  `,
  template: `
    <div class="page-head">
      <h1 class="page-title">Testimonials</h1>
      <button pButton type="button" (click)="openNew()"><span pButtonIcon class="pi pi-plus"></span><span pButtonLabel>Add testimonial</span></button>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" (click)="load()"><span pButtonIcon class="pi pi-refresh"></span><span pButtonLabel>Try again</span></button>
      </div>
    } @else if (loading()) {
      <div class="list">@for (i of [1, 2, 3, 4]; track i) { <p-skeleton height="72px" borderRadius="12px" /> }</div>
    } @else if (items().length === 0) {
      <div class="card empty"><p>No testimonials yet.</p><button pButton type="button" (click)="openNew()"><span pButtonIcon class="pi pi-plus"></span><span pButtonLabel>Add the first one</span></button></div>
    } @else {
      <div class="list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (t of items(); track t.id) {
          <div class="item" [class.is-draft]="!t.isPublished" cdkDrag>
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><i class="pi pi-bars"></i></span>
            <div class="body">
              <span class="who">{{ t.name }} @if (t.bike) { <span class="bike">· {{ t.bike }}</span> }</span>
              <span class="stars" [attr.aria-label]="t.rating + ' out of 5 stars'">{{ stars(t.rating) }}</span>
              <span class="quote">{{ t.quote }}</span>
            </div>
            <div class="actions">
              <p-toggleswitch [ngModel]="t.isPublished" (onChange)="togglePublish(t, $event.checked)" [ariaLabel]="'Published: ' + t.name" />
              <button pButton type="button" class="p-button-text" severity="secondary" [attr.aria-label]="'Edit ' + t.name" (click)="openEdit(t)"><span pButtonIcon class="pi pi-pencil"></span></button>
              <button pButton type="button" class="p-button-text" severity="danger" [attr.aria-label]="'Delete ' + t.name" (click)="confirmDelete(t)"><span pButtonIcon class="pi pi-trash"></span></button>
            </div>
          </div>
        }
      </div>
    }

    <p-dialog closeAriaLabel="Close" [header]="editing() ? 'Edit testimonial' : 'New testimonial'" [visible]="dialogOpen()" (visibleChange)="dialogOpen.set($event)" [modal]="true"
      [style]="{ width: 'min(36rem, 94vw)' }" [draggable]="false" [closable]="!saving()" appendTo="body">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="field"><label for="t-name">Name</label>
          <input pInputText id="t-name" formControlName="name" maxlength="80" />
          <small class="hint counter" [class.over]="nameLen() > 80">{{ nameLen() }}/80</small>
          @if (err('name'); as m) { <small class="field-error">{{ m }}</small> }</div>
        <div class="field"><label for="t-bike">Bike (optional)</label>
          <input pInputText id="t-bike" formControlName="bike" maxlength="80" placeholder="e.g. Yamaha R15" />
          <small class="hint counter" [class.over]="bikeLen() > 80">{{ bikeLen() }}/80</small></div>
        <div class="field"><label id="t-rating-l">Rating</label>
          <p-rating formControlName="rating" [stars]="5" aria-labelledby="t-rating-l" />
          @if (err('rating'); as m) { <small class="field-error">{{ m }}</small> }</div>
        <div class="field"><label for="t-quote">Quote</label>
          <textarea pTextarea id="t-quote" formControlName="quote" rows="5" maxlength="600" [autoResize]="true"></textarea>
          <small class="hint counter" [class.over]="quoteLen() > 600">{{ quoteLen() }}/600</small>
          @if (err('quote'); as m) { <small class="field-error">{{ m }}</small> }</div>
        <div class="inline"><p-toggleswitch formControlName="isPublished" inputId="t-pub" ariaLabel="Published" /><label for="t-pub">Published</label></div>
        @if (formError(); as fe) { <small class="field-error">{{ fe }}</small> }
        <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
          <button pButton type="button" severity="secondary" [disabled]="saving()" (click)="dialogOpen.set(false)"><span pButtonLabel>Cancel</span></button>
          <button pButton type="submit" [loading]="saving()"><span pButtonIcon class="pi pi-save"></span><span pButtonLabel>Save</span></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class TestimonialsPage implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly items = signal<AdminTestimonial[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<AdminTestimonial | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverProblem = signal<Problem | null>(null);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    bike: ['', Validators.maxLength(80)],
    quote: ['', [Validators.required, Validators.maxLength(600)]],
    rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    isPublished: [true],
  });
  private readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly nameLen = computed(() => (this.v().name ?? '').length);
  protected readonly bikeLen = computed(() => (this.v().bike ?? '').length);
  protected readonly quoteLen = computed(() => (this.v().quote ?? '').length);

  protected stars(n: number | undefined): string {
    const r = Math.max(0, Math.min(5, n ?? 0));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.api.invoke(apiAdminTestimonialsGet));
    } catch (e) {
      const p = problemOf(e);
      this.error.set(p.detail ?? p.title ?? 'Could not load testimonials');
    } finally {
      this.loading.set(false);
    }
  }

  protected err(field: string): string | null {
    const c = this.form.get(field);
    if (fieldError(this.serverProblem(), field)) return fieldError(this.serverProblem(), field);
    if (c?.touched && c.errors?.['required']) return 'Required';
    if (c?.touched && (c.errors?.['min'] || c.errors?.['max'])) return 'Pick 1 to 5 stars';
    return null;
  }

  protected openNew(): void { this.open(null); }
  protected openEdit(t: AdminTestimonial): void { this.open(t); }
  private open(t: AdminTestimonial | null): void {
    this.editing.set(t);
    this.serverProblem.set(null);
    this.formError.set(null);
    this.form.reset({ name: t?.name ?? '', bike: t?.bike ?? '', quote: t?.quote ?? '', rating: t?.rating ?? 5, isPublished: t?.isPublished ?? true });
    this.dialogOpen.set(true);
  }

  private bodyOf(r: { name: string; bike: string; quote: string; rating: number; isPublished: boolean }) {
    return { name: r.name.trim(), bike: r.bike.trim() || null, quote: r.quote.trim(), rating: r.rating, isPublished: r.isPublished };
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.serverProblem.set(null);
    this.formError.set(null);
    if (this.form.invalid) return;
    const body = this.bodyOf(this.form.getRawValue());
    const cur = this.editing();
    this.saving.set(true);
    try {
      if (cur?.id) {
        const saved = await this.api.invoke(apiAdminTestimonialsIdPut, { id: cur.id, body });
        this.items.update((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      } else {
        const created = await this.api.invoke(apiAdminTestimonialsPost, { body });
        this.items.update((l) => [...l, created]);
      }
      this.dialogOpen.set(false);
      this.toast.add({ severity: 'success', summary: cur ? 'Testimonial saved' : 'Testimonial added', life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      this.serverProblem.set(p);
      this.formError.set(p.errors ? (p.title ?? 'Please fix the highlighted fields.') : (p.detail ?? p.title ?? 'Could not save'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async togglePublish(t: AdminTestimonial, on: boolean): Promise<void> {
    this.items.update((l) => l.map((x) => (x.id === t.id ? { ...x, isPublished: on } : x)));
    try {
      const saved = await this.api.invoke(apiAdminTestimonialsIdPut, {
        id: t.id!, body: this.bodyOf({ name: t.name ?? '', bike: t.bike ?? '', quote: t.quote ?? '', rating: t.rating ?? 5, isPublished: on }),
      });
      this.items.update((l) => l.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      this.items.update((l) => l.map((x) => (x.id === t.id ? t : x)));
      this.fail('Could not update', e);
    }
  }

  protected confirmDelete(t: AdminTestimonial): void {
    this.confirm.confirm({
      header: `Delete ${t.name}'s testimonial?`, message: 'This removes it from the storefront.', icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger', accept: () => void this.remove(t),
    });
  }

  private async remove(t: AdminTestimonial): Promise<void> {
    const before = this.items();
    this.items.set(before.filter((x) => x.id !== t.id));
    try {
      await this.api.invoke(apiAdminTestimonialsIdDelete, { id: t.id! });
      this.toast.add({ severity: 'success', summary: 'Testimonial deleted', life: 2500 });
    } catch (e) {
      this.items.set(before);
      this.fail('Could not delete', e);
    }
  }

  protected async drop(e: CdkDragDrop<AdminTestimonial[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const before = this.items();
    const next = moveItem(before, e.previousIndex, e.currentIndex);
    this.items.set(next);
    try {
      await this.api.invoke(apiAdminTestimonialsReorderPost, { body: { ids: next.map((x) => x.id!) } });
    } catch (err) {
      this.items.set(before);
      this.fail('Could not save the new order', err);
    }
  }

  private fail(summary: string, e: unknown): void {
    const p = problemOf(e);
    this.toast.add({ severity: 'error', summary, detail: p.detail ?? p.title, life: 6000 });
  }
}
