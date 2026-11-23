import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api } from '../../api/api';
import { apiAdminUploadsPresignPost } from '../../api/fn/admin-images/api-admin-uploads-presign-post';
import { apiAdminProductsIdImagesPost } from '../../api/fn/admin-images/api-admin-products-id-images-post';
import { apiAdminProductsIdImagesReorderPost } from '../../api/fn/admin-images/api-admin-products-id-images-reorder-post';
import { apiAdminImagesImageIdPatch } from '../../api/fn/admin-images/api-admin-images-image-id-patch';
import { apiAdminImagesImageIdDelete } from '../../api/fn/admin-images/api-admin-images-image-id-delete';
import { Image } from '../../api/models/image';
import { problemOf } from '../../core/http';
import { prepareImage, putWithProgress } from '../../shared/image-tools';

interface UploadItem { key: number; name: string; stage: 'Preparing' | 'Uploading' | 'Saving' | 'Failed'; progress: number; error?: string }

/** Photo manager: pick/drop/camera -> resize + WebP in the browser -> presign -> PUT to R2 -> register. */
@Component({
  selector: 'gd-product-images',
  imports: [FormsModule, CdkDropList, CdkDrag, CdkDragHandle, ButtonModule, InputTextModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .drop { border: 2px dashed var(--p-surface-600); border-radius: 12px; padding: 1.25rem; text-align: center; display: grid; gap: .6rem; justify-items: center; color: var(--p-surface-300); }
    .drop.over { border-color: var(--p-primary-400); background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .75rem; margin-top: 1rem; }
    .img { position: relative; background: var(--p-surface-950); border: 1px solid var(--p-surface-700); border-radius: 10px; overflow: hidden; display: grid; }
    .img img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: var(--p-surface-800); }
    .tools { position: absolute; top: .3rem; left: .3rem; right: .3rem; display: flex; justify-content: space-between; }
    .tools button, .handle { width: 44px; height: 44px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; color: #fff; background: rgba(0,0,0,.6); }
    .handle { cursor: grab; touch-action: none; }
    .main { position: absolute; bottom: 4.2rem; left: .4rem; font-size: .65rem; font-weight: 700; text-transform: uppercase; background: var(--p-primary-500); color: #fff; padding: .15rem .45rem; border-radius: 999px; }
    .alt { padding: .4rem; } .alt input { width: 100%; min-height: 40px; font-size: .85rem; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,.5); border-radius: 10px; }
    .cdk-drag-placeholder { opacity: .25; }
    .cdk-drag-animating { transition: transform 200ms ease; }
    .up { display: grid; gap: .3rem; padding: .55rem .7rem; margin-top: .5rem; background: var(--p-surface-950); border: 1px solid var(--p-surface-700); border-radius: 8px; font-size: .85rem; }
    .bar { height: 6px; background: var(--p-surface-700); border-radius: 3px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--p-primary-400); transition: width .15s; }
    .err { color: var(--p-red-400); display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
  `,
  template: `
    @if (!productId()) {
      <p class="muted"><i class="pi pi-info-circle"></i> Save once to add photos.</p>
    } @else {
      @if (storageDown()) {
        <p-message severity="warn" styleClass="w-full">Photo storage is not configured on this server (local development has no R2 bucket). Uploads will work once storage credentials are set.</p-message>
      }
      <div class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
        <i class="pi pi-camera" style="font-size:1.6rem"></i>
        <span>Drag photos here, or</span>
        <button pButton type="button" icon="pi pi-camera" label="Take photo / Choose photos" (click)="fileInput.click()"></button>
        <input #fileInput type="file" accept="image/*" multiple capture="environment" hidden (change)="onPick($event)" />
        <small>Resized to 2000 px WebP automatically. First photo is the main one.</small>
      </div>

      @for (u of uploads(); track u.key) {
        <div class="up">
          @if (u.stage === 'Failed') {
            <div class="err"><span>{{ u.name }}: {{ u.error }}</span><button pButton type="button" class="p-button-text" size="small" label="Dismiss" (click)="dismiss(u.key)"></button></div>
          } @else {
            <div>{{ u.name }} · {{ u.stage }}...</div>
            <div class="bar"><i [style.width.%]="u.progress"></i></div>
          }
        </div>
      }

      @if (list().length) {
        <div class="grid" cdkDropList cdkDropListOrientation="mixed" (cdkDropListDropped)="drop($event)">
          @for (im of list(); track im.id; let i = $index) {
            <div class="img" cdkDrag>
              <img [src]="im.thumbUrl" [alt]="im.alt || 'Product photo'" loading="lazy" />
              <div class="tools">
                <span class="handle" cdkDragHandle aria-label="Drag to reorder"><i class="pi pi-arrows-alt"></i></span>
                <button type="button" (click)="confirmDelete(im)" aria-label="Delete photo"><i class="pi pi-trash"></i></button>
              </div>
              @if (i === 0) { <span class="main">Main</span> }
              <div class="alt"><input pInputText [ngModel]="im.alt" (blur)="saveAlt(im, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()" placeholder="Alt text" maxlength="200" aria-label="Alt text" /></div>
            </div>
          }
        </div>
      } @else if (uploads().length === 0) {
        <p class="muted" style="margin-top:.75rem">No photos yet.</p>
      }
    }
  `,
})
export class ProductImages {
  private readonly api = inject(Api);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly productId = input<number | null>(null);
  readonly images = input<readonly Image[]>([]);
  readonly defaultAlt = input('');
  readonly changed = output<Image[]>();

  protected readonly list = linkedSignal(() => [...this.images()]);
  protected readonly uploads = signal<UploadItem[]>([]);
  protected readonly over = signal(false);
  protected readonly storageDown = signal(false);
  private seq = 0;

  protected onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.enqueue(files);
  }
  protected onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.over.set(false);
    void this.enqueue(Array.from(ev.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/')));
  }

  private async enqueue(files: File[]): Promise<void> {
    for (const f of files) {
      if (this.storageDown()) break;
      await this.uploadOne(f);   // sequential keeps phones responsive and memory low
    }
  }

  private patchUpload(key: number, p: Partial<UploadItem>): void {
    this.uploads.update((l) => l.map((u) => (u.key === key ? { ...u, ...p } : u)));
  }
  protected dismiss(key: number): void { this.uploads.update((l) => l.filter((u) => u.key !== key)); }

  private async uploadOne(file: File): Promise<void> {
    const id = this.productId();
    if (!id) return;
    const key = ++this.seq;
    this.uploads.update((l) => [...l, { key, name: file.name, stage: 'Preparing', progress: 0 }]);
    try {
      const prepared = await prepareImage(file);
      this.patchUpload(key, { stage: 'Uploading', progress: 2 });
      const [mainP, thumbP] = await Promise.all([
        this.api.invoke(apiAdminUploadsPresignPost, { body: { productId: id, kind: 'main', contentType: 'image/webp', bytes: prepared.main.blob.size } }),
        this.api.invoke(apiAdminUploadsPresignPost, { body: { productId: id, kind: 'thumb', contentType: 'image/webp', bytes: prepared.thumb.blob.size } }),
      ]);
      const total = prepared.main.blob.size + prepared.thumb.blob.size;
      let a = 0, b = 0;
      const report = () => this.patchUpload(key, { progress: Math.min(95, Math.round(((a + b) / total) * 95)) });
      await Promise.all([
        putWithProgress(mainP.uploadUrl!, prepared.main.blob, mainP.headers, (n) => { a = n; report(); }),
        putWithProgress(thumbP.uploadUrl!, prepared.thumb.blob, thumbP.headers, (n) => { b = n; report(); }),
      ]);
      this.patchUpload(key, { stage: 'Saving', progress: 97 });
      const alt = this.defaultAlt().trim().slice(0, 200);
      const image = await this.api.invoke(apiAdminProductsIdImagesPost, {
        id, body: { key: mainP.key!, thumbKey: thumbP.key!, width: prepared.main.width, height: prepared.main.height, alt },
      });
      this.list.update((l) => [...l, image]);
      this.changed.emit(this.list());
      this.dismiss(key);
    } catch (e) {
      const p = problemOf(e);
      if (p.status === 503) {
        this.storageDown.set(true);
        this.dismiss(key);
        return;
      }
      const msg = e instanceof Error && !p.status && p.status !== 0 ? e.message : (p.detail ?? p.title ?? 'Upload failed');
      this.patchUpload(key, { stage: 'Failed', error: msg });
    }
  }

  protected async drop(e: CdkDragDrop<Image[]>): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const before = this.list();
    const next = [...before];
    moveItemInArray(next, e.previousIndex, e.currentIndex);
    this.list.set(next);
    try {
      await this.api.invoke(apiAdminProductsIdImagesReorderPost, { id: this.productId()!, body: { ids: next.map((i) => i.id!) } });
      this.changed.emit(next);
    } catch (err) {
      this.list.set(before);
      this.toast.add({ severity: 'error', summary: 'Could not save photo order', detail: problemOf(err).detail, life: 6000 });
    }
  }

  protected async saveAlt(im: Image, value: string): Promise<void> {
    const alt = value.trim();
    if (alt === (im.alt ?? '')) return;
    try {
      const saved = await this.api.invoke(apiAdminImagesImageIdPatch, { imageId: im.id!, body: { alt } });
      this.list.update((l) => l.map((x) => (x.id === im.id ? { ...x, alt: saved.alt ?? alt } : x)));
      this.changed.emit(this.list());
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save alt text', detail: problemOf(err).detail, life: 6000 });
    }
  }

  protected confirmDelete(im: Image): void {
    this.confirm.confirm({
      header: 'Delete this photo?', message: 'It will be removed from the product and from storage.', icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Cancel', acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.api.invoke(apiAdminImagesImageIdDelete, { imageId: im.id! });
          this.list.update((l) => l.filter((x) => x.id !== im.id));
          this.changed.emit(this.list());
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete photo', detail: problemOf(err).detail, life: 6000 });
        }
      },
    });
  }
}
