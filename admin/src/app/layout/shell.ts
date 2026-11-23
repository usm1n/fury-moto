import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule, ConfirmDialogModule, ButtonModule, DrawerModule],
  providers: [AlertsService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-toast position="top-center" />
    <p-confirmdialog />
    <header class="topbar">
      <a routerLink="/" class="brand"><span class="brand__dot"></span>Gear Doctor <small>admin</small></a>
      <span class="spacer"></span>
      <a class="view-store" href="/" target="_blank" rel="noopener"><i class="pi pi-external-link"></i><span>Store</span></a>
      <button pButton type="button" class="p-button-text p-button-sm" icon="pi pi-sign-out" label="Sign out" (click)="signOut()"></button>
    </header>
    <div class="frame">
      <nav class="sidenav" aria-label="Admin">
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
            <i [class]="'pi ' + item.icon"></i><span>{{ item.label }}</span>
            @if (badgeOf(item); as n) { <span class="badge" [attr.aria-label]="n + ' need attention'">{{ n }}</span> }
          </a>
        }
        <div class="navgroup">Content</div>
        @for (item of contentNav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active">
            <i [class]="'pi ' + item.icon"></i><span>{{ item.label }}</span>
          </a>
        }
        <div class="navgroup">Shop</div>
        <a routerLink="/settings" routerLinkActive="is-active"><i class="pi pi-cog"></i><span>Settings</span></a>
      </nav>
      <main class="content"><router-outlet /></main>
    </div>
    <nav class="tabbar" aria-label="Admin (mobile)">
      @for (item of mobileNav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
          <i [class]="'pi ' + item.icon"></i><span>{{ item.label }}</span>
          @if (badgeOf(item); as n) { <span class="badge" [attr.aria-label]="n + ' need attention'">{{ n }}</span> }
        </a>
      }
      <button type="button" [class.is-active]="moreOpen()" aria-haspopup="dialog" (click)="moreOpen.set(true)">
        <i class="pi pi-bars"></i><span>More</span>
      </button>
    </nav>
    <p-drawer [visible]="moreOpen()" (visibleChange)="moreOpen.set($event)" position="bottom" header="More" [style]="{ height: 'auto', maxHeight: '85dvh' }">
      <div class="sheet" (click)="moreOpen.set(false)" (keydown.enter)="moreOpen.set(false)" tabindex="-1">
        @for (item of moreNav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active"><i [class]="'pi ' + item.icon"></i><span>{{ item.label }}</span></a>
        }
        <button type="button" (click)="signOut()"><i class="pi pi-sign-out"></i><span>Sign out</span></button>
      </div>
    </p-drawer>
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
    .tabbar a i, .tabbar button i { font-size: 1.15rem; }
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

  protected readonly moreOpen = signal(false);

  protected readonly nav: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: 'pi-home', exact: true, badge: 'stock' },
    { path: '/orders', label: 'Orders', icon: 'pi-shopping-bag', badge: 'orders' },
    { path: '/products', label: 'Products', icon: 'pi-box' },
    { path: '/categories', label: 'Categories', icon: 'pi-th-large' },
    { path: '/brands', label: 'Brands', icon: 'pi-tag' },
  ];
  protected readonly contentNav: NavItem[] = [
    { path: '/guides', label: 'Guides', icon: 'pi-book' },
    { path: '/faqs', label: 'FAQs', icon: 'pi-question-circle' },
    { path: '/testimonials', label: 'Testimonials', icon: 'pi-comments' },
    { path: '/audit', label: 'Activity', icon: 'pi-history' },
  ];
  protected readonly mobileNav: NavItem[] = [
    { path: '/', label: 'Home', icon: 'pi-home', exact: true, badge: 'stock' },
    { path: '/orders', label: 'Orders', icon: 'pi-shopping-bag', badge: 'orders' },
    { path: '/products/new', label: 'Add', icon: 'pi-plus-circle' },
    { path: '/products', label: 'Products', icon: 'pi-box', exact: true },
  ];
  protected readonly moreNav: NavItem[] = [
    { path: '/categories', label: 'Categories', icon: 'pi-th-large' },
    { path: '/brands', label: 'Brands', icon: 'pi-tag' },
    ...this.contentNav,
    { path: '/settings', label: 'Settings', icon: 'pi-cog' },
  ];

  protected badgeOf(item: NavItem): number {
    return item.badge === 'orders' ? this.alerts.newOrders() : item.badge === 'stock' ? this.alerts.stock() : 0;
  }

  protected async signOut(): Promise<void> {
    this.moreOpen.set(false);
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
