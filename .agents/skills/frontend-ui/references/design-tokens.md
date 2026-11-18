# Design tokens

Tokens are the only place raw values live. Components consume **roles**, roles point at values, and a theme swaps values without touching components.

## Tiers

| Tier | Example | Who uses it |
| --- | --- | --- |
| Primitive (optional ramp) | `--blue-500: oklch(0.55 0.19 260)` | Only the role tier |
| Role (semantic) | `--color-accent`, `--color-fg-muted`, `--radius-md` | Components and layouts |
| Component (optional) | `--btn-bg: var(--color-accent)` | One component's variants |

- Small projects skip primitives and write OKLCH directly in roles (as in the SKILL template).
- Name roles by job, not by look: `--color-danger`, not `--color-red`; `--color-surface-2`, not `--color-gray-100`.
- A new role needs a second real use. One-off values become a component-tier variable pointing at an existing role.

## Color in OKLCH

`oklch(L C H)` — **L** lightness 0–1 (perceptually even, unlike HSL), **C** chroma 0–~0.37 (saturation), **H** hue angle 0–360.

- Equal L steps look like equal lightness steps across hues, so ramps and dark themes are predictable.
- Keep H fixed within a family; step L for the ramp; lower C near L = 0 and L = 1 (very light and very dark colors cannot hold high chroma and clip).
- Tint neutrals with the accent hue at C 0.003–0.02 so grays do not look dead next to the accent.
- Stay inside sRGB for text and UI colors: roughly C ≤ 0.2 at mid lightness. Browsers gamut-map anything outside, which shifts hue unpredictably.
- Alpha: `oklch(0 0 0 / 0.5)`.
- Brand color given as hex: convert once (`oklch(from #3b5bdb l c h)` in DevTools shows the value), keep the hue, then move L until every pair in the contrast table passes. The exact brand hex belongs to the logo, not to text or buttons.

### Ramp template

For a primitive ramp, hold H, use these L values, and scale C down toward the ends:

| Step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L | 0.97 | 0.93 | 0.87 | 0.79 | 0.7 | 0.6 | 0.52 | 0.45 | 0.37 | 0.28 | 0.2 |
| C × peak | 0.15 | 0.3 | 0.5 | 0.75 | 0.95 | 1 | 1 | 0.9 | 0.75 | 0.55 | 0.4 |

Starting points for 4.5:1 text: L ≤ ~0.55 on white or near-white backgrounds (steps 600+), L ≥ ~0.7 on near-black backgrounds (steps 400 and lighter). Confirm every pair with the script below.

## Color roles

| Role | Use | Must contrast with | Minimum |
| --- | --- | --- | --- |
| `--color-bg` | Page background | — | — |
| `--color-surface`, `-2`, `-3` | Cards, inputs; raised or hovered; pressed or selected | — | — |
| `--color-fg` | Body text, headings | bg, every surface | 4.5:1 |
| `--color-fg-muted` | Secondary text, hints, placeholders | bg, every surface | 4.5:1 |
| `--color-border` | Decorative dividers, card outlines | — (decorative) | — |
| `--color-border-strong` | Input, checkbox and secondary-button borders | bg, surface | 3:1 |
| `--color-accent` | Primary buttons, links, selected indicators | bg (as link text or indicator) | 4.5:1 text, 3:1 UI |
| `--color-accent-hover`, `-active` | Pressed tones of the accent | accent-fg | 4.5:1 |
| `--color-accent-fg` | Text and icons on accent | accent, accent-hover, accent-active | 4.5:1 |
| `--color-danger` (+ `-hover`, `-active`, `-fg`) | Destructive actions, error text and icons | bg; danger-fg on danger | 4.5:1 |
| `--color-success`, `--color-warning` | Status text and icons | bg, surface | 4.5:1 |
| `--color-focus` | Focus ring | bg and every surface it can sit on | 3:1 |
| `--color-backdrop` | Modal overlay behind dialogs and drawers | — | — |

Status colors are for text and icons. For tinted status backgrounds, add `--color-danger-subtle` etc. and check `--color-fg` on them.

## Checking contrast

Check every pair the UI actually renders, in both themes, whenever a color changes. WCAG 2 contrast is computed in sRGB; this converts OKLCH first:

