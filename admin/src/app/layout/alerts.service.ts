import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Api } from '../api/api';
import { apiAdminAlertsGet } from '../api/fn/admin-audit/api-admin-alerts-get';
import { Alerts } from '../api/models/alerts';
import { stockAlertCount } from '../features/content/content-helpers';

export const ALERTS_POLL_MS = 60_000;

/**
 * Shell badge counts. Polls /api/admin/alerts every 60 s only while the tab is visible (and once more
 * when it becomes visible again). Provided by the Shell, so it stops when the shell is destroyed (logout).
 * Errors are ignored on purpose: a stale badge is better than noise.
 */
@Injectable()
export class AlertsService {
  private readonly api = inject(Api);
  private readonly alerts = signal<Alerts | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = false;

  readonly newOrders = computed(() => this.alerts()?.newOrders ?? 0);
  readonly stock = computed(() => stockAlertCount(this.alerts()));

  constructor() {
    const onVisibility = () => (document.visibilityState === 'visible' ? this.start() : this.stop());
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => { document.removeEventListener('visibilitychange', onVisibility); this.stop(); });
    onVisibility();
  }

  private start(): void {
    void this.refresh();
    if (!this.timer) this.timer = setInterval(() => void this.refresh(), ALERTS_POLL_MS);
  }

  private stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async refresh(): Promise<void> {
    if (this.inflight || document.visibilityState !== 'visible') return;
    this.inflight = true;
    try {
      this.alerts.set(await this.api.invoke(apiAdminAlertsGet));
    } catch {
      // ignore silently
    } finally {
      this.inflight = false;
    }
  }
}
