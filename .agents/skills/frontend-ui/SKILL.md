---
name: frontend-ui
description: Build production-quality, accessible, responsive UI — pages, components, dashboards, forms, settings screens — in whatever stack the project already uses (React, Vue, Svelte, Angular, plain HTML; Tailwind, CSS modules or plain CSS). Produces design tokens (OKLCH color roles with light/dark, type, spacing, radius, shadow, motion), semantic mobile-first markup, components with every interaction and data state, and a real-browser check at three widths. Use when the user asks to build, style, redesign, polish or fix a web page, component, layout, dashboard, form, design system or theme, add dark mode, make something responsive or accessible, or says the UI "looks off", "breaks on mobile" or "fails contrast".
license: MIT
---

# Frontend UI

Deliverables for every piece:

| Output | Role |
| --- | --- |
| Token layer | One source for color roles, type, spacing, radius, shadow, motion. Extend the project's; create `tokens.css` only if none exists |
| Components | Semantic markup, variants mapped to tokens, every state implemented |
| Screens | Mobile-first layout composed from those components, real copy, loading/empty/error data states |
| Verification notes | What was checked in a browser: widths, themes, keyboard, reduced motion, issues fixed |

## Workflow

1. **Detect the stack** with the table below. Read two or three existing components end to end and copy their file layout, naming, prop style and styling approach. NEVER introduce a second styling system, token layer or component library.
2. **Inventory.** List every screen and component the request needs, the data each shows, and the states from the state table. Ask only for what is missing and matters (brand color, content, target devices); otherwise use the defaults in this skill.
3. **Tokens first.** Map needs onto existing tokens and add only missing roles; with no token layer, start from the template below. Check every foreground/background pair you will render against [references/design-tokens.md](references/design-tokens.md).
4. **Structure.** Write the semantic HTML before styling: landmarks, one `h1`, heading outline, native controls, labels.
5. **Layout, mobile-first.** Base styles target the narrowest screen; widen with `min-width` media queries or container queries. Patterns in [references/layout-and-responsive.md](references/layout-and-responsive.md).
6. **Components.** Variants and sizes as props that map to tokens; implement every state below. Reuse headless primitives the project already has for menus, comboboxes, dialogs and tooltips.
7. **Data states.** Loading placeholders at final size, empty states with a next action, errors with a retry.
8. **Accessibility pass** with [references/accessibility.md](references/accessibility.md): names, labels, errors, live regions, focus management.
9. **Verify in a real browser** at 375, 768 and 1280 px, light and dark, reduced motion, keyboard only — procedure and script in [references/browser-verification.md](references/browser-verification.md). Fix, then re-check.
10. **Review** with the checklist at the end.

## Detect the stack

| Look for | It means | Do |
| --- | --- | --- |
| `package.json` deps: `react`, `next`, `vue`, `nuxt`, `svelte`, `@sveltejs/kit`, `astro`, `@angular/core`, `solid-js` | Component framework | Write components in its idiom and file layout |
| CSS entry containing `@import "tailwindcss"` | Tailwind v4 | Tokens go in `@theme static` (template in design-tokens reference) |
| `tailwind.config.{js,ts}` with `theme.extend` | Tailwind v3 | Point `theme.extend` at CSS variables from `tokens.css` |
| `:root { --… }` in global CSS, `tokens.*`, `theme.*` | Existing token layer | Extend it; keep its naming |
| `*.module.css`, `*.scss`, `styled`/`css` imports, `<style scoped>`, Svelte `<style>` | Styling approach | Colocate styles the same way |
| Headless primitive imports (Radix, React Aria, Headless UI, Reka, Bits UI), `components.json` | Primitive library | Wrap it; never hand-roll focus traps or popovers it already provides |
| Storybook, Playwright, Vitest, Testing Library configs | Verification tooling | Add stories/tests where the project already has them |

## Hard rules

