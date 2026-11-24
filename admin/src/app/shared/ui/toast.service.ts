import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast';

export interface ToastMessage {
  severity?: ToastSeverity;
  summary?: string;
  detail?: string;
  /** ms; default 3000 (errors 5000) */
  life?: number;
}

/**
 * App-wide toast built on MatSnackBar. Same call shape the screens used before
 * (`toast.add({ severity, summary, detail, life })`), so swapping it in is mechanical.
 */
@Injectable({ providedIn: 'root' })
export class Toast {
  private readonly bar = inject(MatSnackBar);

  add(m: ToastMessage): void {
    const text = [m.summary, m.detail].filter(Boolean).join(' - ');
    const sev = m.severity === 'error' ? 'error' : m.severity === 'warn' ? 'warn' : m.severity === 'success' ? 'success' : 'info';
    this.bar.open(text || '', 'Close', {
      duration: m.life ?? (sev === 'error' ? 5000 : 3000),
      panelClass: ['gd-toast', `gd-toast--${sev}`],
      horizontalPosition: 'center',
      verticalPosition: 'top',
      politeness: sev === 'error' ? 'assertive' : 'polite',
    });
  }

  success(summary: string, detail?: string): void { this.add({ severity: 'success', summary, detail }); }
  warn(summary: string, detail?: string): void { this.add({ severity: 'warn', summary, detail }); }
  error(summary: string, detail?: string): void { this.add({ severity: 'error', summary, detail }); }
}
