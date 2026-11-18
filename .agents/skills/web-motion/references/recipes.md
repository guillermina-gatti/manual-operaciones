# Component recipes

All recipes use the token sheet from `SKILL.md` (`--dur-*`, `--ease-*`, `--shift-*`, `--scale-from`, `--stagger*`). Under reduced motion those tokens already zero out travel and zoom, so most recipes fall back to a crossfade with no extra code; each recipe states its reduced behavior explicitly.

JS recipes import this helper:

```js
// motion-prefs.js
const query = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => query.matches;
```

## Buttons and press feedback

```css
.btn {
  transition:
    transform var(--dur-micro) var(--ease-out),
    background-color var(--dur-micro) var(--ease-out),
    color var(--dur-micro) var(--ease-out);
}
@media (hover: hover) {
  .btn:hover { background-color: var(--btn-bg-hover); }
}
.btn:active {
  transform: scale(0.97);
  transition-duration: var(--dur-micro-exit);
}
.btn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; } /* never animated */

@media (prefers-reduced-motion: reduce) {
  .btn:active { transform: none; }
}
```

- Hover effects behind `(hover: hover)` so touch devices do not get stuck hover states.
- Loading state: keep the button's width fixed (`min-inline-size` from the idle label), swap the label for a spinner, set `aria-busy="true"`; never disable it in a way that loses focus.
- Toggle/switch knob: `transform: translateX(...)` with `--ease-spring` (the one overshoot allowed).
- **Reduced motion:** color and background changes stay; no scale, no knob overshoot (the spring token becomes ease-out).

## Menus and popovers

Use the native `popover` attribute (or `<dialog>`) so enter and exit animate across `display` changes:

```html
<button type="button" popovertarget="actions-menu">Actions</button>
<div id="actions-menu" class="menu" popover role="menu">…</div>
```

```css
.menu {
  opacity: 0;
  transform: translateY(calc(var(--shift-sm) * -1)) scale(var(--scale-from));
  transform-origin: top left; /* grow from the trigger side */
  transition:
    opacity var(--dur-ui-exit) var(--ease-in),
    transform var(--dur-ui-exit) var(--ease-in),
    overlay var(--dur-ui-exit) allow-discrete,
    display var(--dur-ui-exit) allow-discrete;
}
.menu:popover-open {
  opacity: 1;
  transform: none;
  transition-duration: var(--dur-ui);
  transition-timing-function: var(--ease-out);
}
@starting-style {
  .menu:popover-open {
    opacity: 0;
    transform: translateY(calc(var(--shift-sm) * -1)) scale(var(--scale-from));
  }
}
```

- `@starting-style` defines where the enter starts; the closed rule defines the exit. Browsers without `@starting-style`/`allow-discrete` open and close instantly, which is acceptable.
- Set `transform-origin` toward the trigger (top right for right-aligned menus, bottom for upward menus).
- Submenus and hover-opened menus: open after ~100 ms hover intent, close after ~300 ms grace, no animation on the switch between sibling submenus.
- **Reduced motion:** opacity fade only (shift and scale tokens are 0/1).

## Modals and drawers

```css
dialog.modal {
  opacity: 0;
  transform: translateY(var(--shift-lg)) scale(var(--scale-from));
  transition:
    opacity var(--dur-large-exit) var(--ease-in),
    transform var(--dur-large-exit) var(--ease-in),
    overlay var(--dur-large-exit) allow-discrete,
    display var(--dur-large-exit) allow-discrete;
}
dialog.modal[open] {
  opacity: 1;
  transform: none;
  transition-duration: var(--dur-large);
  transition-timing-function: var(--ease-out);
}
@starting-style {
  dialog.modal[open] { opacity: 0; transform: translateY(var(--shift-lg)) scale(var(--scale-from)); }
}

dialog.modal::backdrop {
  background-color: rgb(0 0 0 / 0);
  transition:
    background-color var(--dur-large-exit) var(--ease-in),
    overlay var(--dur-large-exit) allow-discrete,
    display var(--dur-large-exit) allow-discrete;
}
dialog.modal[open]::backdrop {
  background-color: rgb(0 0 0 / 0.5);
  transition-duration: var(--dur-large);
}
@starting-style {
  dialog.modal[open]::backdrop { background-color: rgb(0 0 0 / 0); }
}

/* Side drawer: <dialog class="modal drawer">, travels the full edge instead of a small shift */
dialog.drawer { margin-block: 0; margin-inline: auto 0; block-size: 100dvh; max-block-size: none; }
@media (prefers-reduced-motion: no-preference) {
  dialog.drawer:not([open]) { transform: translateX(100%); }
  @starting-style { dialog.drawer[open] { transform: translateX(100%); } }
}
```

