# Accessibility patterns

Target: WCAG 2.2 AA. Each checklist item is observable in a browser, with the keyboard, an accessibility tree inspector (DevTools → Accessibility) or an automated scan. Prefer native elements and the project's headless primitives over hand-built ARIA widgets.

## Page structure

- [ ] `<html lang="…">` set; `<title>` unique per page or route, most specific part first ("Invoices – Settings – App").
- [ ] Landmarks: one `header`, `nav` (labelled if more than one: `aria-label="Primary"`), one `main`, `footer`; `aside` for complementary panels.
- [ ] Exactly one `h1`; headings nest without skipping levels; visual size comes from tokens, not from the heading level.
- [ ] A skip link is the first focusable element and moves focus to `main`.
- [ ] Reading and focus order follow the visual order; CSS `order`, `row-reverse` and grid placement do not reorder interactive content.

```html
<a class="skip-link" href="#main">Skip to content</a>
<header>…</header>
<main id="main" tabindex="-1">…</main>
```

```css
.skip-link {
  position: absolute;
  inset-inline-start: calc(var(--spacing) * 2);
  inset-block-start: calc(var(--spacing) * 2);
  z-index: var(--z-toast);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
  background: var(--color-surface);
  color: var(--color-fg);
  border-radius: var(--radius-md);
  transform: translateY(-200%);
}
.skip-link:focus { transform: none; }

/* Hidden visually, still read by assistive tech (Tailwind: sr-only) */
.visually-hidden {
  position: absolute !important;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

## Names and images

- [ ] Every button, link, input and custom control has a non-empty accessible name in the accessibility tree.
- [ ] Icon-only buttons: `aria-label="Delete invoice"`; the icon inside gets `aria-hidden="true"`. Tooltip text is not a name.
- [ ] Repeated controls are distinguishable: "Edit" in a list becomes `aria-label="Edit <item name>"` or has visually hidden context.
- [ ] Links say where they go ("View invoice 1042"), never "click here"; links that open a new tab say so.
- [ ] Informative images have `alt` describing their content or purpose; decorative images `alt=""`; inline SVG icons `aria-hidden="true"`, meaningful SVGs `role="img"` + `aria-label`.
- [ ] Toggle buttons use `aria-pressed`; disclosure triggers use `aria-expanded` + `aria-controls`; the current nav item has `aria-current="page"`.

## Forms

- [ ] Every input has a visible `<label for>` (placeholder is never the label); hints and errors are linked with `aria-describedby`.
- [ ] Related radios and checkboxes sit in `<fieldset>` with a `<legend>`.
- [ ] Required fields use `required` and say "required" in text (or mark optional fields instead, consistently).
- [ ] `type`, `inputmode` and `autocomplete` are set (`email`, `tel`, `current-password`, `one-time-code`, `postal-code`, …).
- [ ] Validate on blur and on submit, not on every keystroke; clear an error as soon as the value becomes valid.
- [ ] Invalid fields get `aria-invalid="true"` and a text error that says how to fix it ("Enter a date after 1 Jan 2024"), with an icon, not color alone.
- [ ] On a failed submit: short forms move focus to the first invalid field; long forms render an error summary with links to each field and focus it.
- [ ] Submit buttons stay enabled; validation explains what is missing (disabled submits hide the reason).
- [ ] Server errors keep the user's input.

```tsx
// TextField.tsx
import { useId, type ComponentPropsWithRef } from 'react';

type TextFieldProps = ComponentPropsWithRef<'input'> & { label: string; hint?: string; error?: string };

export function TextField({ label, hint, error, id, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {input.required && <span className="field__required"> (required)</span>}
      </label>
      {hint && <p id={hintId} className="field__hint">{hint}</p>}
      <input {...input} id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
      {error && <p id={errorId} className="field__error">{error}</p>}
    </div>
  );
}
```

```html
<!-- Error summary for long forms: render on failed submit, then call .focus() on it -->
<div class="error-summary" role="alert" tabindex="-1" aria-labelledby="error-summary-title">
  <h2 id="error-summary-title">2 problems need fixing</h2>
  <ul>
    <li><a href="#email">Enter an email address like name@example.com</a></li>
    <li><a href="#start-date">Enter a start date after today</a></li>
  </ul>
