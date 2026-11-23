import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/auth.service';
import { problemOf } from '../../core/http';

@Component({
  selector: 'gd-login',
  imports: [ReactiveFormsModule, InputTextModule, PasswordModule, ButtonModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <main class="auth">
      <form class="auth__card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1><span class="dot"></span>Gear Doctor</h1>
        <p class="muted">Sign in to manage products and orders.</p>
        @if (error()) { <p-message severity="error">{{ error() }}</p-message> }
        <label for="email">Email</label>
        <input pInputText id="email" type="email" formControlName="email" autocomplete="username" inputmode="email" />
        <label for="password">Password</label>
        <p-password inputId="password" formControlName="password" [feedback]="false" [toggleMask]="true"
                    autocomplete="current-password" styleClass="w-full" inputStyleClass="w-full" />
        <button pButton type="submit" label="Sign in" [loading]="busy()" [disabled]="form.invalid"></button>
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly next = input<string>();
  protected readonly busy = signal(false);
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
