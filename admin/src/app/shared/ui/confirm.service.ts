import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  header?: string;
  message: string;
  acceptLabel?: string;
  rejectLabel?: string;
  /** red accept button (delete, cancel order, ...) */
  danger?: boolean;
  accept?: () => void;
  reject?: () => void;
}

@Component({
  selector: 'gd-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.header) { <h2 mat-dialog-title>{{ data.header }}</h2> }
    <mat-dialog-content><p class="msg">{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">{{ data.rejectLabel || 'Cancel' }}</button>
      <button mat-flat-button type="button" [class.gd-danger]="data.danger" [mat-dialog-close]="true" cdkFocusInitial>{{ data.acceptLabel || 'OK' }}</button>
    </mat-dialog-actions>`,
  styles: `.msg { margin: 0; line-height: 1.5; color: var(--p-surface-100); }`,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
}

/**
 * Confirmation dialogs on MatDialog. `confirm({...accept, reject})` keeps the callback style the
 * screens used before; `ask({...})` returns Promise<boolean> for async/await code.
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly dialog = inject(MatDialog);

  ask(o: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data: o, width: '26rem', maxWidth: '94vw', autoFocus: 'dialog', ariaLabel: o.header || 'Confirm' });
    return firstValueFrom(ref.afterClosed()).then((r) => r === true);
  }

  confirm(o: ConfirmOptions): void {
    void this.ask(o).then((ok) => (ok ? o.accept?.() : o.reject?.()));
  }
}
