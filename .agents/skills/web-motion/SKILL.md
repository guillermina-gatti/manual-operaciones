---
name: web-motion
description: Add purposeful, accessible, 60 fps motion to real websites and web apps — micro-interactions, hover/press feedback, enter/exit transitions for menus, modals, toasts and lists, page and route transitions, scroll-linked and scroll-triggered reveals, loading and skeleton states — using motion tokens, CSS transitions/keyframes, the Web Animations API, the View Transitions API, CSS scroll-driven animations, and Motion or GSAP only when warranted, with prefers-reduced-motion handled for every effect. Use when the user asks to animate, add transitions, micro-interactions, page transitions, scroll animations, reveal on scroll, parallax, a loading shimmer or skeleton, make the UI feel smoother or more polished, fix janky or laggy animations, or respect reduced motion. Not for rendered or exported videos.
license: MIT
---

# Motion for web interfaces

Motion on a product surface explains change: where something came from, where it went, what caused it. Every effect must be fast, interruptible, cheap to render and optional for users who ask for less motion.

## Choosing the tool

Pick the first row that can do the job.

| Need | Tool | Notes |
| --- | --- | --- |
| State change on one element (hover, press, open, selected) | CSS `transition` | Interruptible for free: reverses from the current value |
| Enter from `display: none`, `<dialog>`, `[popover]` | CSS `transition` + `@starting-style` + `transition-behavior: allow-discrete` | Unsupported browsers just show/hide instantly |
| Looping or multi-step effect (spinner, shimmer, attention pulse) | CSS `@keyframes` | Pause or remove under reduced motion |
| Values known only at runtime (FLIP reorder, pointer-driven, measured sizes) | Web Animations API `el.animate()` | Returns an `Animation` with `.finished`, `.cancel()`, `.reverse()` |
| Swapping one view for another (route change, tab panel, list ↔ detail) | View Transitions API | Same-document `document.startViewTransition()`; cross-document `@view-transition` |
| Progress tied to scroll position (reading bar, parallax, scrubbed reveal) | CSS `animation-timeline: scroll()` / `view()` | Behind `@supports`; fallback is static or IntersectionObserver |
| Reveal once when scrolled into view | CSS `view()` timeline or IntersectionObserver + class | Never a `scroll` event listener |
| Exit animations of unmounting React nodes, shared layout, gestures, springs | Motion (`motion/react`) | Only if the project already uses it or CSS cannot do it cleanly |
| Long sequenced timelines, pinned scroll storytelling, SVG morphing | GSAP (+ ScrollTrigger) | Only if the project already uses it or the effect needs it |

Details, support notes and pitfalls for each API: [references/apis.md](references/apis.md).

## Workflow

1. **Inventory.** List every state change the request touches (open/close, add/remove, navigate, load, scroll). Motion goes only where it clarifies one of them; skip decorative motion on repeated actions.
2. **Tokens.** Add or reuse the motion token sheet below. Every duration and easing in the code comes from a token.
3. **Pick the tool** per effect from the table above. Check `package.json` before reaching for a library; never add one for an effect CSS can do.
4. **Build the effect** from [references/recipes.md](references/recipes.md) when one fits (buttons, menus, modals, toasts, accordions, list reorder, skeletons).
5. **Reduced motion.** Apply the reduced-motion pattern to each effect and write down its reduced behavior (usually: a short crossfade or an instant change).
6. **Performance pass** per [references/performance.md](references/performance.md): record the interaction in the DevTools Performance panel with CPU throttling, confirm no layout/paint per frame and no long tasks.
7. **Review** with the checklist below, including keyboard-only and reduced-motion runs.

## Hard rules

