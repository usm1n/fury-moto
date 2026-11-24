# Admin UI: PrimeNG → Angular Material conversion guide

PrimeNG 22 needs a paid-or-registered PrimeUI license key. The admin moves to **Angular Material 22**
(MIT, Google). Behaviour, data flow, API calls, routes, guards and tests stay exactly as they are;
only the UI layer changes.

## Already in place (do not edit; ask the orchestrator for additions)
- `src/styles.scss`: Material M3 dark theme (red primary) + design tokens under the old `--p-*`
  names (`--p-surface-0..950`, `--p-primary-400/500`, `--p-red-400`, ...). Component styles that use
  them keep working. Also `.gd-input` (native input/textarea/select styling), `.gd-danger` / `.gd-success`
  button classes, toast severity classes.
- `src/app/shared/ui/toast.service.ts`: `Toast` with `add({ severity, summary, detail, life })`
  (same shape as PrimeNG `MessageService.add`), plus `success()/warn()/error()`.
- `src/app/shared/ui/confirm.service.ts`: `Confirm` with `confirm({ header, message, acceptLabel,
  rejectLabel, danger, accept, reject })` and `ask(...) : Promise<boolean>`.
- `src/app/shared/ui/ui.ts`: `<gd-skeleton width height radius shape>`, `<gd-tag [value] severity rounded>`
  (+ projected content), `<gd-message severity>` (projected content).
- `app.config.ts`: no PrimeNG; `<mat-icon>name</mat-icon>` renders **Material Symbols Outlined**;
  `mat-form-field` defaults to `appearance: outline`.

## Mapping
| PrimeNG | Material / ours |
|---|---|
| `MessageService` | `Toast` (`inject(Toast).add(...)`, same args) |
| `ConfirmationService.confirm({..., acceptButtonStyleClass: 'p-button-danger'})` | `Confirm.confirm({..., danger: true})` |
| `<p-toast>`, `<p-confirmdialog>` | remove (services render themselves) |
| `<button pButton>` primary | `<button mat-flat-button>` |
| `severity="secondary"` / `[outlined]="true"` | `mat-stroked-button` |
| `[text]="true"` / `class="p-button-text"` | `mat-button` |
| `severity="danger"` | add `class="gd-danger"` (any variant) |
| `severity="success"` | add `class="gd-success"` (flat) |
| icon-only button | `<button mat-icon-button aria-label="…"><mat-icon>edit</mat-icon></button>` |
| `<span pButtonIcon class="pi pi-x">` | `<mat-icon>…</mat-icon>` (see icon table) |
| `<span pButtonLabel>Text</span>` | plain `Text` |
| `[loading]="busy()"` | `[disabled]="busy()"` and swap the icon for `<mat-progress-spinner mode="indeterminate" diameter="18" />` while busy |
| `<a pButton routerLink>` | `<a mat-flat-button routerLink>` (or stroked/button) |
| `pInputText`, `pTextarea` | native `<input>` / `<textarea>` with `class="gd-input"` |
| `<p-password>` | `<input type="password" class="gd-input">` + a `mat-icon-button` show/hide toggle (`visibility` / `visibility_off`) |
| `<p-inputnumber>` | `<input type="number" inputmode="numeric" class="gd-input">` (Reactive Forms gives a number) |
| `<p-select>` | native `<select class="gd-input">` with `[ngValue]` options (filter not needed); or `mat-select` in a `mat-form-field` if it reads better |
| `<p-multiselect>` | `<mat-chip-listbox multiple [formControl]>` with `<mat-chip-option [value]>` |
| `<p-toggleswitch>` | `<mat-slide-toggle>` (formControl/ngModel; `(change)` gives `MatSlideToggleChange`) |
| `<p-tag>` | `<gd-tag>` |
| `<p-skeleton>` | `<gd-skeleton>` |
| `<p-message>` | `<gd-message>` (`severity: success/info/warn/error/secondary`) |
| `<p-table>` | semantic `<table>` styled in the component (or `mat-table`); keep the existing ≤640px card layout |
| `<p-paginator [first] [rows] (onPageChange)>` | `<mat-paginator [length] [pageSize] [pageIndex] (page)>` (**pageIndex is 0-based**) |
| `<p-dialog>` | `MatDialog.open(templateRef, { width: '28rem', maxWidth: '94vw' })` with an `<ng-template>` using `mat-dialog-title` / `mat-dialog-content` / `mat-dialog-actions`; keep the ref to close it |
| `<p-drawer position="bottom">` | `MatBottomSheet.open(templateRef)` |
| `<p-rating>` | 5 `mat-icon-button`s (`star` filled via `fontIcon` + `style="font-variation-settings:'FILL' 1"`, or `star_border`), `aria-label="N stars"`, `aria-pressed` |
| `pTooltip` | `matTooltip` |
| CDK drag-drop | unchanged (`@angular/cdk/drag-drop`) |

### Icons (PrimeIcons → Material Symbols)
add `pi-plus`, edit `pi-pencil`, delete `pi-trash`, check `pi-check`, close `pi-times`, save `pi-save`,
send `pi-send`, visibility `pi-eye`, visibility_off `pi-eye-slash`, content_copy `pi-copy`,
open_in_new `pi-external-link`, photo_camera `pi-camera`, photo_library `pi-images`, image `pi-image`,
arrow_back `pi-arrow-left`, arrow_upward `pi-arrow-up`, arrow_downward `pi-arrow-down`,
drag_indicator `pi-bars`, search `pi-search`, refresh `pi-refresh`, print `pi-print`, logout `pi-sign-out`,
home `pi-home`, receipt_long `pi-shopping-bag`/orders, inventory_2 `pi-box`, category `pi-th-large`,
sell `pi-tag`, menu_book `pi-book`, help `pi-question-circle`, reviews `pi-comment`, history `pi-history`,
settings `pi-cog`, more_horiz `pi-ellipsis-h`, info `pi-info-circle`, warning `pi-exclamation-triangle`,
link `pi-link`, format_list_bulleted `pi-list`, format_bold `pi-bold`, title (H2), storefront `pi-shop`,
chat (WhatsApp; or keep an inline SVG), lock `pi-lock`, star / star_border `pi-star`.

## Rules
- No `primeng`, `@primeuix` or `primeicons` imports, no `p-*` elements, `pButton`, `pInputText`,
  `pTextarea`, `pTooltip` or `pi pi-*` classes left in your files (`grep -nE "primeng|primeuix|<p-|pButton|pInputText|pTextarea|pTooltip|pi-" <your files>` must be empty).
- Keep every behaviour: validation messages, unsaved-changes guards, stale-version banners, optimistic
  updates with rollback, keyboard Enter submits, 44px tap targets, layouts at 375px, a11y labels.
- Standalone, OnPush, signals, new control flow, `inject()`. Import Material modules per component
  (`MatButtonModule`, `MatIconModule`, `MatSlideToggleModule`, `MatDialogModule`, `MatPaginatorModule`,
  `MatChipsModule`, `MatTooltipModule`, `MatProgressSpinnerModule`, `MatBottomSheetModule`, `MatMenuModule`).
- Forms: a `<form>` must have `[formGroup]` (ReactiveForms) or use `FormsModule` (NgForm); otherwise use
  `(submit)="$event.preventDefault(); …"`. `(ngSubmit)` on a bare form never fires.
