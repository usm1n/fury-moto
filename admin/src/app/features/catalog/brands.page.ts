import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Api } from '../../api/api';
import { apiAdminBrandsGet } from '../../api/fn/admin-catalog/api-admin-brands-get';
import { apiAdminBrandsPost } from '../../api/fn/admin-catalog/api-admin-brands-post';
import { apiAdminBrandsIdPut } from '../../api/fn/admin-catalog/api-admin-brands-id-put';
import { apiAdminBrandsIdDelete } from '../../api/fn/admin-catalog/api-admin-brands-id-delete';
import { apiAdminBrandsReorderPost } from '../../api/fn/admin-catalog/api-admin-brands-reorder-post';
import { Brand } from '../../api/models/brand';
import { CatalogAdapter, CatalogItem, CatalogManager } from './catalog-manager';

const toItem = (b: Brand): CatalogItem => ({ id: b.id!, name: b.name ?? '', slug: b.slug ?? '', isActive: b.isActive ?? true });

@Component({
  selector: 'gd-brands.page',
  imports: [CatalogManager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head"><h1 class="page-title">Brands</h1></div>
    <p class="muted">Drag to set the order shown on the storefront.</p>
    <gd-catalog-manager [adapter]="adapter" noun="brand" />
  `,
})
export class BrandsPage {
  private readonly api = inject(Api);
  protected readonly adapter: CatalogAdapter = {
    list: async () => (await this.api.invoke(apiAdminBrandsGet)).map(toItem),
    create: async (v) => toItem(await this.api.invoke(apiAdminBrandsPost, { body: v })),
    update: async (id, v) => toItem(await this.api.invoke(apiAdminBrandsIdPut, { id, body: v })),
    remove: async (id) => { await this.api.invoke(apiAdminBrandsIdDelete, { id }); },
    reorder: async (ids) => { await this.api.invoke(apiAdminBrandsReorderPost, { body: { ids } }); },
  };
}