- Animate `transform` and `opacity`. `filter`/`backdrop-filter` sparingly on small areas. NEVER animate `width`, `height`, `top`, `left`, `margin`, `padding` or `font-size` in loops, scroll effects or lists; one-off size changes use FLIP or a View Transition instead.
- Every effect has a `prefers-reduced-motion: reduce` behavior: remove movement, zoom, parallax and looping; keep short opacity/color changes that carry meaning.
- Motion never blocks interaction. Inputs stay responsive during animations, transitions are interruptible, and no action waits on an animation to finish. Never disable a control or delay navigation for an exit.
- Exit is faster than enter (about 70 %), uses ease-in, and does not bounce.
- Enter uses ease-out. One spring/overshoot curve, reserved for small emphatic arrivals (badge, toggle knob, success check); never on large surfaces or text blocks.
- Durations: 100–150 ms micro-interactions, 200–300 ms UI transitions, 400–600 ms large or full-screen moves. Nothing a user triggers repeatedly exceeds 300 ms.
- Stagger 30–50 ms per item, total stagger capped at ~300 ms; items past the cap enter together. Never stagger more than one list at a time.
- `will-change` only transiently (set before, remove after) or on a handful of elements that animate constantly. Never in a global rule.
- No scroll-jacking: native scroll speed and direction are never overridden. Scroll-linked effects are enhancements; content is fully visible without them.
- Content is visible by default. Hidden initial states apply only when the animation will actually run (JS loaded, API supported, motion allowed).
- Nothing flashes more than three times per second; no large-area rapid flicker.
- Loading indicators appear only after ~300 ms of waiting and stay at least ~300 ms once shown, to avoid flicker.

## Motion token sheet

```css
:root {
  /* durations: enter / exit (exit ≈ 70 %) */
  --dur-micro: 120ms; --dur-micro-exit: 90ms;   /* press, hover, toggle */
  --dur-ui: 240ms;    --dur-ui-exit: 170ms;     /* menus, popovers, tabs, toasts */
  --dur-large: 480ms; --dur-large-exit: 340ms;  /* modals, drawers, page and route transitions */

  /* easing */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);      /* enter */
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);       /* exit */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* move on screen, A → B */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* one overshoot, small elements only */

  /* distances and choreography */
  --shift-sm: 4px; --shift-md: 12px; --shift-lg: 24px;
  --scale-from: 0.96;
  --stagger: 40ms; --stagger-max: 300ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    /* movement collapses to a crossfade: same code, no travel or zoom */
    --shift-sm: 0px; --shift-md: 0px; --shift-lg: 0px;
    --scale-from: 1;
    --stagger: 0ms;
    --ease-spring: var(--ease-out);
    --dur-large: 200ms; --dur-large-exit: 150ms;
  }
}
```

Mirror the same values in JS when a library needs them (`const DUR = { micro: 0.12, ui: 0.24, large: 0.48 }` in seconds for Motion/GSAP, milliseconds for WAAPI).

## Reduced-motion pattern

Write effects against the tokens so the reduced branch comes free, then handle what tokens cannot:

```css
/* 1. Movement through tokens → becomes a fade under reduce */
.panel[data-state="open"] {
  opacity: 1;
  transform: none;
  transition: opacity var(--dur-ui) var(--ease-out), transform var(--dur-ui) var(--ease-out);
}
.panel[data-state="closed"] {
  opacity: 0;
  transform: translateY(var(--shift-md)) scale(var(--scale-from));
  transition: opacity var(--dur-ui-exit) var(--ease-in), transform var(--dur-ui-exit) var(--ease-in);
}

/* 2. Pure-motion effects (loops, parallax, attention) run only when allowed */
@media (prefers-reduced-motion: no-preference) {
  .badge-new { animation: pulse 1.6s var(--ease-in-out) 3; }
}
@keyframes pulse { 50% { transform: scale(1.08); } }
```

```js
// 3. JS-driven effects read the same preference and follow live changes
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotion.matches;
const sync = () => document.documentElement.toggleAttribute('data-reduced-motion', reducedMotion.matches);
reducedMotion.addEventListener('change', sync);
sync();
```

Autoplaying video, carousels and animated illustrations also get a visible pause control, whatever the preference.

## Scroll reveal with fallback