```js
// contrast.js — node contrast.js / bun contrast.js
function oklchToLinearSrgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const clip = (v) => Math.min(1, Math.max(0, v));
  return [
    clip(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
const luminance = (c) => { const [r, g, b] = oklchToLinearSrgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// [name, fg [L, C, H], bg [L, C, H], minimum]
const pairs = [
  ['light fg-muted on surface-2', [0.47, 0.02, 250], [0.955, 0.006, 250], 4.5],
  ['light accent-fg on accent', [0.99, 0.005, 260], [0.5, 0.19, 260], 4.5],
  ['dark border-strong on surface', [0.56, 0.015, 250], [0.21, 0.012, 250], 3],
];
for (const [name, fg, bg, min] of pairs) {
  const r = contrast(fg, bg);
  console.log(`${r >= min ? 'PASS' : 'FAIL'} ${r}:1 ${name} (needs ${min}:1)`);
}
```

- Semi-transparent colors: check the composited result against the surface below.
- Text on images or gradients: check against the lightest and darkest region, or add a scrim.
- Browser DevTools color picker shows the ratio and AA/AAA lines for any rendered text; use it to spot-check the running page.

## Dark theme

- Design it, do not invert it: dark `bg` around L 0.15–0.2 (not pure black), `fg` around L 0.94–0.97 (not pure white).
- Elevation reads as **lighter surfaces** (`surface` < `surface-2` < `surface-3`), not shadows; shadows barely show on dark.
- Accents get lighter and slightly less chromatic (L +0.15–0.25, C −0.03) so they pass on dark and do not glow.
- Filled buttons in dark usually flip to dark text on a light accent (`--color-accent-fg` dark).
- `color-scheme` themes native controls, scrollbars and `Canvas`/`CanvasText`; set it, and never hard-code `background: white` anywhere.
- Images and illustrations: provide dark variants with `<picture><source media="(prefers-color-scheme: dark)">` or lower their brightness slightly with a token-driven filter.

### Theme toggle

Store the choice (`light` | `dark` | `system`); for `system` remove the attribute. Apply it before first paint with a tiny inline script in `<head>` so there is no flash:

```html
<script>
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) {}
</script>
```

### `light-dark()` fallback

`light-dark()` is Baseline since 2024. If the project supports older browsers, keep the plain values in `:root` and override them instead:

```css
:root { --color-bg: oklch(0.985 0.003 250); --color-fg: oklch(0.21 0.02 250); }
[data-theme="dark"] { --color-bg: oklch(0.17 0.01 250); --color-fg: oklch(0.96 0.005 250); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --color-bg: oklch(0.17 0.01 250); --color-fg: oklch(0.96 0.005 250); }
}
```

## Typography

| Token | rem | px | Line height | Use |
| --- | --- | --- | --- | --- |
| `--text-xs` | 0.75 | 12 | 1rem | Badges, captions (never body copy) |
| `--text-sm` | 0.875 | 14 | 1.25rem | Dense UI, tables, buttons |
| `--text-base` | 1 | 16 | 1.5rem | Body, inputs (≥ 16 px stops iOS zoom-on-focus) |
| `--text-lg` | 1.125 | 18 | 1.75rem | Lead paragraphs, card titles |
| `--text-xl` | 1.25 | 20 | 1.75rem | Section titles |
| `--text-2xl` | fluid 1.375 → 1.75 | 22 → 28 | 1.25 | Page titles in apps |
| `--text-3xl` | fluid 1.75 → 2.5 | 28 → 40 | 1.15 | Marketing headlines |

- Sizes in `rem` so user font-size settings apply. Fluid sizes use `clamp()` with a `rem` term (formula in the layout reference).
- One or two families: system stack for apps; a web font only when it adds identity, loaded with `font-display: swap` and a metric-matched fallback (`size-adjust`, `ascent-override`).
- Weights: 400 body, 500 UI labels, 600 headings. Two or three weights total.
- Measure: body text `max-inline-size: 65ch`.
- Numbers in tables and counters: `font-variant-numeric: tabular-nums`.
- Headings: `text-wrap: balance`; paragraphs: `text-wrap: pretty`.

## Spacing, size, radius, border, shadow

- **Spacing:** one base `--spacing: 0.25rem`; every gap, padding and margin is `calc(var(--spacing) * n)` with n from 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24. Tailwind v4 `p-4`, `gap-6` compute the same way.
- **Rhythm:** related items closer than unrelated ones — inside a group n = 1–3, between groups n = 4–6, between sections n = 10–16.
- **Controls:** `--control-sm/md/lg` (32/40/48 px) keep buttons, inputs and selects in one row the same height.
- **Radius:** `sm` for inputs and chips, `md` for buttons and cards, `lg` for dialogs and large panels, `full` for pills and avatars. Nested radius = outer radius − padding.
- **Border:** `--border-width: 1px`; thicker strokes are multiples of it.
- **Shadow:** `sm` for inputs and resting cards, `md` for dropdowns and popovers, `lg` for dialogs. Low-alpha, two layers (contact + ambient). In dark mode rely on surface lightness.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| `--duration-fast` | 120ms | Hover, press, color changes |
| `--duration-base` | 200ms | Dropdowns, tooltips, small moves |
| `--duration-slow` | 320ms | Dialogs, drawers, page-level transitions |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Entering and responding |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Moving between two on-screen positions |

