import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Api } from '../../api/api';
import { apiAdminCategoriesGet } from '../../api/fn/admin-catalog/api-admin-categories-get';
import { apiAdminCategoriesPost } from '../../api/fn/admin-catalog/api-admin-categories-post';
import { apiAdminCategoriesIdPut } from '../../api/fn/admin-catalog/api-admin-categories-id-put';
import { apiAdminCategoriesIdDelete } from '../../api/fn/admin-catalog/api-admin-categories-id-delete';
import { apiAdminCategoriesReorderPost } from '../../api/fn/admin-catalog/api-admin-categories-reorder-post';
import { Category } from '../../api/models/category';
import { CatalogAdapter, CatalogItem, CatalogManager } from './catalog-manager';

const toItem = (c: Category): CatalogItem => ({ id: c.id!, name: c.name ?? '', slug: c.slug ?? '', isActive: c.isActive ?? true, productCount: c.productCount });

@Component({
  selector: 'gd-categories.page',
  imports: [CatalogManager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head"><h1 class="page-title">Categories</h1></div>
    <p class="muted">Drag to set the order shown on the storefront.</p>
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
  };
}
