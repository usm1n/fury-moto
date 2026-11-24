import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { AssetUrlPipe } from '../../shared/asset-url.pipe';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminGuidesIdGet } from '../../api/fn/admin-content/api-admin-guides-id-get';
import { apiAdminGuidesPost } from '../../api/fn/admin-content/api-admin-guides-post';
import { apiAdminGuidesIdPut } from '../../api/fn/admin-content/api-admin-guides-id-put';
import { apiAdminGuidesIdDelete } from '../../api/fn/admin-content/api-admin-guides-id-delete';
import { apiAdminProductsIdGet } from '../../api/fn/admin-products/api-admin-products-id-get';
import { apiAdminUploadsPresignPost } from '../../api/fn/admin-images/api-admin-uploads-presign-post';
import { AdminGuide } from '../../api/models/admin-guide';
import { GuideUpsert } from '../../api/models/guide-upsert';
import { HasUnsavedChanges } from '../../core/guards';
import { Problem, fieldError, problemOf } from '../../core/http';
import { renderMarkdown } from '../../shared/markdown';
import { MAIN_MAX_BYTES, encodeUnderLimit, putWithProgress } from '../../shared/image-tools';
import { COVER_MAX_PX, GUIDE_TYPES, MdTool, applyMdTool, autoSlug } from './content-helpers';
import { GuideRelated, RelatedItem } from './guide-related';

