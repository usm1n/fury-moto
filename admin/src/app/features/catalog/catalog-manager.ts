import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Skeleton } from '../../shared/ui/ui';
import { Toast } from '../../shared/ui/toast.service';
import { Confirm } from '../../shared/ui/confirm.service';
import { problemOf } from '../../core/http';
import { AssetUrlPipe } from '../../shared/asset-url.pipe';

export interface CatalogItem { id: number; name: string; slug: string; isActive: boolean; productCount?: number; imageUrl?: string | null }
export interface CatalogValues { name: string; slug?: string; isActive: boolean }

/** What a page supplies so one list UI serves both categories and brands. */
export interface CatalogAdapter {
  list(): Promise<CatalogItem[]>;
  create(v: CatalogValues): Promise<CatalogItem>;
  update(id: number, v: CatalogValues): Promise<CatalogItem>;
  remove(id: number): Promise<void>;
  reorder(ids: number[]): Promise<void>;
  /** Optional: upload a photo for the item (categories use it for their storefront tile). */
  uploadImage?(item: CatalogItem, file: File): Promise<CatalogItem>;
}

/** Drag-to-reorder list with inline add / rename, active toggle and delete (409 "in use" -> deactivate hint). */
@Component({
  selector: 'gd-catalog-manager',
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle, MatButtonModule, MatIconModule, MatSlideToggleModule, MatProgressSpinnerModule, Skeleton, AssetUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 720px; }
    .add { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .add input { flex: 1; min-width: 0; min-height: 44px; }
    .list { display: grid; gap: .5rem; }
    .item { display: flex; align-items: center; gap: .6rem; padding: .5rem .6rem; min-height: 56px;
      background: var(--p-surface-900); border: 1px solid var(--p-surface-700); border-radius: 12px; }
    .item.is-inactive .name { opacity: .55; }
    .handle { cursor: grab; color: var(--p-surface-400); padding: .6rem .5rem; touch-action: none; min-width: 44px; min-height: 44px; display: grid; place-items: center; }
    .body { flex: 1; min-width: 0; }
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .slug { color: var(--p-surface-400); font-size: .78rem; }
    .count { color: var(--p-surface-300); font-size: .78rem; margin-left: .4rem; }
    .edit { display: flex; gap: .4rem; }
    .edit input { flex: 1; min-width: 0; min-height: 44px; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,.5); border-radius: 12px; background: var(--p-surface-800); }
    .cdk-drag-placeholder { opacity: .3; }
    .cdk-drag-animating { transition: transform 200ms ease; }
    .list.is-dragging .item:not(.cdk-drag-placeholder) { transition: transform 200ms ease; }
    .actions { display: flex; align-items: center; gap: .15rem; }
    .error { display: grid; gap: .75rem; justify-items: center; }
    .thumb { flex: none; width: 56px; height: 56px; border-radius: 10px; overflow: hidden; display: grid; place-items: center; cursor: pointer;
      background: var(--p-surface-800); border: 1px dashed var(--p-surface-500); color: var(--p-surface-300); }
    .thumb:hover, .thumb:focus-within { border-color: var(--p-primary-500); color: var(--p-surface-0); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .thumb.is-busy { cursor: progress; }
  `,
  template: `
    <form class="add" (submit)="$event.preventDefault(); add()">
      <input class="gd-input" name="newName" [(ngModel)]="newName" [placeholder]="'New ' + noun() + ' name'" [attr.aria-label]="'New ' + noun() + ' name'" maxlength="80" autocomplete="off" />
      <button mat-flat-button type="submit" [disabled]="adding() || !newName.trim()">@if (adding()) { <mat-progress-spinner mode="indeterminate" diameter="18" /> } @else { <mat-icon>add</mat-icon> }Add</button>
    </form>

    @if (error(); as err) {
      <div class="card empty error">
        <div>{{ err }}</div>
        <button mat-flat-button type="button" (click)="load()"><mat-icon>refresh</mat-icon>Try again</button>
      </div>
    } @else if (loading()) {
      <div class="list">@for (i of [1, 2, 3, 4]; track i) { <gd-skeleton height="56px" radius="12px" /> }</div>
    } @else if (items().length === 0) {
      <div class="card empty">No {{ noun() }}s yet. Add one above.</div>
    } @else {
      <div class="list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (it of items(); track it.id) {
          <div class="item" [class.is-inactive]="!it.isActive" cdkDrag [cdkDragData]="it">
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><mat-icon>drag_indicator</mat-icon></span>
            @if (adapter().uploadImage) {
              <label class="thumb" [class.is-busy]="uploadingId() === it.id" [attr.aria-label]="(it.imageUrl ? 'Change photo for ' : 'Add photo for ') + it.name">
                @if (uploadingId() === it.id) { <mat-progress-spinner mode="indeterminate" diameter="22" /> }
                @else if (it.imageUrl) { <img [src]="it.imageUrl | assetUrl" alt="" /> }
                @else { <mat-icon>add_photo_alternate</mat-icon> }
                <input type="file" accept="image/*" hidden (change)="pickImage(it, $event)" />
              </label>
            }
            <div class="body">
              @if (editingId() === it.id) {
                <form class="edit" (submit)="$event.preventDefault(); saveName(it)">
                  <input class="gd-input" name="rename" [(ngModel)]="editName" maxlength="80" aria-label="Name" autofocus (keydown.escape)="editingId.set(null)" />
                  <button mat-icon-button type="submit" class="gd-success" aria-label="Save name"><mat-icon>check</mat-icon></button>
                  <button mat-icon-button type="button" aria-label="Cancel" (click)="editingId.set(null)"><mat-icon>close</mat-icon></button>
                </form>
              } @else {
                <div class="name">{{ it.name }}@if (it.productCount !== undefined) { <span class="count">{{ it.productCount }} product{{ it.productCount === 1 ? '' : 's' }}</span> }</div>
                <div class="slug">/{{ it.slug }}</div>
              }
            </div>
            <div class="actions">
              @if (editingId() !== it.id) {
                <button mat-icon-button type="button" [attr.aria-label]="'Rename ' + it.name" (click)="startEdit(it)"><mat-icon>edit</mat-icon></button>
              }
              <mat-slide-toggle [checked]="it.isActive" (change)="toggleActive(it, $event.checked)" [aria-label]="'Active: ' + it.name" />
              <button mat-icon-button type="button" class="gd-danger" [attr.aria-label]="'Delete ' + it.name" (click)="confirmDelete(it)"><mat-icon>delete</mat-icon></button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class CatalogManager implements OnInit {
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);

  readonly adapter = input.required<CatalogAdapter>();
  readonly noun = input('item');

  protected readonly items = signal<CatalogItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly uploadingId = signal<number | null>(null);
  protected newName = '';
  protected editName = '';

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.adapter().list());
    } catch (e) {
      this.error.set(problemOf(e).detail ?? problemOf(e).title ?? 'Could not load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async pickImage(it: CatalogItem, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const upload = this.adapter().uploadImage;
    if (!file || !upload || this.uploadingId() !== null) return;
    this.uploadingId.set(it.id);
    try {
      const updated = await upload.call(this.adapter(), it, file);
      this.items.update((l) => l.map((x) => (x.id === it.id ? { ...x, ...updated } : x)));
      this.toast.add({ severity: 'success', summary: 'Photo updated', detail: it.name, life: 2500 });
    } catch (e) {
      const p = problemOf(e);
      this.toast.add({ severity: 'error', summary: 'Could not upload the photo',
        detail: p.status === 503 ? 'Photo storage is not configured on this server.' : (e instanceof Error && !p.status ? e.message : (p.detail ?? p.title ?? '')) });
    } finally {
      this.uploadingId.set(null);
    }
  }

  protected async add(): Promise<void> {
    const name = this.newName.trim();
    if (!name || this.adding()) return;
    this.adding.set(true);
    try {
      const created = await this.adapter().create({ name, isActive: true });
      this.items.update((l) => [...l, created]);
      this.newName = '';
      this.toast.add({ severity: 'success', summary: `${this.cap()} added`, detail: created.name, life: 2500 });
    } catch (e) {
      this.fail(`Could not add ${this.noun()}`, e);
    } finally {
      this.adding.set(false);
    }
  }

  protected startEdit(it: CatalogItem): void { this.editName = it.name; this.editingId.set(it.id); }

  protected async saveName(it: CatalogItem): Promise<void> {
    const name = this.editName.trim();
    if (!name || name === it.name) { this.editingId.set(null); return; }
    try {
      // slug is sent back unchanged so renaming never breaks storefront URLs
      const saved = await this.adapter().update(it.id, { name, slug: it.slug, isActive: it.isActive });
      this.replace(it.id, saved);
      this.editingId.set(null);
      this.toast.add({ severity: 'success', summary: 'Renamed', detail: saved.name, life: 2500 });
    } catch (e) {
      this.fail('Could not rename', e);
    }
  }

  protected async toggleActive(it: CatalogItem, active: boolean): Promise<void> {
    this.replace(it.id, { ...it, isActive: active });
    try {
      const saved = await this.adapter().update(it.id, { name: it.name, slug: it.slug, isActive: active });
      this.replace(it.id, saved);
    } catch (e) {
      this.replace(it.id, it);
      this.fail('Could not update', e);
    }
  }

  protected confirmDelete(it: CatalogItem): void {
    this.confirm.confirm({
      header: `Delete ${it.name}?`,
      message: `This permanently deletes the ${this.noun()}. If products still use it, deactivate it instead.`,
      acceptLabel: 'Delete', rejectLabel: 'Cancel', danger: true,
      accept: () => void this.remove(it),
    });
  }

  private async remove(it: CatalogItem): Promise<void> {
    const before = this.items();
    this.items.set(before.filter((x) => x.id !== it.id));
    try {
      await this.adapter().remove(it.id);
      this.toast.add({ severity: 'success', summary: 'Deleted', detail: it.name, life: 2500 });
    } catch (e) {
      this.items.set(before);
      const p = problemOf(e);
      if (p.status === 409) {
        this.toast.add({ severity: 'warn', summary: `${it.name} is in use`, detail: `Products still use this ${this.noun()}. Switch it off with the Active toggle instead of deleting.`, life: 7000 });
      } else this.fail('Could not delete', e);
    }
  }

  protected async drop(e: CdkDragDrop<CatalogItem[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const before = this.items();
    const next = [...before];
    moveItemInArray(next, e.previousIndex, e.currentIndex);
    this.items.set(next);
    try {
      await this.adapter().reorder(next.map((x) => x.id));
    } catch (err) {
      this.items.set(before);
      this.fail('Could not save the new order', err);
    }
  }

  private replace(id: number, item: CatalogItem): void {
    this.items.update((l) => l.map((x) => (x.id === id ? { ...x, ...item } : x)));
  }
  private cap(): string { const n = this.noun(); return n.charAt(0).toUpperCase() + n.slice(1); }
  private fail(summary: string, e: unknown): void {
    const p = problemOf(e);
    this.toast.add({ severity: 'error', summary, detail: p.detail ?? p.title, life: 6000 });
  }
}
