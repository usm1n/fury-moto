import { Pipe, PipeTransform } from '@angular/core';
import { assetUrl } from '../core/format';

/** Roots relative API image URLs so they resolve outside <base href="/admin/">. */
@Pipe({ name: 'assetUrl' })
export class AssetUrlPipe implements PipeTransform {
  transform(u: string | null | undefined): string { return assetUrl(u); }
}
