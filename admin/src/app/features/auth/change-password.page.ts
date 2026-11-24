import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Message } from '../../shared/ui/ui';
import { AuthService } from '../../core/auth.service';
import { fieldError, Problem, problemOf } from '../../core/http';

const strong = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  return v.length >= 12 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) ? null : { weak: true };
};
const matches = (g: AbstractControl): ValidationErrors | null =>
  g.get('newPassword')?.value === g.get('confirm')?.value ? null : { mismatch: true };

@Component({
  selector: 'gd-change-password',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, Message],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  template: `
    <main class="auth">
      <form class="auth__card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1><span class="dot"></span>New password</h1>
        @if (forced()) { <p class="muted">For security, set your own password before continuing.</p> }
        @if (problem()?.title && !problem()?.errors) { <gd-message severity="error">{{ problem()!.title }}</gd-message> }
        <label for="current">Current password</label>
        <div class="pw">
          <input class="gd-input" id="current" [type]="showCur() ? 'text' : 'password'" formControlName="currentPassword" autocomplete="current-password" />
          <button mat-icon-button type="button" class="pw__toggle" [attr.aria-label]="showCur() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="showCur()" (click)="showCur.set(!showCur())"><mat-icon>{{ showCur() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
        </div>
        @if (err('currentPassword')) { <small class="field-error">{{ err('currentPassword') }}</small> }
        <label for="new">New password</label>
        <div class="pw">
          <input class="gd-input" id="new" [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" autocomplete="new-password" />
          <button mat-icon-button type="button" class="pw__toggle" [attr.aria-label]="showNew() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="showNew()" (click)="showNew.set(!showNew())"><mat-icon>{{ showNew() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
        </div>
        <small class="hint">At least 12 characters with upper-case, lower-case and a number.</small>
        @if (err('newPassword')) { <small class="field-error">{{ err('newPassword') }}</small> }
        <label for="confirm">Repeat new password</label>
        <div class="pw">
          <input class="gd-input" id="confirm" [type]="showConf() ? 'text' : 'password'" formControlName="confirm" autocomplete="new-password" />
          <button mat-icon-button type="button" class="pw__toggle" [attr.aria-label]="showConf() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="showConf()" (click)="showConf.set(!showConf())"><mat-icon>{{ showConf() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
        </div>
        @if (form.hasError('mismatch') && form.controls.confirm.dirty) { <small class="field-error">Passwords don't match.</small> }
        <button mat-flat-button type="submit" [disabled]="form.invalid || busy()">@if (busy()) { <mat-progress-spinner mode="indeterminate" diameter="18" /> }Save password</button>
      </form>
    </main>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly forced = computed(() => this.auth.mustChangePassword());
  protected readonly busy = signal(false);
  protected readonly showCur = signal(false);
  protected readonly showNew = signal(false);
  protected readonly showConf = signal(false);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, strong]],
    confirm: ['', Validators.required],
  }, { validators: matches });

  protected err(field: string): string | null { return fieldError(this.problem(), field); }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.problem.set(null);
    try {
      const { currentPassword, newPassword } = this.form.getRawValue();
      await this.auth.changePassword(currentPassword, newPassword);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.problem.set(problemOf(e));
    } finally {
      this.busy.set(false);
    }
  }
}
