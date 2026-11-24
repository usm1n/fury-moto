import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Message } from '../../shared/ui/ui';
import { AuthService } from '../../core/auth.service';
import { problemOf } from '../../core/http';

@Component({
  selector: 'gd-login',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, Message],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <main class="auth">
      <form class="auth__card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1><span class="dot"></span>Gear Doctor</h1>
        <p class="muted">Sign in to manage products and orders.</p>
        @if (error()) { <gd-message severity="error">{{ error() }}</gd-message> }
        <label for="email">Email</label>
        <input class="gd-input" id="email" type="email" formControlName="email" autocomplete="username" inputmode="email" />
        <label for="password">Password</label>
        <div class="pw">
          <input class="gd-input" id="password" [type]="showPw() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
          <button mat-icon-button type="button" class="pw__toggle" [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="showPw()" (click)="showPw.set(!showPw())"><mat-icon>{{ showPw() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
        </div>
        <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">@if (busy()) { <mat-progress-spinner mode="indeterminate" diameter="18" /> }Sign in</button>
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly next = input<string>();
  protected readonly busy = signal(false);
  protected readonly showPw = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const me = await this.auth.login(email.trim(), password);
      const target = me.mustChangePassword ? '/change-password' : this.next() || '/';
      await this.router.navigateByUrl(target);
    } catch (e) {
      const p = problemOf(e);
      this.error.set(p.title ?? 'Sign-in failed');
      this.form.controls.password.reset();
    } finally {
      this.busy.set(false);
    }
  }
}