```js
const dialog = document.querySelector('dialog.modal');
document.querySelector('[data-open-modal]').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // backdrop click
```

- `showModal()` handles focus trapping, `Esc` and inertness; the animation must not delay any of them.
- Return focus to the trigger on close (native `<dialog>` does this).
- Drawers slide the full distance (`translateX(100%)`) at `--dur-large`; that travel is why the variant is wrapped in `no-preference`.
- **Reduced motion:** modal and backdrop fade over ~200 ms; drawer appears in place with a fade, no slide.

## Toasts

```html
<div class="toast-region" role="status" aria-live="polite"></div>
```

```css
.toast-region {
  position: fixed; inset-block-end: 16px; inset-inline-end: 16px;
  display: grid; gap: 8px; justify-items: end;
}
.toast {
  transition: opacity var(--dur-ui) var(--ease-out), transform var(--dur-ui) var(--ease-out);
}
@starting-style {
  .toast { opacity: 0; transform: translateY(var(--shift-md)); }
}
```

```js
import { prefersReducedMotion } from './motion-prefs.js';

const EXIT_MS = 170; // --dur-ui-exit
const EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';

export function showToast(region, message, { timeout = 5000 } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  region.append(toast); // @starting-style animates the insertion

  let timer = setTimeout(dismiss, timeout);
  const pause = () => clearTimeout(timer);
  const resume = () => { clearTimeout(timer); timer = setTimeout(dismiss, timeout); };
  toast.addEventListener('pointerenter', pause);
  toast.addEventListener('pointerleave', resume);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('focusout', resume);

  let dismissed = false;
  async function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    const moving = !prefersReducedMotion();
    const anim = toast.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: moving ? 'translateX(24px)' : 'none' },
      ],
      { duration: EXIT_MS, easing: EASE_IN, fill: 'forwards' },
    );
    await anim.finished.catch(() => {});
    toast.remove();
  }
  return dismiss;
}
```

- Auto-dismiss pauses on hover and focus; errors and toasts with actions do not auto-dismiss.
- Cap visible toasts (3); older ones exit when a new one arrives. Smooth the stack collapse with the FLIP recipe below.
- **Reduced motion:** enter and exit are opacity fades; the stack re-flows instantly.

## Accordions and disclosure

Native `<details>` with progressive size animation:

```css
:root { interpolate-size: allow-keywords; } /* enables animating to/from `auto` where supported */

details::details-content {
  block-size: 0;
  overflow: clip;
  transition:
    block-size var(--dur-ui) var(--ease-in-out),
    content-visibility var(--dur-ui) allow-discrete;
}
details[open]::details-content { block-size: auto; }

summary .chevron { transition: transform var(--dur-ui) var(--ease-in-out); }
details[open] summary .chevron { transform: rotate(180deg); }

@media (prefers-reduced-motion: reduce) {
  details::details-content, summary .chevron { transition: none; }
}
```

Custom disclosure (button + region) with the grid-rows technique, supported everywhere:

```css
.disclosure-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-ui) var(--ease-in-out);
}
.disclosure-panel[data-open="true"] { grid-template-rows: 1fr; }
.disclosure-panel > .inner {
  overflow: hidden;
  min-block-size: 0;
  transition: visibility var(--dur-ui); /* stays visible until the collapse ends */
}
.disclosure-panel[data-open="false"] > .inner { visibility: hidden; } /* keeps closed content out of the tab order */

@media (prefers-reduced-motion: reduce) {
  .disclosure-panel, .disclosure-panel > .inner { transition: none; }
}
```

