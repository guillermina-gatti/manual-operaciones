# Layout and responsive design

Mobile-first: base styles are the narrow layout; `min-width` media queries and container queries add columns as space appears. Let content decide breakpoints — widen the window until the layout looks wrong, then add one there.

## Layout tokens

Add these to the token layer when layouts need them:

```css
:root {
  --container-page: 80rem;  /* app and site max width */
  --container-prose: 42rem; /* articles, forms, settings columns */
  --sidebar-width: 16rem;
  --card-min: 16rem;        /* smallest card before the grid drops a column */
  --header-height: 3.5rem;
}
```

| Breakpoint | `min-width` | Typical change |
| --- | --- | --- |
| sm | 40rem (640 px) | Two-column forms, inline filters |
| md | 48rem (768 px) | Side-by-side cards, visible secondary nav |
| lg | 64rem (1024 px) | Persistent sidebar, multi-column dashboards |
| xl | 80rem (1280 px) | Extra columns, detail panels |

- These match Tailwind v4 defaults (`sm:` … `xl:`). Custom properties cannot be used inside `@media`, so plain CSS writes the `rem` value; keep the table as the source.
- Use `rem` in media queries so they scale with the user's font size.
- Prefer container queries for components; media queries for page-level structure.

## Base

```css
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-block-size: 100dvh;
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--text-base--line-height);
}
img, svg, video, canvas { display: block; max-inline-size: 100%; block-size: auto; }
input, button, textarea, select { font: inherit; }
p, li, h1, h2, h3 { overflow-wrap: break-word; }
h1, h2, h3 { text-wrap: balance; }
html { scroll-padding-block-start: calc(var(--header-height) + var(--spacing) * 4); }
```

- `100dvh` follows mobile browser toolbars; `100vh` overflows behind them.
- Use logical properties (`margin-inline`, `padding-block`, `inset-inline-start`, `inline-size`) so right-to-left languages work without overrides.

## Layout primitives

Compose screens from a few primitives instead of one-off positioning.

```css
/* Center: bounded, centered column with gutters */
.center {
  inline-size: 100%;
  max-inline-size: var(--container-page);
  margin-inline: auto;
  padding-inline: calc(var(--spacing) * 4);
}
@media (min-width: 48rem) { .center { padding-inline: calc(var(--spacing) * 8); } }

/* Stack: vertical rhythm */
.stack { display: flex; flex-direction: column; gap: calc(var(--spacing) * 4); }

/* Cluster: wrapping row of tags, buttons, filters */
.cluster { display: flex; flex-wrap: wrap; align-items: center; gap: calc(var(--spacing) * 2); }

/* Split: title left, actions right; wraps on narrow screens */
.split { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: calc(var(--spacing) * 3); }

/* Auto grid: as many columns as fit, no media query */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--card-min)), 1fr));
  gap: calc(var(--spacing) * 6);
}

/* Sidebar: side-by-side when there is room, stacked otherwise, no media query */
.with-sidebar { display: flex; flex-wrap: wrap; gap: calc(var(--spacing) * 6); }
.with-sidebar > :first-child { flex-basis: var(--sidebar-width); flex-grow: 1; }
.with-sidebar > :last-child { flex-basis: 0; flex-grow: 999; min-inline-size: 60%; }
```

| Primitive | Tailwind v4 equivalent |
| --- | --- |
| Center | `mx-auto w-full max-w-(--container-page) px-4 md:px-8` |
| Stack | `flex flex-col gap-4` |
| Cluster | `flex flex-wrap items-center gap-2` |
| Split | `flex flex-wrap items-center justify-between gap-3` |
| Auto grid | `grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--card-min)),1fr))] gap-6` |
| Sidebar | `grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] gap-6` |

## App shell

Header on top, sidebar navigation from `lg`, content column that never overflows:

```css
.app {
  display: grid;
  grid-template-areas: "header" "main";
  grid-template-rows: auto 1fr;
  min-block-size: 100dvh;
}
.app__header {
  grid-area: header;
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-sticky);
  min-block-size: var(--header-height);
  background: var(--color-surface);
  border-block-end: var(--border-width) solid var(--color-border);
}
.app__sidebar { display: none; }
.app__main { grid-area: main; min-inline-size: 0; padding: calc(var(--spacing) * 4); }

@media (min-width: 64rem) {
  .app {
    grid-template-areas: "header header" "sidebar main";
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
  .app__sidebar {
    display: block;
    grid-area: sidebar;
    position: sticky;
    inset-block-start: var(--header-height);
    block-size: calc(100dvh - var(--header-height));
    overflow-y: auto;
    border-inline-end: var(--border-width) solid var(--color-border);
  }
  .app__main { padding: calc(var(--spacing) * 8); }
}
```