```css
/* Default: visible. No support, no JS or reduced motion → content simply shows. */
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .reveal {
      animation: reveal 1ms linear both;   /* 1ms: some engines need a non-zero duration */
      animation-timeline: view();          /* after the shorthand, which resets it */
      animation-range: entry 10% cover 30%;
    }
  }
  @supports not (animation-timeline: view()) {
    .js .reveal:not(.is-visible) { opacity: 0; transform: translateY(var(--shift-lg)); }
    .js .reveal {
      transition: opacity var(--dur-large) var(--ease-out), transform var(--dur-large) var(--ease-out);
    }
  }
}
@keyframes reveal {
  from { opacity: 0; transform: translateY(var(--shift-lg)); }
}
```

```js
// Fallback trigger: runs only where scroll-driven animations are missing.
if (!CSS.supports('animation-timeline: view()') && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target); // reveal once
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
```

Reduced motion: no animation in either path; content is visible from the start.

## View Transitions snippet

```js
// Same-document view change (SPA route, tab panel, list ↔ detail).
export function swapView(update) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    update();
    return Promise.resolve();
  }
  return document.startViewTransition(update).finished;
}

// usage: swapView(() => render(nextRoute));
```

```css
/* Cross-document (multi-page) transitions: opt in on both pages */
@view-transition { navigation: auto; }

/* Default root crossfade, retimed to tokens */
::view-transition-old(root) { animation-duration: var(--dur-ui-exit); animation-timing-function: var(--ease-in); }
::view-transition-new(root) { animation-duration: var(--dur-ui); animation-timing-function: var(--ease-out); }

/* Shared element: same unique name on the old and the new element */
.card-thumb.is-active, .detail-hero { view-transition-name: hero; }
::view-transition-group(hero) { animation-duration: var(--dur-large); animation-timing-function: var(--ease-in-out); }

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
```

`update` changes the DOM (sync or returning a promise). Rendering is frozen until it settles, so keep it fast: fetch data before calling `swapView`, not inside it.

## React list with Motion (enter/exit)

```tsx
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

type Item = { id: string; label: string };

const DUR = { ui: 0.24, uiExit: 0.17 };
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.55, 0, 1, 0.45] as const;

export function AnimatedList({ items, onRemove }: { items: Item[]; onRemove: (id: string) => void }) {
  return (
    // reducedMotion="user": transform and layout animations are skipped when the OS asks; opacity stays
    <MotionConfig reducedMotion="user">
      <ul role="list" style={{ position: 'relative' }}>
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { duration: DUR.ui, ease: EASE_OUT } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: DUR.uiExit, ease: EASE_IN } }}
            >
              {item.label}
              <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.label}`}>×</button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </MotionConfig>
  );
}
```

- Stable `key`s (ids, never indexes) or exits will play on the wrong row.
- `initial={false}` skips the enter animation on first render; only real additions animate.
- `mode="popLayout"` pulls the exiting item out of flow (the list needs a positioned parent) so siblings reflow immediately with `layout`.
- Reduced motion: items fade in and out; no slide, scale or layout travel.

## Review checklist

- [ ] Each animation answers "what changed?"; no motion on actions repeated dozens of times a session beyond micro feedback.
- [ ] All durations and easings come from tokens; exit shorter than enter.
- [ ] Rapid toggling (click open/close five times fast) never gets stuck, jumps or queues animations.
- [ ] Keyboard-only run: focus moves correctly into and out of animated surfaces; focus ring is never hidden mid-animation.
- [ ] OS reduced-motion on: no travel, zoom, parallax or loop; everything still works and state changes remain visible.
- [ ] With JS disabled or an older browser, all content is visible and usable.
- [ ] DevTools Performance recording with 4× CPU throttling: no layout or paint per frame during the effect, no long task over 50 ms triggered by it.
- [ ] No layout shift introduced by entering content (reserve space, or animate transform only).
- [ ] `will-change` is absent from global styles; any transient one is removed afterwards.

## References

- [references/recipes.md](references/recipes.md) — read when building a specific component: buttons, menus/popovers, modals, toasts, accordions, list reorder, skeletons. Each recipe lists its reduced-motion behavior.
- [references/apis.md](references/apis.md) — read when using Web Animations, View Transitions, scroll-driven animations, Motion or GSAP beyond the templates above.
- [references/performance.md](references/performance.md) — read when an animation janks, when animating many elements or on scroll, or before shipping any effect that runs on low-end devices.
