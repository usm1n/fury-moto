import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SkeletonModule } from 'primeng/skeleton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminFaqsGet } from '../../api/fn/admin-content/api-admin-faqs-get';
import { apiAdminFaqsPost } from '../../api/fn/admin-content/api-admin-faqs-post';
import { apiAdminFaqsIdPut } from '../../api/fn/admin-content/api-admin-faqs-id-put';
import { apiAdminFaqsIdDelete } from '../../api/fn/admin-content/api-admin-faqs-id-delete';
import { apiAdminFaqsReorderPost } from '../../api/fn/admin-content/api-admin-faqs-reorder-post';
import { AdminFaq } from '../../api/models/admin-faq';
import { Problem, fieldError, problemOf } from '../../core/http';
import { moveItem } from './content-helpers';

@Component({
  selector: 'gd-faqs.page',
  imports: [FormsModule, ReactiveFormsModule, CdkDropList, CdkDrag, CdkDragHandle, ButtonModule, DialogModule, InputTextModule, TextareaModule, SkeletonModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 820px; }
    .list { display: grid; gap: .5rem; }
    .item { display: flex; align-items: center; gap: .5rem; padding: .5rem .6rem; min-height: 64px;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .item.is-draft .q, .item.is-draft .a { opacity: .6; }
    .handle { cursor: grab; color: var(--p-surface-400); min-width: 44px; min-height: 44px; display: grid; place-items: center; touch-action: none; }
    .body { flex: 1; min-width: 0; display: grid; gap: .2rem; }
    .q { font-weight: 600; overflow-wrap: anywhere; }
    .a { color: var(--p-surface-300); font-size: .85rem; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
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
      <h1 class="page-title">FAQs</h1>
      <button pButton type="button" icon="pi pi-plus" label="Add question" (click)="openNew()"></button>
    </div>

    @if (error(); as err) {
      <div class="card empty error">
        <i class="pi pi-exclamation-triangle" style="font-size:1.6rem"></i>
        <div>{{ err }}</div>
        <button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button>
      </div>
    } @else if (loading()) {
      <div class="list">@for (i of [1, 2, 3, 4]; track i) { <p-skeleton height="64px" borderRadius="12px" /> }</div>
    } @else if (items().length === 0) {
      <div class="card empty"><p>No FAQs yet.</p><button pButton type="button" icon="pi pi-plus" label="Add the first question" (click)="openNew()"></button></div>
    } @else {
      <div class="list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (f of items(); track f.id) {
          <div class="item" [class.is-draft]="!f.isPublished" cdkDrag>
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><i class="pi pi-bars"></i></span>
            <div class="body"><span class="q">{{ f.q }}</span><span class="a">{{ f.a }}</span></div>
            <div class="actions">
              <p-toggleswitch [ngModel]="f.isPublished" (onChange)="togglePublish(f, $event.checked)" [ariaLabel]="'Published: ' + f.q" />
              <button pButton type="button" class="p-button-text" severity="secondary" icon="pi pi-pencil" [attr.aria-label]="'Edit ' + f.q" (click)="openEdit(f)"></button>
              <button pButton type="button" class="p-button-text" severity="danger" icon="pi pi-trash" [attr.aria-label]="'Delete ' + f.q" (click)="confirmDelete(f)"></button>
            </div>
          </div>
        }
      </div>
    }

    <p-dialog [header]="editing() ? 'Edit question' : 'New question'" [visible]="dialogOpen()" (visibleChange)="dialogOpen.set($event)" [modal]="true"
      [style]="{ width: 'min(36rem, 94vw)' }" [draggable]="false" [closable]="!saving()" appendTo="body">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="field"><label for="faq-q">Question</label>
          <input pInputText id="faq-q" formControlName="q" maxlength="200" />
          <small class="hint counter" [class.over]="qLen() > 200">{{ qLen() }}/200</small>
          @if (err('q'); as m) { <small class="field-error">{{ m }}</small> }</div>
        <div class="field"><label for="faq-a">Answer</label>
          <textarea pTextarea id="faq-a" formControlName="a" rows="6" maxlength="2000" [autoResize]="true"></textarea>
          <small class="hint counter" [class.over]="aLen() > 2000">{{ aLen() }}/2000</small>
          @if (err('a'); as m) { <small class="field-error">{{ m }}</small> }</div>
        <div class="inline"><p-toggleswitch formControlName="isPublished" inputId="faq-pub" ariaLabel="Published" /><label for="faq-pub">Published</label></div>
        @if (formError(); as fe) { <small class="field-error">{{ fe }}</small> }
        <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem">
          <button pButton type="button" severity="secondary" label="Cancel" [disabled]="saving()" (click)="dialogOpen.set(false)"></button>
          <button pButton type="submit" icon="pi pi-save" label="Save" [loading]="saving()"></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class FaqsPage implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly items = signal<AdminFaq[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<AdminFaq | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverProblem = signal<Problem | null>(null);

  protected readonly form = this.fb.group({
    q: ['', [Validators.required, Validators.maxLength(200)]],
    a: ['', [Validators.required, Validators.maxLength(2000)]],
    isPublished: [true],
  });
  private readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly qLen = computed(() => (this.v().q ?? '').length);
  protected readonly aLen = computed(() => (this.v().a ?? '').length);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.api.invoke(apiAdminFaqsGet));
    } catch (e) {
      const p = problemOf(e);
      this.error.set(p.detail ?? p.title ?? 'Could not load FAQs');
    } finally {
      this.loading.set(false);
    }
  }

  protected err(field: string): string | null {
    const c = this.form.get(field);
    return fieldError(this.serverProblem(), field) ?? (c?.touched && c.errors?.['required'] ? 'Required' : null);
  }

  protected openNew(): void { this.open(null); }
  protected openEdit(f: AdminFaq): void { this.open(f); }
  private open(f: AdminFaq | null): void {
    this.editing.set(f);
    this.serverProblem.set(null);
    this.formError.set(null);
    this.form.reset({ q: f?.q ?? '', a: f?.a ?? '', isPublished: f?.isPublished ?? true });
    this.dialogOpen.set(true);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.serverProblem.set(null);
    this.formError.set(null);
    if (this.form.invalid) return;
    const r = this.form.getRawValue();
    const body = { q: r.q.trim(), a: r.a.trim(), isPublished: r.isPublished };
    const cur = this.editing();
    this.saving.set(true);
    try {
      if (cur?.id) {
        const saved = await this.api.invoke(apiAdminFaqsIdPut, { id: cur.id, body });
        this.items.update((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      } else {
        const created = await this.api.invoke(apiAdminFaqsPost, { body });
        this.items.update((l) => [...l, created]);
      }
      this.dialogOpen.set(false);
      this.toast.add({ severity: 'success', summary: cur ? 'FAQ saved' : 'FAQ added', life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      this.serverProblem.set(p);
      this.formError.set(p.errors ? (p.title ?? 'Please fix the highlighted fields.') : (p.detail ?? p.title ?? 'Could not save'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async togglePublish(f: AdminFaq, on: boolean): Promise<void> {
    this.items.update((l) => l.map((x) => (x.id === f.id ? { ...x, isPublished: on } : x)));
    try {
      const saved = await this.api.invoke(apiAdminFaqsIdPut, { id: f.id!, body: { q: f.q!, a: f.a!, isPublished: on } });
      this.items.update((l) => l.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      this.items.update((l) => l.map((x) => (x.id === f.id ? f : x)));
      this.fail('Could not update', e);
    }
  }

  protected confirmDelete(f: AdminFaq): void {
    this.confirm.confirm({
      header: 'Delete this question?', message: f.q ?? '', icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger', accept: () => void this.remove(f),
    });
  }

  private async remove(f: AdminFaq): Promise<void> {
    const before = this.items();
    this.items.set(before.filter((x) => x.id !== f.id));
    try {
      await this.api.invoke(apiAdminFaqsIdDelete, { id: f.id! });
      this.toast.add({ severity: 'success', summary: 'FAQ deleted', life: 2500 });
    } catch (e) {
      this.items.set(before);
      this.fail('Could not delete', e);
    }
  }

  protected async drop(e: CdkDragDrop<AdminFaq[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const before = this.items();
    const next = moveItem(before, e.previousIndex, e.currentIndex);
    this.items.set(next);
    try {
      await this.api.invoke(apiAdminFaqsReorderPost, { body: { ids: next.map((x) => x.id!) } });
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