</div>
```

```css
.field { display: grid; gap: calc(var(--spacing) * 1.5); }
.field__hint { margin: 0; color: var(--color-fg-muted); font-size: var(--text-sm); }
.field__error { margin: 0; color: var(--color-danger); font-size: var(--text-sm); }
.field input {
  min-block-size: var(--control-md);
  padding-inline: calc(var(--spacing) * 3);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-fg);
  font: inherit;
  font-size: var(--text-base);
}
.field input:focus-visible { outline: var(--focus-ring-width) solid var(--color-focus); outline-offset: var(--focus-ring-offset); }
.field input[aria-invalid="true"] { border-color: var(--color-danger); }
```

## Live regions

Announce changes that happen without a focus move: saved, copied, search results count, background errors.

- [ ] The live region element exists in the DOM **before** the message is inserted (inserting a region with text already inside is often not announced).
- [ ] `role="status"` (polite) for success and progress; `role="alert"` (assertive) only for errors that need immediate attention.
- [ ] Messages are short and complete ("3 results", "Invoice saved"); never announce every keystroke.
- [ ] Toasts: in a live region, stay at least 5 s (or until dismissed), pause on hover and focus, never hold the only copy of an action.

```html
<div id="announcer" class="visually-hidden" role="status"></div>
```

```js
// Re-announce identical messages by clearing first
export function announce(message) {
  const region = document.getElementById('announcer');
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 50);
}
```

## Dialogs

- [ ] Opening moves focus into the dialog (first field, or the least destructive button via `autoFocus`).
- [ ] Focus cannot leave the dialog while open; content behind is inert and does not scroll.
- [ ] `Esc` closes it; a visible close button exists; focus returns to the element that opened it.
- [ ] The dialog is named by its title (`aria-labelledby`) and, if there is a short explanation, described (`aria-describedby`).
- [ ] Destructive confirmations name the object and the consequence ("Delete 3 invoices? This cannot be undone.").

Native `<dialog>` with `showModal()` provides the focus trap, inert background, `Esc` and focus return:

```tsx
// Dialog.tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';

type DialogProps = { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode };

export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose} // fires for Esc, close button and programmatic close
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} // backdrop click
    >
      <div className="dialog__body">
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId}>{description}</p>}
        {children}
        <form method="dialog">
          <button className="btn dialog__close" data-variant="ghost" data-size="sm" aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </form>
      </div>
    </dialog>
  );
}
```

```css
.dialog {
  padding: 0; /* the body fills the box, so a click on the dialog element itself is a backdrop click */
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-fg);
  box-shadow: var(--shadow-lg);
  inline-size: min(calc(100vw - var(--spacing) * 8), 32rem);
}
.dialog::backdrop { background: var(--color-backdrop); }
.dialog__body { position: relative; display: grid; gap: calc(var(--spacing) * 4); padding: calc(var(--spacing) * 6); }
.dialog__body > :is(h2, p) { margin: 0; }
.dialog__body > h2 { padding-inline-end: var(--control-sm); } /* keep the title clear of the close button */
.dialog .dialog__close { position: absolute; inset-block-start: calc(var(--spacing) * 3); inset-inline-end: calc(var(--spacing) * 3); } /* beats .btn's position */
html:has(.dialog[open]) { overflow: hidden; }
```

Non-modal popovers (menus, pickers, tooltips) use the `popover` attribute or the project's primitive; anchor positioning, light dismiss and `Esc` come with them.

## Composite widgets

Use the project's headless primitives; if you must build one, match this keyboard contract exactly:

| Widget | Keys | ARIA essentials |
| --- | --- | --- |
| Disclosure / accordion | `Enter`/`Space` toggles | `button[aria-expanded][aria-controls]` |
| Tabs | `←`/`→` move and select, `Home`/`End`; `Tab` enters the panel | `tablist` > `tab[aria-selected][aria-controls]`, `tabpanel[aria-labelledby]`; roving `tabindex` (0 on the selected tab, −1 on others) |
| Menu button | `Enter`/`Space`/`↓` opens and focuses the first item; `↑`/`↓`; `Esc` closes to the button | `button[aria-haspopup="menu"][aria-expanded]`, `menu` > `menuitem` |
| Combobox / autocomplete | Type filters; `↓`/`↑` move the active option; `Enter` selects; `Esc` clears or closes | `input[role="combobox"][aria-expanded][aria-controls][aria-activedescendant]`, `listbox` > `option[aria-selected]` |
| Radio group | Arrows move and select; `Tab` leaves the group | Native `input type="radio"` in a `fieldset` |
| Switch | `Space` toggles | `button[role="switch"][aria-checked]` or native checkbox |

Navigation menus of links are **not** ARIA menus: use `nav` > `ul` > `a`, with a disclosure button for the mobile toggle.

## Focus management

- [ ] Client-side route change: update `document.title`, move focus to the new page's `h1` (`tabindex="-1"`) or `main`, and restore scroll to the top.
- [ ] After deleting an item, focus the next item (or the previous, or the list heading); never drop focus to `body`.
- [ ] After closing a panel or menu, focus returns to its trigger.
- [ ] Focus is never hidden under sticky headers: `html { scroll-padding-block-start: <header height token>; }`.
- [ ] Content revealed on hover or focus (tooltips) is dismissable with `Esc`, hoverable, and stays until dismissed.

## Motion, color scheme, forced colors

```css
/* Token durations already collapse to 0 under reduced motion (tokens.css).
   Decorative keyframe motion and smooth scrolling run only when the user has not asked for less. */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
  .hero__art { animation: drift var(--duration-slow) var(--ease-in-out) infinite alternate; }
}
@keyframes drift { to { transform: translateY(calc(var(--spacing) * -2)); } }