Below `lg`, the same navigation links live in the header behind a disclosure button (`aria-expanded`) or in a drawer built on `<dialog>`.

## Container queries

A component adapts to the space it is given, so the same card works in a sidebar, a grid cell and a full-width column.

```css
/* The card measures its own width; its inner layout responds */
.card { container: card / inline-size; }

.card__body { display: grid; gap: calc(var(--spacing) * 3); padding: calc(var(--spacing) * 4); }
.card__media { aspect-ratio: 16 / 9; border-radius: var(--radius-md); object-fit: cover; }

@container card (min-width: 36rem) {
  .card__body { grid-template-columns: 12rem minmax(0, 1fr); align-items: start; }
}
```

- A container cannot restyle itself from its own query: put `container` on the outer element, style its descendants.
- Put the container on the element whose width matters. A container on the whole list measures the list, so every card switches layout at once even when each cell is narrow.
- `cqi` units size things relative to the container: `font-size: clamp(var(--text-base), 4cqi, var(--text-xl))`.
- Tailwind v4: `@container` on the card, `@xl:grid-cols-[12rem_minmax(0,1fr)]` on its body (`@xl` = 36rem).

## Fluid type and space

`clamp(min, preferred, max)` scales smoothly between two viewport widths. The preferred value must include a `rem` term so browser zoom and font-size settings still work, and max ÷ min must stay ≤ 2.5 so 200 % zoom still enlarges text.

Formula for `min` px at viewport `vMin` px growing to `max` px at `vMax` px:

- slope = (max − min) ÷ (vMax − vMin)
- preferred = (min − slope × vMin) ÷ 16 `rem` + slope × 100 `vw`

```js
// fluid.js — fluid(28, 40) → "clamp(1.75rem, 1.4091rem + 1.4545vw, 2.5rem)"
export function fluid(minPx, maxPx, vMin = 375, vMax = 1200) {
  const slope = (maxPx - minPx) / (vMax - vMin);
  const intercept = (minPx - slope * vMin) / 16;
  const r = (n) => Number(n.toFixed(4));
  return `clamp(${r(minPx / 16)}rem, ${r(intercept)}rem + ${r(slope * 100)}vw, ${r(maxPx / 16)}rem)`;
}
```

- Fluid sizes only for display text (`--text-2xl` and up) and section spacing; body and UI text stay fixed.
- Fluid section spacing: `--space-section: clamp(3rem, 2rem + 4vw, 6rem)`; use it for `padding-block` between page sections.

## Overflow and content resilience

- Flex and grid children default to `min-width: auto` and refuse to shrink below their content: add `min-inline-size: 0` (or `minmax(0, 1fr)` tracks) wherever text or tables live.
- User-generated strings (names, URLs, IDs): `overflow-wrap: anywhere`; single-line truncation needs the full value in a `title` or on focus.
- Multi-line truncation: `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;` — only where a detail view shows the rest.
- Never fix the height of anything containing text; use `min-block-size`.
- Test with the longest realistic strings, translated text (roughly 30 % longer), 0 items, 1 item and many items.

## Tables and dashboards

- Wide tables: wrap in a scroll region (`overflow-x: auto`, `role="region"`, `aria-label`, `tabindex="0"`) and keep the first column sticky (`position: sticky; inset-inline-start: 0; background: var(--color-surface)`).
- On narrow screens either keep the scroll region or turn each row into a card listing label–value pairs (`dl`); choose one per table, never hide columns silently.
- Numeric columns: right-aligned, `tabular-nums`, units in the header.
- Dashboards: KPI cards in an auto grid; charts with a fixed `aspect-ratio` (or fixed height token) so they reserve space before data loads; filters in a cluster above, collapsing into a disclosure below `md`.

## No layout shift

- `img` and `video` carry `width` and `height` attributes (or `aspect-ratio` in CSS); `object-fit: cover` for crops.
- Skeletons and spinners occupy the final size of the content they replace.
- Late content (banners, cookie notices, toasts) overlays or reserves space; never pushes the page down after load.
- Web fonts: `font-display: swap` plus a fallback `@font-face` with `size-adjust`/`ascent-override` matched to the web font; or use the system stack.
- Scrollbar appearance must not shift centered layouts: `html { scrollbar-gutter: stable; }`.

## Widths to verify

| Width | Represents | Look for |
| --- | --- | --- |
| 375 px | Small phone | One column, no horizontal scroll, tap targets, header fits, text not cramped |
| 768 px | Tablet portrait, split-screen laptop | The in-between layout: awkward single columns stretched wide, two-column forms |
| 1280 px | Laptop | Sidebar and multi-column layouts, line length ≤ 65ch, nothing stretched edge to edge |

Also spot-check 320 px (reflow requirement) and ≥ 1920 px (max widths hold). Procedure: [browser-verification.md](browser-verification.md).