- Both animate layout: acceptable as a one-shot on a small subtree. For long panels (taller than ~400 px) or many panels opening at once, skip the height animation and fade the content in instead.
- Toggle `aria-expanded` on the button in the same tick as `data-open`; never wait for the animation.
- Browsers without `interpolate-size`/`::details-content` open instantly.
- **Reduced motion:** instant open/close; the chevron flips without rotating.

## Staggered entrance

```css
@media (prefers-reduced-motion: no-preference) {
  .stagger > * {
    animation: rise var(--dur-ui) var(--ease-out) both;
    animation-delay: min(calc(var(--i, 0) * var(--stagger)), var(--stagger-max));
  }
}
@keyframes rise {
  from { opacity: 0; transform: translateY(var(--shift-md)); }
}
```

```html
<ul class="stagger">
  <li style="--i: 0">…</li>
  <li style="--i: 1">…</li>
  <li style="--i: 2">…</li>
</ul>
```

- `min()` enforces the cap: with 40 ms steps, item 8 onward all start at 300 ms.
- Only the first screenful staggers; items loaded later (pagination, infinite scroll) enter together.
- **Reduced motion:** no animation; items render in place.

## List reorder, insert and remove (FLIP)

Measure, mutate, then animate each element from its old position to the new one:

```js
import { prefersReducedMotion } from './motion-prefs.js';

const MOVE_MS = 240; // --dur-ui
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';

export function flip(container, mutate) {
  const before = new Map([...container.children].map((el) => [el, el.getBoundingClientRect()]));
  mutate(); // reorder, insert or remove children synchronously
  if (prefersReducedMotion()) return;

  const moves = [];
  for (const el of container.children) {
    const a = before.get(el);
    if (!a) continue; // newly inserted: let its own enter animation run
    const b = el.getBoundingClientRect(); // reads only; writes happen below
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) moves.push([el, dx, dy]);
  }
  for (const [el, dx, dy] of moves) {
    el.getAnimations().forEach((anim) => anim.cancel()); // interrupt a running move
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: MOVE_MS, easing: EASE_IN_OUT },
    );
  }
}

// usage: flip(listEl, () => listEl.append(...sortedNodes));
```

- All reads happen before all writes, so the whole reorder costs one layout.
- Canceling mid-flight snaps an item to its latest start before measuring; for rapid reorders, prefer Motion `layout` (React) or a View Transition with a unique `view-transition-name` per item, which interpolate from the current visual position.
- Drag-to-reorder: the dragged item follows the pointer 1:1 with `transform` (no easing); only the siblings use FLIP.
- **Reduced motion:** items jump to their new positions; inserted and removed items fade.

## Skeletons and loading states

```css
.skeleton {
  position: relative;
  overflow: hidden;
  background-color: var(--skeleton-bg);
  border-radius: 4px;
}
.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.4), transparent);
}
@media (prefers-reduced-motion: no-preference) {
  .skeleton::after { animation: shimmer 1.4s linear infinite; }
}
@keyframes shimmer {
  to { transform: translateX(100%); }
}

.loaded-content { animation: fade-in var(--dur-ui) var(--ease-out) both; }
@keyframes fade-in { from { opacity: 0; } }
```

```js
// Show the loading UI only if waiting is noticeable, and never flash it.
export async function withLoading(promise, { show, hide, delay = 300, minVisible = 300 }) {
  let shownAt = 0;
  const timer = setTimeout(() => { shownAt = performance.now(); show(); }, delay);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
    if (shownAt) {
      const left = minVisible - (performance.now() - shownAt);
      if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
      hide();
    }
  }
}
```

- Skeleton shapes match the final layout's size so the swap causes no layout shift.
- Shimmer moves a pseudo-element with `transform`, never `background-position` (repaints every frame).
- Mark the region `aria-busy="true"` while loading; announce completion only if the user started the action.
- Spinners: one rotating element via `transform: rotate()`; after ~10 s add text ("Still loading…").
- **Reduced motion:** static skeleton blocks with no shimmer; spinners are replaced by a static icon plus "Loading…" text (or a slow opacity pulse of at least 2 s per cycle); content fades in over the reduced duration.
