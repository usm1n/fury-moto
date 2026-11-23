import { Routes } from '@angular/router';
import { authGuard, guestGuard, signedInGuard, unsavedChangesGuard } from './core/guards';

/**
 * All screens are lazy-loaded standalone components. Each feature folder is owned by one
 * builder agent (see docs/BUILD_LOG.md). Base href is /admin/.
 */
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], title: 'Sign in · Gear Doctor admin',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage) },
  { path: 'change-password', canActivate: [signedInGuard], title: 'Change password · Gear Doctor admin',
    loadComponent: () => import('./features/auth/change-password.page').then((m) => m.ChangePasswordPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', title: 'Dashboard · Gear Doctor admin',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'products', title: 'Products · Gear Doctor admin',
        loadComponent: () => import('./features/products/products-list.page').then((m) => m.ProductsListPage) },
      { path: 'products/new', title: 'New product · Gear Doctor admin', canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/products/product-editor.page').then((m) => m.ProductEditorPage) },
      { path: 'products/:id', title: 'Edit product · Gear Doctor admin', canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/products/product-editor.page').then((m) => m.ProductEditorPage) },
      { path: 'categories', title: 'Categories · Gear Doctor admin',
        loadComponent: () => import('./features/catalog/categories.page').then((m) => m.CategoriesPage) },
      { path: 'brands', title: 'Brands · Gear Doctor admin',
        loadComponent: () => import('./features/catalog/brands.page').then((m) => m.BrandsPage) },
      { path: 'orders', title: 'Orders · Gear Doctor admin',
        loadComponent: () => import('./features/orders/orders-list.page').then((m) => m.OrdersListPage) },
      { path: 'orders/:id', title: 'Order · Gear Doctor admin',
        loadComponent: () => import('./features/orders/order-detail.page').then((m) => m.OrderDetailPage) },
      { path: 'guides', title: 'Guides · Gear Doctor admin',
        loadComponent: () => import('./features/content/guides-list.page').then((m) => m.GuidesListPage) },
      { path: 'guides/new', title: 'New guide · Gear Doctor admin', canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/content/guide-editor.page').then((m) => m.GuideEditorPage) },
      { path: 'guides/:id', title: 'Edit guide · Gear Doctor admin', canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/content/guide-editor.page').then((m) => m.GuideEditorPage) },
      { path: 'faqs', title: 'FAQs · Gear Doctor admin',
        loadComponent: () => import('./features/content/faqs.page').then((m) => m.FaqsPage) },
      { path: 'testimonials', title: 'Testimonials · Gear Doctor admin',
        loadComponent: () => import('./features/content/testimonials.page').then((m) => m.TestimonialsPage) },
      { path: 'audit', title: 'Activity · Gear Doctor admin',
        loadComponent: () => import('./features/audit/audit.page').then((m) => m.AuditPage) },
      { path: 'settings', title: 'Settings · Gear Doctor admin', canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
