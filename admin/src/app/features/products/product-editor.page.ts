import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HasUnsavedChanges } from '../../core/guards';

/** STUB — replaced by the feature agent (Phase 2). */
@Component({
  selector: 'gd-product-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="page-title">Product</h1><p class="muted">Coming soon.</p>`,
})
export class ProductEditorPage implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean { return false; }
}
