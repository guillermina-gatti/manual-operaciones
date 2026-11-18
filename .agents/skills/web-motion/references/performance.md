# Motion performance

Budget: one frame is 16.7 ms at 60 Hz and 8.3 ms at 120 Hz, shared by script, style, layout, paint and compositing. Smooth motion means the browser can produce every frame inside that budget on a mid-range phone, not on a development laptop.

## What each property costs

| Animated property | Work per frame | Verdict |
| --- | --- | --- |
| `transform`, `translate`, `scale`, `rotate`, `opacity` | Composite only (on a layer) | Default choice |
| `filter` (blur, brightness), `backdrop-filter` | Composite, but GPU cost grows with blur radius and area | Small areas, short durations |
| `clip-path`, `mask` | Usually paint | One-offs on small elements |
| `color`, `background-color`, `box-shadow`, `border-radius`, `background-position` | Paint | Fine on a button; not on large surfaces or many elements |
| `width`, `height`, `inset`/`top`/`left`, `margin`, `padding`, `font-size`, `grid-template-*` | Layout + paint of the affected subtree | Never in loops, scroll effects or lists; one-offs on small subtrees only |

Substitutions:

- Resize → `scale` with FLIP, or a View Transition group.
- Move → `translate`/`transform`, never `top`/`left`.
- Animated shadow → fade the opacity of a pseudo-element that holds the larger shadow.
- Blur-in → start at a small blur on a small element, or fade + slight scale instead.
- Background shimmer → `transform` a gradient pseudo-element.

## Compositing and layers

- Elements animating `transform`/`opacity` via CSS, WAAPI or scroll-driven timelines are promoted to their own layer and animated on the compositor thread, so they keep running while the main thread is busy.
- JS-driven animation (`requestAnimationFrame` loops, most library values set through inline styles) runs on the main thread and stutters whenever a long task runs. Prefer CSS/WAAPI for anything that must stay smooth during loading or heavy rendering.
- Every layer costs GPU memory (roughly width × height × 4 bytes, times device pixel ratio squared). Hundreds of promoted elements hurt more than they help, especially on phones.
- Promote transiently: add `will-change` right before an interaction, remove it when done.

```js
// Prime layers for click-driven animations (menu open, card expand) while the pointer or focus approaches.
export function primeWillChange(el, props = 'transform, opacity') {
  const on = () => { el.style.willChange = props; };
  const off = () => { el.style.willChange = ''; };
  el.addEventListener('pointerenter', on);
  el.addEventListener('focusin', on);
  el.addEventListener('transitionend', off);
  el.addEventListener('animationend', off);
}
```

- Permanent `will-change` is fine only for a few elements that animate constantly (a sticky header that shrinks on scroll, a draggable handle).
- Overlapping content above a promoted layer can be promoted implicitly ("layer explosion"). Check in the Layers panel after adding animations to lists.

## Measuring in DevTools (Chromium)

1. Open DevTools → **Performance**. In the capture settings set **CPU: 4× slowdown** (6× to approximate low-end phones) and, for loading states, a network throttling preset.
2. Click **Record**, perform the interaction or scroll 2–3 times, stop.
3. Read the **Frames** track: dropped or partially presented frames during the effect mean jank.
4. Read the **Main** track under the animation:
   - Purple **Layout** / **Recalculate Style** blocks on every frame → a layout property is animating or script reads layout each frame.
   - Green **Paint** blocks on every frame → a paint property is animating, or a layer is being repainted.
   - Tasks with a red corner are **long tasks** (> 50 ms); click one and use **Bottom-up** to find the function.
5. Read the **Interactions** track: the interaction's duration must stay under 200 ms (INP "good"); animation start must not wait on script.
6. Open the **Rendering** drawer (Command menu → "Show Rendering"):
   - **Paint flashing** — green overlays while an effect runs show repaints; a pure transform/opacity effect flashes once at most.
   - **Layout shift regions** — entering content must not trigger them.
   - **Layer borders** and the **Layers** panel — count and size of layers.
   - **Frame rendering stats** — live FPS and GPU memory.
   - **Emulate CSS media feature prefers-reduced-motion** — test the reduced path without changing OS settings.
7. Open the **Animations** drawer to slow animations to 25 % / 10 % and scrub them; check easing, stagger and that exits are shorter than enters.

Firefox (Performance panel, Profiler) and Safari (Timelines → Layout & Rendering, Media & Animations) offer equivalents; verify at least once in each engine you support, and on a real phone for scroll effects.

### In the field

```js
// Log slow frames caused by script during development or in real-user monitoring.
if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 100) console.warn('Long animation frame', Math.round(entry.duration), 'ms', entry.scripts);
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
}
```

## Avoiding long tasks and layout thrash

- **Do not start heavy work in the same frame as an animation.** Kick off the animation first, then defer rendering-heavy work until `anim.finished` or the next idle period.
- **Break up long work** so input and JS-driven animations get frames:

```js
const yieldToMain = () =>
  globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0));

export async function processInChunks(items, fn, budgetMs = 8) {
  let start = performance.now();
  for (const item of items) {
    fn(item);
    if (performance.now() - start > budgetMs) {
      await yieldToMain();
      start = performance.now();
    }
  }
}
```

- **Batch reads before writes.** Reading `getBoundingClientRect()`, `offsetHeight`, `scrollTop` or `getComputedStyle()` after a style write forces synchronous layout; in a loop it forces one layout per iteration. Read everything, then write everything (see the FLIP recipe).
- **No per-frame work in `scroll` handlers.** Use scroll-driven animations, IntersectionObserver for enter/leave, ResizeObserver for size. If a scroll listener is unavoidable, register it `{ passive: true }` and coalesce into one `requestAnimationFrame` callback that only writes `transform`/`opacity`.
- **Pointer-follow effects** (tilt, magnetic buttons, cursor spotlights): read the pointer in `pointermove`, apply in one `requestAnimationFrame`, write a CSS custom property or `transform` only. Skip them on `(hover: none)` and under reduced motion.
- **Stop what is off-screen.** Pause infinite animations outside the viewport (`animation-play-state: paused` toggled by IntersectionObserver); use `content-visibility: auto` with `contain-intrinsic-size` on long off-screen sections.
- **Limit simultaneous animations.** Animate the items in view, cap staggers, and never animate every row of a long list on data refresh.
- **Fonts and images:** start entrance animations after fonts and above-the-fold images are ready, or reserve their space; a font swap mid-animation causes a layout shift and a visible jump.

## Common jank and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Stutter during a modal/drawer open | Rendering the modal content in the same frame | Render content first (hidden), then open; or defer heavy children until `finished` |
| Scroll reveal choppy on phones | `scroll` listener reading layout | Scroll-driven animation or IntersectionObserver + CSS transition |
| List reorder hitches | Layout per item, reads interleaved with writes | FLIP with batched reads; Motion `layout` on moving items only |
| Blur/glass panel drops frames | Large `backdrop-filter` or animated `filter: blur()` | Smaller blur radius, smaller area, or a static pre-blurred background |
| Animation freezes while data loads | JS-driven animation blocked by long tasks | Move to CSS/WAAPI transform/opacity; chunk the work |
| Page jumps as content fades in | Entering content changes layout | Reserve space (skeleton, `aspect-ratio`, `min-block-size`); animate transform/opacity only |
| Memory spikes, slow first paint | Global `will-change` or many promoted layers | Remove global `will-change`; promote transiently |
