import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { AlertsService } from './alerts.service';

interface NavItem { path: string; label: string; icon: string; exact?: boolean; badge?: 'orders' | 'stock'; }

/**
 * App frame: top bar + side nav on desktop, bottom tab bar on phones (Umair runs the shop
 * from his phone, so the primary actions sit in thumb reach). Hosts the global toast and
 * confirm dialog. The phone "More" button opens a sheet with everything that does not fit the bar.
 * AlertsService is provided here so its polling dies with the shell (logout).
 */
@Component({
  selector: 'gd-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatBottomSheetModule],
  providers: [AlertsService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand"><span class="brand__dot"></span>Gear Doctor <small>admin</small></a>
      <span class="spacer"></span>
      <a class="view-store" href="/" target="_blank" rel="noopener"><mat-icon>open_in_new</mat-icon><span>Store</span></a>
      <button mat-button type="button" (click)="signOut()"><mat-icon>logout</mat-icon>Sign out</button>
    </header>
    <div class="frame">
      <nav class="sidenav" aria-label="Admin">
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
            <mat-icon>{{ item.icon }}</mat-icon><span>{{ item.label }}</span>
            @if (badgeOf(item); as n) { <span class="badge" [attr.aria-label]="n + ' need attention'">{{ n }}</span> }
          </a>
        }
        <div class="navgroup">Content</div>
        @for (item of contentNav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active">
            <mat-icon>{{ item.icon }}</mat-icon><span>{{ item.label }}</span>
          </a>
        }
        <div class="navgroup">Shop</div>
        <a routerLink="/settings" routerLinkActive="is-active"><mat-icon>settings</mat-icon><span>Settings</span></a>
      </nav>
      <main class="content"><router-outlet /></main>
    </div>
    <nav class="tabbar" aria-label="Admin (mobile)">
      @for (item of mobileNav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
          <mat-icon>{{ item.icon }}</mat-icon><span>{{ item.label }}</span>
          @if (badgeOf(item); as n) { <span class="badge" [attr.aria-label]="n + ' need attention'">{{ n }}</span> }
        </a>
      }
      <button type="button" [class.is-active]="moreOpen()" aria-haspopup="dialog" (click)="openMore()">
        <mat-icon>more_horiz</mat-icon><span>More</span>
      </button>
    </nav>
    <ng-template #moreSheet>
      <div class="sheet" aria-label="More">
        @for (item of moreNav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active" (click)="closeMore()"><mat-icon>{{ item.icon }}</mat-icon><span>{{ item.label }}</span></a>
        }
        <button type="button" (click)="signOut()"><mat-icon>logout</mat-icon><span>Sign out</span></button>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; }
    .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: .5rem;
      height: 56px; padding: 0 1rem; background: color-mix(in srgb, var(--p-surface-950) 92%, transparent);
      border-bottom: 1px solid var(--p-surface-700); backdrop-filter: blur(8px); }
    .brand { display: flex; align-items: center; gap: .5rem; color: var(--p-surface-0); text-decoration: none;
      font-family: 'Anton', Impact, sans-serif; font-size: 1.15rem; letter-spacing: .02em; text-transform: uppercase; }
    .brand small { font-family: Inter, system-ui, sans-serif; font-size: .7rem; color: var(--p-surface-300); text-transform: none; letter-spacing: 0; }
    .brand__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--p-primary-500); box-shadow: 0 0 10px var(--p-primary-500); }
    .spacer { flex: 1; }
    .view-store { display: inline-flex; gap: .35rem; align-items: center; color: var(--p-surface-300); text-decoration: none; font-size: .85rem; padding: .4rem .6rem; }
    .frame { display: grid; grid-template-columns: 1fr; }
    .sidenav { display: none; }
    .content { padding: 1rem 1rem calc(76px + env(safe-area-inset-bottom)); min-width: 0; }
    .tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: grid; grid-template-columns: repeat(5, 1fr);
      padding-bottom: env(safe-area-inset-bottom); background: var(--p-surface-900); border-top: 1px solid var(--p-surface-700); }
    .tabbar a, .tabbar button { position: relative; display: grid; justify-items: center; gap: 2px; padding: .55rem 0 .5rem; min-height: 56px; color: var(--p-surface-300);
      text-decoration: none; font-size: .7rem; }
    .tabbar button { background: none; border: 0; font: inherit; font-size: .7rem; cursor: pointer; }
    .tabbar mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .sidenav mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .view-store mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .tabbar a.is-active, .tabbar button.is-active { color: var(--p-primary-400); }
    .badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--p-primary-500); color: #fff; font-size: .68rem; font-weight: 700;
      display: inline-grid; place-items: center; line-height: 1; }
    .tabbar .badge { position: absolute; top: 4px; left: calc(50% + 6px); }
    .sidenav .badge { margin-left: auto; }
    .navgroup { margin: .9rem .75rem .2rem; font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; color: var(--p-surface-400); }
    .sheet { display: grid; gap: .25rem; }
    .sheet a, .sheet button { display: flex; align-items: center; gap: .8rem; min-height: 48px; padding: 0 .75rem; border-radius: 10px; border: 0; background: none;
      color: var(--p-surface-100); text-decoration: none; font: inherit; cursor: pointer; text-align: left; }
    .sheet a:hover, .sheet button:hover { background: var(--p-surface-800); }
    .sheet a.is-active { color: var(--p-primary-400); }
    @media (min-width: 900px) {
      .frame { grid-template-columns: 220px 1fr; }
      .sidenav { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 56px; height: calc(100dvh - 56px); overflow-y: auto;
        padding: 1rem .75rem; border-right: 1px solid var(--p-surface-700); }
      .sidenav a { display: flex; gap: .7rem; align-items: center; padding: .6rem .75rem; border-radius: 8px; color: var(--p-surface-200); text-decoration: none; }
      .sidenav a:hover { background: var(--p-surface-800); }
      .sidenav a.is-active { background: color-mix(in srgb, var(--p-primary-500) 18%, transparent); color: var(--p-surface-0); }
      .content { padding: 1.5rem 2rem 2rem; }
      .tabbar { display: none; }
    }
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertsService);

  private readonly sheet = inject(MatBottomSheet);
  private readonly moreSheet = viewChild.required<TemplateRef<unknown>>('moreSheet');
  private sheetRef: MatBottomSheetRef | null = null;

  protected readonly moreOpen = signal(false);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: 'home', exact: true, badge: 'stock' },
    { path: '/orders', label: 'Orders', icon: 'receipt_long', badge: 'orders' },
    { path: '/products', label: 'Products', icon: 'inventory_2' },
    { path: '/categories', label: 'Categories', icon: 'category' },
    { path: '/brands', label: 'Brands', icon: 'sell' },
  ];
  protected readonly contentNav: NavItem[] = [
    { path: '/guides', label: 'Guides', icon: 'menu_book' },
    { path: '/faqs', label: 'FAQs', icon: 'help' },
    { path: '/testimonials', label: 'Testimonials', icon: 'reviews' },
    { path: '/audit', label: 'Activity', icon: 'history' },
  ];
  protected readonly mobileNav: NavItem[] = [
    { path: '/', label: 'Home', icon: 'home', exact: true, badge: 'stock' },
    { path: '/orders', label: 'Orders', icon: 'receipt_long', badge: 'orders' },
    { path: '/products/new', label: 'Add', icon: 'add_circle' },
    { path: '/products', label: 'Products', icon: 'inventory_2', exact: true },
  ];
  protected readonly moreNav: NavItem[] = [
    { path: '/categories', label: 'Categories', icon: 'category' },
    { path: '/brands', label: 'Brands', icon: 'sell' },
    ...this.contentNav,
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  protected badgeOf(item: NavItem): number {
    return item.badge === 'orders' ? this.alerts.newOrders() : item.badge === 'stock' ? this.alerts.stock() : 0;
  }

  protected openMore(): void {
    this.moreOpen.set(true);
    this.sheetRef = this.sheet.open(this.moreSheet(), { ariaLabel: 'More' });
    this.sheetRef.afterDismissed().subscribe(() => { this.moreOpen.set(false); this.sheetRef = null; });
  }

  protected closeMore(): void { this.sheetRef?.dismiss(); }

  protected async signOut(): Promise<void> {
    this.closeMore();
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