@Component({
  selector: 'gd-guide-editor.page',
  imports: [AssetUrlPipe, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, TextareaModule, SelectModule, ToggleSwitchModule, SkeletonModule, TagModule, GuideRelated],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 860px; }
    .head { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
    .head .page-title { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .main { display: grid; gap: 1rem; }
    section.card h2 { margin: 0 0 .9rem; font-size: 1.05rem; }
    .row2 { display: grid; gap: .75rem; } @media (min-width: 640px) { .row2 { grid-template-columns: 1fr 1fr; } }
    input[pInputText], textarea, p-select { width: 100%; }
    input[pInputText], textarea { min-height: 44px; }
    .hint { color: var(--p-surface-400); font-size: .75rem; }
    .counter { text-align: right; }
    .counter.over { color: var(--p-red-400); }
    .inline { display: flex; align-items: center; gap: .6rem; min-height: 44px; }
    .banner { padding: .8rem 1rem; border-radius: 10px; border: 1px solid var(--p-yellow-500); display: flex; gap: .75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 1rem; }
    .tabs { display: flex; gap: .4rem; margin-bottom: .6rem; flex-wrap: wrap; }
    .tab { min-height: 44px; padding: 0 .9rem; border-radius: 999px; border: 1px solid var(--p-surface-700); background: var(--p-surface-900); color: var(--p-surface-100); font: inherit; cursor: pointer; }
    .tab.active { background: var(--p-primary-500); border-color: var(--p-primary-500); color: var(--p-primary-contrast-color, #000); font-weight: 600; }
    .tools { display: flex; gap: .4rem; margin-left: auto; }
    .tools button { min-width: 44px; min-height: 44px; border-radius: 8px; border: 1px solid var(--p-surface-700); background: var(--p-surface-900); color: var(--p-surface-0); font: inherit; font-weight: 700; cursor: pointer; }
    textarea.md-src { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9rem; line-height: 1.5; min-height: 22rem; resize: vertical; }
    .preview { min-height: 22rem; padding: .8rem 1rem; background: var(--p-surface-950); border: 1px solid var(--p-surface-700); border-radius: 10px; overflow-wrap: anywhere; line-height: 1.65; }
    :host ::ng-deep .preview :is(h2, h3) { margin: 1.2rem 0 .5rem; font-family: 'Anton', Impact, sans-serif; font-weight: 400; letter-spacing: .02em; }
    :host ::ng-deep .preview :is(p, ul, ol) { margin: 0 0 .9rem; }
    :host ::ng-deep .preview :is(ul, ol) { padding-left: 1.4rem; }
    .cover { display: grid; gap: .6rem; justify-items: start; }
    .cover img { width: 100%; max-width: 420px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; background: var(--p-surface-800); }
    .cover .row { display: flex; gap: .5rem; flex-wrap: wrap; }
    .bar { position: sticky; z-index: 15; bottom: calc(56px + env(safe-area-inset-bottom)); display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
      margin-top: 1rem; padding: .6rem; background: color-mix(in srgb, var(--p-surface-900) 96%, transparent); border: 1px solid var(--p-surface-600); border-radius: 12px; backdrop-filter: blur(8px); }
    @media (min-width: 900px) { .bar { bottom: .5rem; } }
    .bar .sp { flex: 1; }
    .unsaved { color: var(--p-yellow-400); font-size: .8rem; }
    .bar-up { height: 6px; background: var(--p-surface-700); border-radius: 3px; overflow: hidden; width: 100%; max-width: 420px; }
    .bar-up i { display: block; height: 100%; background: var(--p-primary-400); transition: width .15s; }
  `,
  template: `
    <div class="head">
      <a routerLink="/guides" pButton class="p-button-text" severity="secondary" aria-label="Back to guides"><span pButtonIcon class="pi pi-arrow-left"></span></a>
      <h1 class="page-title">{{ isNew() ? 'New guide' : (form.controls.title.value || 'Edit guide') }}</h1>
      @if (guide(); as g) { <p-tag [value]="g.isPublished ? 'Published' : 'Draft'" [severity]="g.isPublished ? 'success' : 'secondary'" /> }
    </div>

    @if (loadError(); as err) {
      <div class="card empty"><p>{{ err }}</p><button pButton type="button" (click)="reload()"><span pButtonIcon class="pi pi-refresh"></span><span pButtonLabel>Try again</span></button></div>
    } @else if (loading()) {
      <p-skeleton height="14rem" borderRadius="12px" /><div style="height:1rem"></div><p-skeleton height="18rem" borderRadius="12px" />
    } @else {
      @if (stale()) {
        <div class="banner"><span>This guide was changed elsewhere. Reload to get the latest version (your unsaved edits here will be lost).</span>
          <button pButton type="button" size="small" (click)="reload()"><span pButtonIcon class="pi pi-refresh"></span><span pButtonLabel>Reload</span></button></div>
      }
      @if (formError(); as fe) { <div class="banner" style="border-color:var(--p-red-400)">{{ fe }}</div> }

      <form class="main" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <section class="card">
          <h2>Details</h2>
          <div class="field"><label for="title">Title</label>
            <input pInputText id="title" formControlName="title" maxlength="160" (input)="onTitle()" />
            @if (err('title'); as m) { <small class="field-error">{{ m }}</small> }</div>
          <div class="row2">
            <div class="field"><label for="slug">URL slug</label>
              <input pInputText id="slug" formControlName="slug" maxlength="160" (input)="slugTouched = true" />
              <small class="hint">{{ slugPreview() }}</small>
              @if (err('slug'); as m) { <small class="field-error">{{ m }}</small> }</div>
            <div class="field"><label for="type">Type</label>
              <p-select inputId="type" formControlName="type" [options]="types" optionLabel="label" optionValue="value" appendTo="body" />
              @if (err('type'); as m) { <small class="field-error">{{ m }}</small> }</div>
          </div>
          <div class="field"><label for="excerpt">Excerpt</label>
            <textarea pTextarea id="excerpt" formControlName="excerpt" rows="3" maxlength="300" [autoResize]="true"></textarea>
            <small class="hint counter" [class.over]="excerptLen() > 300">{{ excerptLen() }}/300</small>
            @if (err('excerpt'); as m) { <small class="field-error">{{ m }}</small> }</div>
        </section>

        <section class="card">
          <h2>Body</h2>
          <div class="tabs">
            <button type="button" class="tab" [class.active]="tab() === 'write'" (click)="tab.set('write')">Write</button>
            <button type="button" class="tab" [class.active]="tab() === 'preview'" (click)="tab.set('preview')">Preview</button>
            @if (tab() === 'write') {
              <span class="tools" role="toolbar" aria-label="Formatting">
                <button type="button" aria-label="Heading" title="Heading" (click)="tool('h2')">H2</button>
                <button type="button" aria-label="Bold" title="Bold" (click)="tool('bold')">B</button>
                <button type="button" aria-label="Bulleted list" title="List" (click)="tool('list')"><i class="pi pi-list"></i></button>
                <button type="button" aria-label="Link" title="Link" (click)="tool('link')"><i class="pi pi-link"></i></button>
              </span>
            }
          </div>
          @if (tab() === 'write') {
            <textarea #bodyEl pTextarea class="md-src" formControlName="body" aria-label="Guide body (Markdown)" maxlength="40000"></textarea>
            <small class="hint">Markdown: ## heading, **bold**, *italic*, - list, [text](https://link). Blank line = new paragraph.</small>
          } @else {
            <div class="preview" [innerHTML]="preview()"></div>
          }
          @if (err('body'); as m) { <small class="field-error">{{ m }}</small> }
        </section>

        <section class="card">
          <h2>Cover image</h2>
          <div class="cover">
            @if (coverPreview(); as src) { <img [src]="src | assetUrl" alt="Cover preview" /> } @else { <p class="muted">No cover image.</p> }
            @if (uploading(); as pct) { <div class="bar-up" role="progressbar" [attr.aria-valuenow]="pct"><i [style.width.%]="pct"></i></div> }
            @if (coverError(); as ce) { <small class="field-error">{{ ce }}</small> }
            <div class="row">
              <button pButton type="button" severity="secondary" [disabled]="!!uploading()" (click)="fileInput.click()"><span pButtonIcon class="pi pi-image"></span><span pButtonLabel>{{ coverPreview() ? 'Replace image' : 'Choose image' }}</span></button>
              @if (coverPreview()) { <button pButton type="button" class="p-button-text" severity="danger" (click)="clearCover()"><span pButtonIcon class="pi pi-times"></span><span pButtonLabel>Remove</span></button> }
            </div>
            <input #fileInput type="file" accept="image/*" hidden (change)="onCover($event)" />
            <small class="hint">Resized to 1600 px WebP automatically.</small>
          </div>
        </section>

        <section class="card">
          <h2>Links</h2>
          <div class="field"><label for="video">Video id (optional)</label>
            <input pInputText id="video" formControlName="video" maxlength="80" />
            <small class="hint">The id of a video already set up on the storefront. Leave blank for none.</small></div>
          <div class="field"><label for="source">Instagram URL (optional)</label>
            <input pInputText id="source" formControlName="source" type="url" inputmode="url" maxlength="300" placeholder="https://www.instagram.com/reel/..." />
            @if (form.controls.source.errors?.['pattern']) { <small class="field-error">Must start with https://</small> }
            @else if (err('source'); as m) { <small class="field-error">{{ m }}</small> }</div>
        </section>

        <section class="card">
          <h2>Related products</h2>
          <gd-guide-related [items]="related()" (itemsChange)="onRelated($event)" />
          @if (err('relatedProductIds'); as m) { <small class="field-error">{{ m }}</small> }
        </section>

        <section class="card">
          <div class="inline"><p-toggleswitch formControlName="isPublished" inputId="pub" ariaLabel="Published" /><label for="pub">Published on the storefront</label></div>
        </section>
      </form>

      <div class="bar" role="toolbar" aria-label="Guide actions">
        <button pButton type="button" [loading]="busy() === 'save'" [disabled]="!!busy() || !!uploading()" (click)="save()"><span pButtonIcon class="pi pi-save"></span><span pButtonLabel>{{ isNew() ? 'Create guide' : 'Save' }}</span></button>
        <span class="sp"></span>
        @if (hasUnsavedChanges()) { <span class="unsaved">Unsaved changes</span> }
        @if (!isNew()) { <button pButton type="button" severity="danger" class="p-button-text" [disabled]="!!busy()" (click)="confirmDelete()"><span pButtonIcon class="pi pi-trash"></span><span pButtonLabel>Delete</span></button> }
      </div>
    }
  `,
})
export class GuideEditorPage implements HasUnsavedChanges {
  private readonly api = inject(Api);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** route param (absent on /guides/new) */
  readonly id = input<string>();
  private readonly bodyEl = viewChild<ElementRef<HTMLTextAreaElement>>('bodyEl');

  protected readonly types = GUIDE_TYPES;
  protected readonly guide = signal<AdminGuide | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal<'save' | 'delete' | null>(null);
  protected readonly stale = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly serverProblem = signal<Problem | null>(null);
  protected readonly tab = signal<'write' | 'preview'>('write');
  protected readonly related = signal<RelatedItem[]>([]);
  protected readonly extraDirty = signal(false);
  /** null = leave cover unchanged, '' = clear, other = new storage key (matches GuideUpsert.coverKey) */
  protected readonly coverKey = signal<string | null>(null);
  protected readonly coverPreview = signal<string | null>(null);
  protected readonly coverError = signal<string | null>(null);
  protected readonly uploading = signal<number | null>(null);
  protected slugTouched = false;

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    slug: [''],
    type: this.fb.control<AdminGuide['type'] | null>(null, Validators.required),
    excerpt: ['', [Validators.required, Validators.maxLength(300)]],
    body: ['', [Validators.required, Validators.maxLength(40000)]],
    video: [''],
    source: ['', Validators.pattern(/^$|^https?:\/\/\S+$/i)],
    isPublished: [false],
  });

  private readonly v = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly isNew = computed(() => !this.guide()?.id);
  protected readonly excerptLen = computed(() => (this.v().excerpt ?? '').length);
  protected readonly preview = computed(() => (this.tab() === 'preview' ? renderMarkdown(this.v().body ?? '') : ''));
  protected readonly slugPreview = computed(() => `${location.origin}/guide.html?id=${this.v().slug || autoSlug(this.v().title ?? '') || '...'}`);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  hasUnsavedChanges(): boolean { return this.form.dirty || this.extraDirty(); }

  protected err(field: string): string | null {
    const c = this.form.get(field);
    const server = fieldError(this.serverProblem(), field);
    if (server) return server;
    if (c && c.touched && c.errors?.['required']) return 'Required';
    return null;
  }

  protected onTitle(): void {
    if (!this.slugTouched) this.form.controls.slug.setValue(autoSlug(this.form.controls.title.value));
  }

  protected onRelated(items: RelatedItem[]): void { this.related.set(items); this.extraDirty.set(true); }

  protected reload(): void { void this.load(this.id()); }

  async load(idParam: string | undefined = this.id()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.stale.set(false);
    this.formError.set(null);
    this.serverProblem.set(null);
    try {
      const id = idParam ? Number(idParam) : null;
      const g = id ? await this.api.invoke(apiAdminGuidesIdGet, { id }) : null;
      this.guide.set(g);
      this.fill(g);
      this.related.set(await this.resolveRelated(g?.relatedProductIds ?? []));
    } catch (e) {
      const p = problemOf(e);
      this.loadError.set(p.status === 404 ? 'This guide no longer exists.' : (p.detail ?? p.title ?? 'Could not load the guide'));
    } finally {
      this.loading.set(false);
    }
  }

  /** The guide only stores product ids; fetch titles/thumbs for the chips (best effort). */
  private async resolveRelated(ids: number[]): Promise<RelatedItem[]> {
    return Promise.all(ids.map(async (id) => {
      try {
        const p = await this.api.invoke(apiAdminProductsIdGet, { id });
        return { id, title: p.title ?? `Product #${id}`, thumbUrl: p.images?.[0]?.thumbUrl ?? null };
      } catch {
        return { id, title: `Product #${id}`, thumbUrl: null };
      }
    }));
  }

  private fill(g: AdminGuide | null): void {
    this.form.reset({
      title: g?.title ?? '', slug: g?.slug ?? '', type: g?.type ?? null, excerpt: g?.excerpt ?? '', body: g?.body ?? '',
      video: g?.video ?? '', source: g?.source ?? '', isPublished: g?.isPublished ?? false,
    });
    this.slugTouched = !!g;       // never rewrite the URL of an existing guide
    this.coverKey.set(null);
    this.coverPreview.set(g?.coverUrl ?? null);
    this.coverError.set(null);
    this.extraDirty.set(false);
    this.tab.set('write');
  }

  private body(): GuideUpsert {
    const r = this.form.getRawValue();
    const existing = this.guide();
    // clearing a previously set optional field sends '' (null reads as "no change" on some servers)
    const opt = (now: string, before: string | null | undefined) => now.trim() || (before ? '' : null);
    return {
      title: r.title.trim(), slug: r.slug.trim() || null, type: r.type!, excerpt: r.excerpt.trim(), body: r.body,
      coverKey: this.coverKey(), video: opt(r.video, existing?.video), source: opt(r.source, existing?.source),
      relatedProductIds: this.related().map((x) => x.id), isPublished: r.isPublished, version: existing?.version ?? null,
    };
  }

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
      const existing = this.guide();
      if (!existing?.id) {
        const created = await this.api.invoke(apiAdminGuidesPost, { body: this.body() });
        this.form.markAsPristine();
        this.extraDirty.set(false);
        this.toast.add({ severity: 'success', summary: 'Guide created', detail: created.title, life: 2500 });
        await this.router.navigate(['/guides', created.id], { replaceUrl: true });
      } else {
        const saved = await this.api.invoke(apiAdminGuidesIdPut, { id: existing.id, body: this.body() });
        this.guide.set(saved);
        this.fill(saved);
        this.toast.add({ severity: 'success', summary: 'Saved', life: 2000 });
      }
      return true;
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 409 && (p.type ?? '').includes('stale')) {
        this.stale.set(true);
        this.toast.add({ severity: 'warn', summary: 'Changed elsewhere', detail: 'Someone saved this guide since you opened it. Reload to get the latest version.', life: 6000 });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return false;
      }
      this.serverProblem.set(p);
      if (p.errors && Object.keys(p.errors).length) {
        this.form.markAllAsTouched();
        this.formError.set(p.title ?? 'Please fix the highlighted fields.');
      } else {
        this.formError.set(p.detail ?? p.title ?? 'Could not save');
      }
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: p.detail ?? p.title, life: 6000 });
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  protected tool(kind: MdTool): void {
    const el = this.bodyEl()?.nativeElement;
    if (!el) return;
    const edit = applyMdTool(el.value, el.selectionStart, el.selectionEnd, kind);
    this.form.controls.body.setValue(edit.text);
    this.form.controls.body.markAsDirty();
    el.focus();
    el.setSelectionRange(edit.start, edit.end);
  }

  protected async onCover(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.coverError.set(null);
    this.uploading.set(1);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Not an image file');
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch { throw new Error('Could not read this image (unsupported format?)'); }
      let enc;
      try { enc = await encodeUnderLimit(bitmap, COVER_MAX_PX, MAIN_MAX_BYTES, 'Cover image'); } finally { bitmap.close(); }
      this.uploading.set(3);
      // 'guide' is not in the generated union yet (contract gap) - cast until the client is regenerated
      const presign = await this.api.invoke(apiAdminUploadsPresignPost, {
        body: { productId: 0, kind: 'guide', contentType: 'image/webp', bytes: enc.blob.size },
      });
      await putWithProgress(presign.uploadUrl!, enc.blob, presign.headers, (n) => this.uploading.set(Math.max(3, Math.min(98, Math.round((n / enc.blob.size) * 98)))));
      this.coverKey.set(presign.key!);
      this.coverPreview.set(URL.createObjectURL(enc.blob));
      this.extraDirty.set(true);
    } catch (e) {
      const p = problemOf(e);
      this.coverError.set(p.status === 503 ? 'Photo storage is not configured on this server.' : (e instanceof Error && !p.status && p.status !== 0 ? e.message : (p.detail ?? p.title ?? 'Upload failed')));
    } finally {
      this.uploading.set(null);
    }
  }

  protected clearCover(): void {
    this.coverKey.set('');
    this.coverPreview.set(null);
    this.extraDirty.set(true);
  }

  protected confirmDelete(): void {
    const g = this.guide();
    if (!g?.id) return;
    this.confirm.confirm({
      header: `Delete "${g.title}"?`, message: 'This permanently removes the guide from the storefront.',
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Cancel', acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.remove(g.id!),
    });
  }

  private async remove(id: number): Promise<void> {
    this.busy.set('delete');
    try {
      await this.api.invoke(apiAdminGuidesIdDelete, { id });
      this.form.markAsPristine();
      this.extraDirty.set(false);
      this.toast.add({ severity: 'success', summary: 'Guide deleted', life: 2500 });
      await this.router.navigate(['/guides']);
    } catch (e) {
      const p = problemOf(e);
      this.toast.add({ severity: 'error', summary: 'Could not delete', detail: p.detail ?? p.title, life: 6000 });
    } finally {
      this.busy.set(null);
    }
  }
}