- Animate `transform` and `opacity` only; never `width`, `height`, `top` or `left`.
- Reduced motion sets the durations to 0 (SKILL template). Replace movement with a fade or nothing; keep essential progress indicators, slowed.

## Layers

`--z-sticky` (10) < `--z-dropdown` (20) < `--z-overlay` (30) < `--z-toast` (40). Native `<dialog>` and the `popover` attribute render in the top layer and need no z-index at all.

## Tailwind v4 template

Put the same values inside `@theme static` so Tailwind generates utilities from them (`bg-surface-2`, `text-fg-muted`, `border-border-strong`, `rounded-md`, `shadow-md`, `ease-out`, `p-4`). Tokens outside Tailwind's namespaces stay in `:root`.

```css
/* app.css */
@import "tailwindcss";

@theme static { /* static: emit every token, even ones only plain CSS files use */
  --color-*: initial; /* drop the default palette: only roles exist, so off-system colors fail to build */
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

  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --font-weight-normal: 400; --font-weight-medium: 500; --font-weight-semibold: 600;
  --text-*: initial;
  --text-xs: 0.75rem;   --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;    --text-base--line-height: 1.5rem;
  --text-lg: 1.125rem;  --text-lg--line-height: 1.75rem;
  --text-xl: 1.25rem;   --text-xl--line-height: 1.75rem;
  --text-2xl: clamp(1.375rem, 1.2045rem + 0.7273vw, 1.75rem);  --text-2xl--line-height: 1.25;
  --text-3xl: clamp(1.75rem, 1.4091rem + 1.4545vw, 2.5rem); --text-3xl--line-height: 1.15;

  --spacing: 0.25rem;
  --radius-sm: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-full: 9999px;
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.06);
  --shadow-md: 0 2px 4px oklch(0 0 0 / 0.06), 0 8px 16px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 4px 8px oklch(0 0 0 / 0.08), 0 16px 40px oklch(0 0 0 / 0.14);
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --default-transition-duration: 120ms;
}

:root {
  color-scheme: light dark;
  --control-sm: 2rem; --control-md: 2.5rem; --control-lg: 3rem;
  --border-width: 1px;
  --focus-ring-width: 2px; --focus-ring-offset: 2px;
  --opacity-disabled: 0.5;
  --duration-fast: 120ms; --duration-base: 200ms; --duration-slow: 320ms; --duration-spin: 800ms;
  --z-sticky: 10; --z-dropdown: 20; --z-overlay: 30; --z-toast: 40;
}
[data-theme="light"] { color-scheme: light; }
[data-theme="dark"] { color-scheme: dark; }

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; --duration-slow: 0ms; --default-transition-duration: 0ms; }
}
```

- Without `static`, Tailwind prunes theme variables no utility uses, and component CSS that reads them through `var()` breaks.
- `transparent`, `current`, `inherit` utilities survive `--color-*: initial`; `bg-white`/`text-black` do not — use roles.
- Because roles switch through `light-dark()`, `dark:` variants are rarely needed. If they are and the app has a manual toggle, always resolve `data-theme` on `<html>` (the inline script plus a `prefers-color-scheme` check) and add `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` — the default `dark:` follows only the OS setting.
- Tailwind v3: keep `tokens.css` and map it in `tailwind.config`: `theme.extend.colors = { bg: 'var(--color-bg)', surface: 'var(--color-surface)', … }`, same for `borderRadius`, `boxShadow`, `fontSize`.

## Other stacks

- **CSS modules / plain CSS / Vue `<style scoped>` / Svelte `<style>`:** import `tokens.css` once globally; components use `var(--…)`.
- **CSS-in-JS:** export a typed object of `var()` references (`export const color = { fg: 'var(--color-fg)' } as const`) so themes still switch through CSS, without re-rendering.
- **Sass:** never store themeable values in `$variables` (compile-time, cannot switch themes); Sass may alias custom properties.
- **Existing design system or component library:** map its theme API to these roles once; never override its internals component by component.
