import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { inject } from '@angular/core';

export type SpecGroup = FormGroup<{ label: FormControl<string>; value: FormControl<string> }>;

export function newSpecGroup(fb: NonNullableFormBuilder, label = '', value = ''): SpecGroup {
  return fb.group({ label: [label, [Validators.required, Validators.maxLength(60)]], value: [value, [Validators.required, Validators.maxLength(200)]] });
}

/** Key/value spec rows: add, remove, move up/down. Works directly on the parent's FormArray. */
@Component({
  selector: 'gd-specs-editor',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: .4rem; padding: .6rem 0; border-bottom: 1px solid var(--p-surface-800); }
    .fields { display: grid; gap: .4rem; }
    @media (min-width: 640px) { .fields { grid-template-columns: 1fr 2fr; } }
    .btns { display: flex; flex-direction: column; justify-content: center; }
    .fields input { min-height: 44px; width: 100%; }
    .add { margin-top: .75rem; }
  `,
  template: `
    @for (g of array().controls; track g; let i = $index) {
      <div class="row" [formGroup]="g">
        <div class="fields">
          <input class="gd-input" formControlName="label" placeholder="e.g. Shell material" [attr.aria-label]="'Spec ' + (i + 1) + ' name'" />
          <input class="gd-input" formControlName="value" placeholder="e.g. Carbon fibre" [attr.aria-label]="'Spec ' + (i + 1) + ' value'" />
        </div>
        <div class="btns">
          <button mat-icon-button type="button" aria-label="Move up" [disabled]="i === 0" (click)="move(i, -1)"><mat-icon>arrow_upward</mat-icon></button>
          <button mat-icon-button type="button" aria-label="Move down" [disabled]="i === array().length - 1" (click)="move(i, 1)"><mat-icon>arrow_downward</mat-icon></button>
          <button mat-icon-button type="button" class="gd-danger" aria-label="Remove spec" (click)="remove(i)"><mat-icon>delete</mat-icon></button>
        </div>
      </div>
    } @empty {
      <p class="muted">No specs yet (weight, shell material, fit...).</p>
    }
    <button mat-stroked-button type="button" class="add" (click)="add()"><mat-icon>add</mat-icon>Add spec</button>
  `,
})
export class SpecsEditor {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly array = input.required<FormArray<SpecGroup>>();

  protected add(): void { this.array().push(newSpecGroup(this.fb)); this.array().markAsDirty(); }
  protected remove(i: number): void { this.array().removeAt(i); this.array().markAsDirty(); }
  protected move(i: number, delta: number): void {
    const arr = this.array();
    const g = arr.at(i);
    arr.removeAt(i);
    arr.insert(i + delta, g);
    arr.markAsDirty();
  }
}
