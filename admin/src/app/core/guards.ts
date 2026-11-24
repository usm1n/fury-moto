import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Confirm } from '../shared/ui/confirm.service';

/** Signed-in admin only; seeded admin is sent to change the initial password first. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const me = await auth.load();
  if (!me) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  if (me.mustChangePassword) return router.createUrlTree(['/change-password']);
  return true;
};

/** Login page: already signed in → dashboard. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const me = await auth.load();
  return me && !me.mustChangePassword ? inject(Router).createUrlTree(['/']) : true;
};

/** Any signed-in user (used by the change-password screen). */
export const signedInGuard: CanActivateFn = async () => {
  const me = await inject(AuthService).load();
  return me ? true : inject(Router).createUrlTree(['/login']);
};

/** Components with unsaved edits implement this; the guard asks before leaving. */
export interface HasUnsavedChanges { hasUnsavedChanges(): boolean }
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (c) =>
  !c?.hasUnsavedChanges?.() || inject(Confirm).ask({
    header: 'Unsaved changes', message: 'You have unsaved changes. Leave this page and lose them?',
    acceptLabel: 'Leave', rejectLabel: 'Stay', danger: true,
  });