- Semantic HTML first: `button` for actions, `a href` for navigation, `label` for inputs, `table` for tabular data, landmarks (`header`, `nav`, `main`, `footer`). ARIA only where no native element exists.
- Every interactive element has an accessible name; icon-only controls get `aria-label`; decorative icons get `aria-hidden="true"`.
- Everything works with the keyboard alone, in visual order; no positive `tabindex`; `Esc` closes overlays and focus returns to the trigger.
- Focus is always visible: `:focus-visible` ring ≥ 2 px with ≥ 3:1 contrast against its surroundings. NEVER `outline: none` without a replacement.
- WCAG AA contrast: 4.5:1 for body text, 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold), icons, input borders and focus rings. Verify with numbers, not by eye.
- Color is never the only signal: errors, selection and status also carry text, an icon or a shape change.
- No layout shift: images and media have `width`/`height` or `aspect-ratio`; loading states reserve final size; web fonts use `font-display: swap` with a metric-matched fallback.
- Respect `prefers-reduced-motion` (no parallax, autoplay or large movement; durations collapse to 0) and `color-scheme` (both themes readable, form controls and scrollbars themed).
- No magic numbers: colors, font sizes, spacing, radii, shadows, durations and z-indices come from tokens. Raw values live only in the token layer.
- Touch targets ≥ 24 × 24 CSS px (aim for 44 on primary mobile actions); text resizes to 200 % and reflows at 320 px width without horizontal scrolling.
- Real, representative content: long names, empty lists, errors, many items. Synthetic data is labelled as such.

## States

Implement each state every component can reach; test each one.

| State | Selector / trigger | Must show |
| --- | --- | --- |
| Hover | `@media (hover: hover)` + `:hover` | Subtle tone shift; never the only affordance |
| Focus | `:focus-visible` | Ring per hard rules, not clipped by `overflow` |
| Active / pressed | `:active`, `aria-pressed="true"` | Pressed tone, distinct from hover |
| Selected / current | `aria-selected`, `aria-current="page"` | Tone plus a non-color marker (weight, bar, check) |
| Disabled | `disabled`, or `aria-disabled="true"` if it must stay focusable | Reduced emphasis, `cursor: not-allowed`, reason nearby when not obvious |
| Loading | Pending request | Spinner or skeleton at final size; label kept for assistive tech; repeat submits blocked |
| Empty | Zero items | What belongs here plus the action that adds it |
| Error | Failed request, invalid input | What happened, how to fix it, a retry; field errors linked by `aria-describedby` |

## Token sheet template

`tokens.css` — the only file with raw values. Names match Tailwind v4 theme namespaces, so components work unchanged in Tailwind and non-Tailwind projects. Every color pair below passes AA; recheck after any change.

