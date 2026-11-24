import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { MessageService, ConfirmationService } from 'primeng/api';
import { PRIMEUI_LICENSE } from './core/license.generated';
import { routes } from './app.routes';
import { apiInterceptor } from './core/http';
import { GearDoctorTheme } from './core/theme';
import { provideApiConfiguration } from './api/api-configuration';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withViewTransitions()),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideApiConfiguration(''),            // same origin: /api/* (dev: proxied by proxy.conf.json)
    providePrimeNG({ theme: { preset: GearDoctorTheme, options: { darkModeSelector: '.app-dark', cssLayer: false } }, ripple: false, license: PRIMEUI_LICENSE || undefined }),
    MessageService,
    ConfirmationService,
  ],
};
