import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AssetUrlPipe } from '../../shared/asset-url.pipe';
import { formatPkr } from '../../core/format';

/** Live mirror of the storefront product card (4:5 image, badge pills, brand, title, price, cert pills; dark style). */
@Component({
  imports: [AssetUrlPipe, MatIconModule],
  selector: 'gd-product-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .card { width: 100%; max-width: 280px; background: #141416; border: 1px solid #2a2a2e; border-radius: 12px; overflow: hidden; color: #f4f4f5; }
    .img { position: relative; aspect-ratio: 4 / 5; background: #1d1d20; display: grid; place-items: center; color: #52525b; }
    .img img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badges { position: absolute; top: .5rem; left: .5rem; display: flex; flex-wrap: wrap; gap: .25rem; }
    .pill { font-size: .62rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: .2rem .5rem; border-radius: 999px; background: #f4f4f5; color: #111; }
    .pill--sale { background: var(--p-primary-500); color: #fff; }
    .body { padding: .75rem .8rem .9rem; display: grid; gap: .3rem; }
    .brand { font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: #a1a1aa; }
    .title { font-weight: 600; font-size: .95rem; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.4em; }
    .price { display: flex; gap: .5rem; align-items: baseline; font-variant-numeric: tabular-nums; }
    .price b { font-size: 1.05rem; }
    .price s { color: #71717a; font-size: .82rem; }
    .certs { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .2rem; }
    .cert { font-size: .62rem; padding: .15rem .45rem; border: 1px solid #3f3f46; border-radius: 4px; color: #d4d4d8; }
  `,
  template: `
    <div class="card" aria-label="Storefront card preview">
      <div class="img">
        @if (imageUrl()) { <img [src]="imageUrl() | assetUrl" alt="" /> } @else { <mat-icon style="font-size:2rem;width:auto;height:auto">image</mat-icon> }
        @if (badges().length) {
          <div class="badges">@for (b of badges(); track b) { <span class="pill" [class.pill--sale]="b === 'Sale'">{{ b }}</span> }</div>
        }
      </div>
      <div class="body">
        <div class="brand">{{ brand() || 'Brand' }}</div>
        <div class="title">{{ title() || 'Product title' }}</div>
        <div class="price">
          <b>{{ pkr(price()) }}</b>
          @if (compareAt() && compareAt()! > (price() ?? 0)) { <s>{{ pkr(compareAt()) }}</s> }
        </div>
        @if (certs().length) { <div class="certs">@for (c of certs(); track c) { <span class="cert">{{ c }}</span> }</div> }
      </div>
    </div>
  `,
})
export class ProductPreview {
  readonly imageUrl = input<string | null>(null);
  readonly badges = input<readonly string[]>([]);
  readonly brand = input('');
  readonly title = input('');
  readonly price = input<number | null>(null);
  readonly compareAt = input<number | null>(null);
  readonly certs = input<readonly string[]>([]);
  protected readonly pkr = formatPkr;
}
