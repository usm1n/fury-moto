import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from '../api/api';
import { apiAuthMeGet } from '../api/fn/auth/api-auth-me-get';
import { apiAuthLoginPost } from '../api/fn/auth/api-auth-login-post';
import { apiAuthLogoutPost } from '../api/fn/auth/api-auth-logout-post';
import { apiAuthChangePasswordPost } from '../api/fn/auth/api-auth-change-password-post';
import { apiAuthCsrfGet } from '../api/fn/auth/api-auth-csrf-get';
import { Me } from '../api/models/me';

/** Session state for the single Admin user. The JWT lives in an httpOnly cookie the app never sees. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly _me = signal<Me | null | undefined>(undefined);   // undefined = not loaded yet

  readonly me = this._me.asReadonly();
  readonly signedIn = computed(() => !!this._me());
  readonly mustChangePassword = computed(() => !!this._me()?.mustChangePassword);

  /** Loads /api/auth/me once (guards call this). Returns null when not signed in. */
  async load(force = false): Promise<Me | null> {
    if (this._me() !== undefined && !force) return this._me() ?? null;
    try {
      const me = await this.api.invoke(apiAuthMeGet);
      this._me.set(me);
      return me;
    } catch {
      this._me.set(null);
      return null;
    }
  }

  async login(email: string, password: string): Promise<Me> {
    const me = await this.api.invoke(apiAuthLoginPost, { body: { email, password } });
    this._me.set(me);
    await this.ensureCsrf(true);   // fresh antiforgery pair bound to the new session
    return me;
  }

  async logout(): Promise<void> {
    try { await this.api.invoke(apiAuthLogoutPost); } finally { this._me.set(null); }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.ensureCsrf();
    await this.api.invoke(apiAuthChangePasswordPost, { body: { currentPassword, newPassword } });
    await this.load(true);
  }

  /** Make sure the readable gd_csrf cookie exists (the interceptor sends it as X-CSRF-Token). */
  async ensureCsrf(force = false): Promise<void> {
    if (!force && readCookie('gd_csrf')) return;
    await this.api.invoke(apiAuthCsrfGet);
  }

  /** Called by the interceptor on 401. */
  clear(): void { this._me.set(null); }
}

export function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