@media (forced-colors: active) {
  /* Custom-painted controls: restore system colors where backgrounds carried meaning */
  .switch[aria-checked="true"] { background: Highlight; }
  .badge { border: var(--border-width) solid CanvasText; }
}
```

- [ ] With reduced motion emulated, nothing slides, zooms or parallaxes; autoplaying media is paused.
- [ ] Nothing flashes more than 3 times per second.
- [ ] Windows High Contrast (DevTools → Rendering → forced-colors) keeps every control's boundary, state and focus ring visible; transparent borders (as on the Button template) become visible there.

## Tables, charts and data

- [ ] Data tables use `table`, `caption` (visible or visually hidden), `th scope="col"`/`scope="row"`; sortable headers are buttons inside `th` with `aria-sort` on the `th`.
- [ ] Wide tables scroll inside `<div role="region" aria-label="<table caption>" tabindex="0">` so keyboard users can scroll them.
- [ ] Charts have a text summary of the key takeaway and an accessible data table or download; series are distinguishable without color (labels, patterns, markers).
- [ ] Numbers carry units and full context in their accessible text ("Revenue, March: 12 400 USD").

## Size, zoom and spacing

- [ ] Targets ≥ 24 × 24 CSS px, or spaced so a 24 px circle around each does not overlap another.
- [ ] At 200 % browser zoom and at 320 px width, content reflows to one column without horizontal scrolling (data tables, maps and code blocks excepted).
- [ ] With text spacing overridden (line-height 1.5, paragraph spacing 2em, letter-spacing 0.12em, word-spacing 0.16em) nothing is clipped: avoid fixed heights on text containers.
- [ ] Nothing depends on orientation.

## Testing procedure

1. **Automated:** run axe (browser verification reference) on every screen and state; fix every violation. Automated tools catch roughly a third of issues — the rest needs steps 2–4.
2. **Keyboard:** unplug the mouse. `Tab` through each screen: order, visible ring, every action doable, no traps, overlays close with `Esc`.
3. **Accessibility tree:** in DevTools, inspect each custom control: role, name, state (expanded, selected, checked, invalid) are correct and update.
4. **Screen reader smoke test:** VoiceOver (macOS: `Cmd+F5`) or NVDA (Windows). Navigate by headings and landmarks, fill one form with an error, open and close one dialog, trigger one live announcement.
