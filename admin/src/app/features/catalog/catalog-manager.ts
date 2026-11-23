import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmationService, MessageService } from 'primeng/api';
import { problemOf } from '../../core/http';

export interface CatalogItem { id: number; name: string; slug: string; isActive: boolean; productCount?: number }
export interface CatalogValues { name: string; slug?: string; isActive: boolean }

/** What a page supplies so one list UI serves both categories and brands. */
export interface CatalogAdapter {
  list(): Promise<CatalogItem[]>;
  create(v: CatalogValues): Promise<CatalogItem>;
  update(id: number, v: CatalogValues): Promise<CatalogItem>;
  remove(id: number): Promise<void>;
  reorder(ids: number[]): Promise<void>;
}

/** Drag-to-reorder list with inline add / rename, active toggle and delete (409 "in use" -> deactivate hint). */
@Component({
  selector: 'gd-catalog-manager',
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle, ButtonModule, InputTextModule, ToggleSwitchModule, SkeletonModule],
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
  `,
  template: `
    <form class="add" (ngSubmit)="add()">
      <input pInputText name="newName" [(ngModel)]="newName" [placeholder]="'New ' + noun() + ' name'" [attr.aria-label]="'New ' + noun() + ' name'" maxlength="80" autocomplete="off" />
      <button pButton type="submit" icon="pi pi-plus" label="Add" [loading]="adding()" [disabled]="!newName.trim()"></button>
    </form>

    @if (error(); as err) {
      <div class="card empty error">
        <div>{{ err }}</div>
        <button pButton type="button" label="Try again" icon="pi pi-refresh" (click)="load()"></button>
      </div>
    } @else if (loading()) {
      <div class="list">@for (i of [1, 2, 3, 4]; track i) { <p-skeleton height="56px" borderRadius="12px" /> }</div>
    } @else if (items().length === 0) {
      <div class="card empty">No {{ noun() }}s yet. Add one above.</div>
    } @else {
      <div class="list" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (it of items(); track it.id) {
          <div class="item" [class.is-inactive]="!it.isActive" cdkDrag [cdkDragData]="it">
            <span class="handle" cdkDragHandle aria-label="Drag to reorder"><i class="pi pi-bars"></i></span>
            <div class="body">
              @if (editingId() === it.id) {
                <form class="edit" (ngSubmit)="saveName(it)">
                  <input pInputText name="rename" [(ngModel)]="editName" maxlength="80" aria-label="Name" autofocus (keydown.escape)="editingId.set(null)" />
                  <button pButton type="submit" icon="pi pi-check" severity="success" size="small" aria-label="Save name"></button>
                  <button pButton type="button" icon="pi pi-times" severity="secondary" size="small" aria-label="Cancel" (click)="editingId.set(null)"></button>
                </form>
              } @else {
                <div class="name">{{ it.name }}@if (it.productCount !== undefined) { <span class="count">{{ it.productCount }} product{{ it.productCount === 1 ? '' : 's' }}</span> }</div>
                <div class="slug">/{{ it.slug }}</div>
              }
            </div>
            <div class="actions">
              @if (editingId() !== it.id) {
                <button pButton type="button" class="p-button-text" severity="secondary" icon="pi pi-pencil" [attr.aria-label]="'Rename ' + it.name" (click)="startEdit(it)"></button>
              }
              <p-toggleswitch [ngModel]="it.isActive" (onChange)="toggleActive(it, $event.checked)" [ariaLabel]="'Active: ' + it.name" />
              <button pButton type="button" class="p-button-text" severity="danger" icon="pi pi-trash" [attr.aria-label]="'Delete ' + it.name" (click)="confirmDelete(it)"></button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class CatalogManager implements OnInit {
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly adapter = input.required<CatalogAdapter>();
  readonly noun = input('item');

  protected readonly items = signal<CatalogItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly editingId = signal<number | null>(null);
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
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Cancel', acceptButtonStyleClass: 'p-button-danger',
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
