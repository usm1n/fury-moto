import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService, readCookie } from './auth.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Every API call: send cookies; on state-changing requests attach the antiforgery token
 * (X-CSRF-Token from the gd_csrf cookie, fetched first if missing).
 * 401 → back to login; 403 "password change required" → change-password screen.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);

  const send = () => {
    let r = req.clone({ withCredentials: true });
    if (MUTATING.has(req.method)) {
      const token = readCookie('gd_csrf');
      if (token) r = r.clone({ setHeaders: { 'X-CSRF-Token': token } });
    }
    return next(r);
  };

  const needsCsrf = MUTATING.has(req.method) && !readCookie('gd_csrf') && !req.url.includes('/api/auth/login');
  const request$ = needsCsrf ? from(auth.ensureCsrf()).pipe(switchMap(send)) : send();

  return request$.pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse) {
        const isAuthCall = req.url.includes('/api/auth/');
        if (e.status === 401 && !isAuthCall) {
          auth.clear();
          router.navigate(['/login'], { queryParams: { next: router.url } });
        } else if (e.status === 403 && (e.error as { type?: string })?.type === '/problems/password-change-required') {
          router.navigate(['/change-password']);
        }
      }
      return throwError(() => e);
    }),
  );
};

/** ProblemDetails → readable message (+ field errors) for toasts and forms. */
export interface Problem { title?: string; detail?: string; status?: number; type?: string; errors?: Record<string, string[]>; [k: string]: unknown }

export function problemOf(e: unknown): Problem {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return { title: 'Can\'t reach the server', detail: 'Check your connection and try again.', status: 0 };
    const body = (typeof e.error === 'object' && e.error) ? e.error as Problem : {};
    return { title: body.title ?? e.statusText ?? 'Something went wrong', ...body, status: e.status };
  }
  return { title: 'Something went wrong', detail: String(e) };
}

/** First message for a form field from a ProblemDetails `errors` dictionary (keys are camelCase). */
export function fieldError(p: Problem | null | undefined, field: string): string | null {
  return p?.errors?.[field]?.[0] ?? null;
}