```css
:root {
  color-scheme: light dark;

  /* Color roles: light-dark(<light>, <dark>) */
  --color-bg: light-dark(oklch(0.985 0.003 250), oklch(0.17 0.01 250));
  --color-surface: light-dark(oklch(1 0 0), oklch(0.21 0.012 250));
  --color-surface-2: light-dark(oklch(0.955 0.006 250), oklch(0.26 0.014 250));
  --color-surface-3: light-dark(oklch(0.92 0.008 250), oklch(0.3 0.016 250));
  --color-fg: light-dark(oklch(0.21 0.02 250), oklch(0.96 0.005 250));
  --color-fg-muted: light-dark(oklch(0.47 0.02 250), oklch(0.74 0.015 250));
  --color-border: light-dark(oklch(0.9 0.008 250), oklch(0.32 0.012 250));
  --color-border-strong: light-dark(oklch(0.6 0.02 250), oklch(0.56 0.015 250));
  --color-accent: light-dark(oklch(0.5 0.19 260), oklch(0.72 0.15 260));
  --color-accent-hover: light-dark(oklch(0.45 0.19 260), oklch(0.78 0.13 260));
  --color-accent-active: light-dark(oklch(0.41 0.18 260), oklch(0.83 0.11 260));
  --color-accent-fg: light-dark(oklch(0.99 0.005 260), oklch(0.17 0.02 260));
  --color-danger: light-dark(oklch(0.52 0.2 25), oklch(0.7 0.18 25));
  --color-danger-hover: light-dark(oklch(0.47 0.2 25), oklch(0.76 0.16 25));
  --color-danger-active: light-dark(oklch(0.43 0.19 25), oklch(0.81 0.13 25));
  --color-danger-fg: light-dark(oklch(0.99 0.005 25), oklch(0.17 0.02 25));
  --color-success: light-dark(oklch(0.5 0.13 150), oklch(0.75 0.15 150));
  --color-warning: light-dark(oklch(0.5 0.12 70), oklch(0.82 0.14 80));
  --color-focus: light-dark(oklch(0.55 0.2 260), oklch(0.75 0.15 260));
  --color-backdrop: oklch(0.15 0.01 250 / 0.5);

  /* Typography */
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --font-weight-normal: 400; --font-weight-medium: 500; --font-weight-semibold: 600;
  --text-xs: 0.75rem;   --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;    --text-base--line-height: 1.5rem;
  --text-lg: 1.125rem;  --text-lg--line-height: 1.75rem;
  --text-xl: 1.25rem;   --text-xl--line-height: 1.75rem;
  --text-2xl: clamp(1.375rem, 1.2045rem + 0.7273vw, 1.75rem);  --text-2xl--line-height: 1.25;
  --text-3xl: clamp(1.75rem, 1.4091rem + 1.4545vw, 2.5rem); --text-3xl--line-height: 1.15;

  /* Space, size, shape: every gap and padding is calc(var(--spacing) * n) */
  --spacing: 0.25rem;
  --control-sm: 2rem; --control-md: 2.5rem; --control-lg: 3rem;
  --radius-sm: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-full: 9999px;
  --border-width: 1px;
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.06);
  --shadow-md: 0 2px 4px oklch(0 0 0 / 0.06), 0 8px 16px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 4px 8px oklch(0 0 0 / 0.08), 0 16px 40px oklch(0 0 0 / 0.14);

  /* Focus, state, motion, layers */
  --focus-ring-width: 2px; --focus-ring-offset: 2px;
  --opacity-disabled: 0.5;
  --duration-fast: 120ms; --duration-base: 200ms; --duration-slow: 320ms; --duration-spin: 800ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --z-sticky: 10; --z-dropdown: 20; --z-overlay: 30; --z-toast: 40;
}

/* Manual theme override: set data-theme on <html>; absent = follow the OS */
[data-theme="light"] { color-scheme: light; }
[data-theme="dark"] { color-scheme: dark; }

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; --duration-slow: 0ms; }
}
```

