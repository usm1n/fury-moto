import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
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
  imports: [ReactiveFormsModule, PasswordModule, ButtonModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth.scss',
  providers: [MessageService],
  template: `
    <main class="auth">
      <form class="auth__card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1><span class="dot"></span>New password</h1>
        @if (forced()) { <p class="muted">For security, set your own password before continuing.</p> }
        @if (problem()?.title && !problem()?.errors) { <p-message severity="error">{{ problem()!.title }}</p-message> }
        <label for="current">Current password</label>
        <p-password inputId="current" formControlName="currentPassword" [feedback]="false" [toggleMask]="true" autocomplete="current-password" styleClass="w-full" inputStyleClass="w-full" />
        @if (err('currentPassword')) { <small class="field-error">{{ err('currentPassword') }}</small> }
        <label for="new">New password</label>
        <p-password inputId="new" formControlName="newPassword" [toggleMask]="true" autocomplete="new-password" styleClass="w-full" inputStyleClass="w-full" />
        <small class="hint">At least 12 characters with upper-case, lower-case and a number.</small>
        @if (err('newPassword')) { <small class="field-error">{{ err('newPassword') }}</small> }
        <label for="confirm">Repeat new password</label>
        <p-password inputId="confirm" formControlName="confirm" [feedback]="false" [toggleMask]="true" autocomplete="new-password" styleClass="w-full" inputStyleClass="w-full" />
        @if (form.hasError('mismatch') && form.controls.confirm.dirty) { <small class="field-error">Passwords don't match.</small> }
        <button pButton type="submit" label="Save password" [loading]="busy()" [disabled]="form.invalid"></button>
      </form>
    </main>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly forced = computed(() => this.auth.mustChangePassword());
  protected readonly busy = signal(false);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, strong]],
    confirm: ['', Validators.required],
  }, { validators: matches });

  protected err(field: string): string | null { return fieldError(this.problem(), field); }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
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
