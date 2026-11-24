import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Api } from '../../api/api';
import { apiAdminCategoriesGet } from '../../api/fn/admin-catalog/api-admin-categories-get';
import { apiAdminCategoriesPost } from '../../api/fn/admin-catalog/api-admin-categories-post';
import { apiAdminCategoriesIdPut } from '../../api/fn/admin-catalog/api-admin-categories-id-put';
import { apiAdminCategoriesIdDelete } from '../../api/fn/admin-catalog/api-admin-categories-id-delete';
import { apiAdminCategoriesReorderPost } from '../../api/fn/admin-catalog/api-admin-categories-reorder-post';
import { Category } from '../../api/models/category';
import { CatalogAdapter, CatalogItem, CatalogManager } from './catalog-manager';
import { apiAdminUploadsPresignPost } from '../../api/fn/admin-images/api-admin-uploads-presign-post';
import { MAIN_MAX_BYTES, encodeUnderLimit, putWithProgress } from '../../shared/image-tools';

const toItem = (c: Category): CatalogItem => ({ id: c.id!, name: c.name ?? '', slug: c.slug ?? '', isActive: c.isActive ?? true, productCount: c.productCount, imageUrl: c.imageUrl });

/** Category tiles on the storefront are wide cards; 1600px is plenty. */
const TILE_MAX_PX = 1600;

@Component({
  selector: 'gd-categories.page',
  imports: [CatalogManager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head"><h1 class="page-title">Categories</h1></div>
    <p class="muted">Drag to set the order shown on the storefront. Tap the square to add a photo for the category tile.</p>
    <gd-catalog-manager [adapter]="adapter" noun="category" />
  `,
})
export class CategoriesPage {
  private readonly api = inject(Api);
  protected readonly adapter: CatalogAdapter = {
    list: async () => (await this.api.invoke(apiAdminCategoriesGet)).map(toItem),
    create: async (v) => toItem(await this.api.invoke(apiAdminCategoriesPost, { body: v })),
    update: async (id, v) => toItem(await this.api.invoke(apiAdminCategoriesIdPut, { id, body: v })),
    remove: async (id) => { await this.api.invoke(apiAdminCategoriesIdDelete, { id }); },
    reorder: async (ids) => { await this.api.invoke(apiAdminCategoriesReorderPost, { body: { ids } }); },
    // resize to WebP in the browser, upload straight to storage, then point the category at it
    uploadImage: async (item, file) => {
      if (!file.type.startsWith("image/")) throw new Error("Not an image file");
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
      catch { throw new Error("Could not read this image (unsupported format?)"); }
      let enc;
      try { enc = await encodeUnderLimit(bitmap, TILE_MAX_PX, MAIN_MAX_BYTES, "Category photo"); } finally { bitmap.close(); }
      const presign = await this.api.invoke(apiAdminUploadsPresignPost, { body: { kind: "category", contentType: "image/webp", bytes: enc.blob.size } });
      await putWithProgress(presign.uploadUrl!, enc.blob, presign.headers, () => {});
      return toItem(await this.api.invoke(apiAdminCategoriesIdPut, { id: item.id, body: { name: item.name, isActive: item.isActive, imageKey: presign.key! } }));
    },
  };
}