- `light-dark()` resolves from `color-scheme`, so one declaration covers OS preference and the manual toggle. Fallback for older browsers: design-tokens reference.
- **Tailwind v4:** the same declarations go inside `@theme static` so utilities (`bg-surface`, `text-fg-muted`, `rounded-md`, `p-4`) are generated from them; full template in [references/design-tokens.md](references/design-tokens.md#tailwind-v4-template).
- Components reference **roles** (`--color-surface`), never ramp steps or raw OKLCH.

## Component template (React)

A button with variants, sizes and a loading state that keeps its width, stays focusable and announces progress. Port the same structure to Vue/Svelte/Angular; the CSS is framework-free.

```tsx
// Button.tsx
import type { ComponentPropsWithRef, ReactNode } from 'react';
import './button.css';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingLabel?: string; // announced while loading
  icon?: ReactNode;      // decorative leading icon
};

export function Button({
  variant = 'primary', size = 'md', loading = false, loadingLabel = 'Loading',
  icon, type = 'button', className, onClick, children, ...rest
}: ButtonProps) {
  return (
    <>
      <button
        {...rest}
        type={type}
        className={className ? `btn ${className}` : 'btn'}
        data-variant={variant}
        data-size={size}
        data-loading={loading || undefined}
        aria-disabled={loading || undefined}
        onClick={(event) => {
          if (loading) return event.preventDefault(); // stays focusable, blocks repeat submits
          onClick?.(event);
        }}
      >
        {icon && <span className="btn__icon" aria-hidden="true">{icon}</span>}
        <span className="btn__label">{children}</span>
        {loading && <span className="btn__spinner" aria-hidden="true" />}
      </button>
      {/* Live region outside the button: button children are not exposed to assistive tech */}
      <span className="visually-hidden" role="status">{loading ? loadingLabel : ''}</span>
    </>
  );
}
```

```css
/* button.css */
.btn {
  --btn-bg: var(--color-accent);
  --btn-bg-hover: var(--color-accent-hover);
  --btn-bg-active: var(--color-accent-active);
  --btn-fg: var(--color-accent-fg);
  --btn-border: transparent; /* stays in the box model; becomes visible in forced-colors mode */
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  gap: calc(var(--spacing) * 2);
  min-block-size: var(--control-md);
  padding-inline: calc(var(--spacing) * 4);
  border: var(--border-width) solid var(--btn-border);
  border-radius: var(--radius-md);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}
.btn[data-variant="secondary"] { --btn-bg: var(--color-surface); --btn-bg-hover: var(--color-surface-2); --btn-bg-active: var(--color-surface-3); --btn-fg: var(--color-fg); --btn-border: var(--color-border-strong); }
.btn[data-variant="ghost"] { --btn-bg: transparent; --btn-bg-hover: var(--color-surface-2); --btn-bg-active: var(--color-surface-3); --btn-fg: var(--color-fg); }
.btn[data-variant="danger"] { --btn-bg: var(--color-danger); --btn-bg-hover: var(--color-danger-hover); --btn-bg-active: var(--color-danger-active); --btn-fg: var(--color-danger-fg); }
.btn[data-size="sm"] { min-block-size: var(--control-sm); padding-inline: calc(var(--spacing) * 3); }
.btn[data-size="lg"] { min-block-size: var(--control-lg); padding-inline: calc(var(--spacing) * 5); font-size: var(--text-base); line-height: var(--text-base--line-height); }

@media (hover: hover) {
  .btn:hover:not(:disabled, [aria-disabled="true"]) { background: var(--btn-bg-hover); }
}
.btn:active:not(:disabled, [aria-disabled="true"]) { background: var(--btn-bg-active); }
.btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-focus); outline-offset: var(--focus-ring-offset); }
.btn:disabled { opacity: var(--opacity-disabled); cursor: not-allowed; }
.btn[data-loading] { cursor: progress; }
.btn[data-loading] > :not(.btn__spinner) { opacity: 0; } /* keeps width and accessible name */

.btn__icon { display: inline-flex; inline-size: 1em; block-size: 1em; }
.btn__spinner {
  position: absolute; inset: 0; margin: auto;
  inline-size: 1em; block-size: 1em;
  border: calc(var(--border-width) * 2) solid currentColor;
  border-inline-end-color: transparent;
  border-radius: var(--radius-full);
  animation: btn-spin var(--duration-spin) linear infinite;
}
@keyframes btn-spin { to { transform: rotate(1turn); } }
```

- `.visually-hidden` is the utility in the accessibility reference (Tailwind: `sr-only`).
- Tailwind projects: keep the component, swap the CSS for utilities (`bg-accent hover:bg-accent-hover focus-visible:outline-2 …`).
- Dialog, form field with errors, live regions and skip link patterns: [references/accessibility.md](references/accessibility.md).

## Review checklist

- [ ] Stack reused: no new styling system, token layer or component library.
- [ ] Searching changed files outside the token layer finds no raw colors (`#hex`, `rgb(`, `hsl(`, `oklch(`) and no literal font sizes, spacing, radii, shadows, durations or z-indices; spacing is `calc(var(--spacing) * n)`.
- [ ] Every rendered text/background pair meets 4.5:1 (3:1 for large text, icons, input borders, focus rings) in light and dark.
- [ ] Keyboard only: every control reachable in visual order, operable with `Enter`/`Space`/arrows as its role expects, focus ring always visible, `Esc` closes overlays and focus returns to the trigger.
- [ ] Each form field has a visible `label`; errors are text, linked with `aria-describedby`, and focus moves to the first invalid field on submit.
- [ ] Hover, focus-visible, active, disabled, loading, empty and error states each seen in the browser.
- [ ] At 375, 768 and 1280 px: no horizontal scrollbar, no clipped or overlapping text, touch targets ≥ 24 px; at 320 px and 200 % zoom content still reflows.
- [ ] No layout shift while loading data, images or fonts (CLS ≈ 0 in the verification script).
- [ ] Reduced motion emulated: no large movement; dark scheme emulated: every surface readable.
- [ ] Automated accessibility scan (axe or the project's tool) reports no violations on each screen.
- [ ] Browser console clean: no errors or framework warnings (keys, hydration, act).
