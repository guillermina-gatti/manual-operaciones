# Motion APIs: details and pitfalls

Browser support for the newer APIs changes quickly. Always feature-detect (`@supports`, `'startViewTransition' in document`, `CSS.supports(...)`) and make the unsupported path a working, un-animated UI. Check current support tables before promising an effect everywhere.

## CSS transitions and keyframes

- Transitions interpolate from the *current* value, so interrupting (hover off mid-way, closing while opening) reverses smoothly. Prefer them for any state that can toggle.
- Keyframe animations restart from their first keyframe when re-applied; use them for loops and one-shot sequences, not toggles.
- List properties explicitly (`transition: opacity …, transform …`); never `transition: all`, which animates layout properties that change by accident.
- Entering from `display: none` (and top-layer `<dialog>`/`[popover]`) needs three things: the open-state rule, an `@starting-style` block with the from-values, and `display`/`overlay` in the transition list with `allow-discrete`.
- Different enter and exit timing: put the exit timing on the base (closed) rule and the enter timing on the open rule — the rule being transitioned *to* supplies the timing.
- Independent transform properties (`translate`, `scale`, `rotate`) can be transitioned separately, so a hover scale does not fight a positional `transform`:

```css
.card { transition: scale var(--dur-micro) var(--ease-out), translate var(--dur-ui) var(--ease-out); }
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .card:hover { scale: 1.02; }
}
```

## Web Animations API

```js
const anim = el.animate(
  [
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 1, transform: 'none' },
  ],
  { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
);
await anim.finished;
```

- Read tokens instead of duplicating them:

```js
export function token(name, el = document.documentElement) {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value.endsWith('ms') ? parseFloat(value) : value.endsWith('s') ? parseFloat(value) * 1000 : value;
}
// el.animate(frames, { duration: token('--dur-ui'), easing: token('--ease-out') });
```

- Because tokens change under the reduced-motion media query, `token()` returns reduced values automatically; still skip pure-motion effects with `prefersReducedMotion()`.
- Interrupt before starting a new animation on the same element: `el.getAnimations().forEach((a) => a.cancel())`, or call `anim.reverse()` on the running one to toggle back smoothly.
- Avoid leaving `fill: 'forwards'` animations alive; they override styles forever. Either set the final style first and animate *from* the old values, or persist and clean up:

```js
anim.addEventListener('finish', () => {
  anim.commitStyles(); // write the end state to el.style
  anim.cancel();
});
```

- `anim.finished` rejects when canceled; `await anim.finished.catch(() => {})` where cancellation is expected.
- `document.getAnimations()` lists every running CSS and WAAPI animation — handy for tests and debugging.

## View Transitions API

### Same-document

```js
const vt = document.startViewTransition(() => renderNext());
await vt.updateCallbackDone; // DOM swapped; safe to move focus
await vt.finished;           // animation done
```

- The update callback runs after the old state is captured; rendering is frozen until it resolves. Load data first, then start the transition with a synchronous (or quick) DOM swap.
- `vt.skipTransition()` jumps to the end state (use it when a second navigation starts before the first finishes).
- Move focus to the new view's heading or main region after `updateCallbackDone`, not after `finished`.

### Naming shared elements

- `view-transition-name` must be unique among rendered elements at capture time; a duplicate aborts the transition. Assign names just before starting (set `style.viewTransitionName` on the clicked item only) and clear them after.
- `view-transition-name: none` opts an element out; elements without a name are part of the `root` snapshot.
- `view-transition-class` applies one set of `::view-transition-group(.class)` styles to many named elements (where supported).
- Named elements animate position and size between snapshots; content inside is cross-faded as images, so text reflow mid-transition looks stretched. Keep shared elements aspect-ratio-stable or animate only a stable child (image, card background).

### Direction-aware route transitions

```js
export function navigateWithTransition(update, direction /* 'forward' | 'back' */) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) return update();
  const supportsTypes = typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype;
  return supportsTypes
    ? document.startViewTransition({ update, types: [direction] })
    : document.startViewTransition(update);
}
```

```css
@keyframes slide-out-left { to { opacity: 0; transform: translateX(-24px); } }
@keyframes slide-in-right { from { opacity: 0; transform: translateX(24px); } }
@keyframes slide-out-right { to { opacity: 0; transform: translateX(24px); } }
@keyframes slide-in-left { from { opacity: 0; transform: translateX(-24px); } }

html:active-view-transition-type(forward)::view-transition-old(root) { animation: slide-out-left var(--dur-ui-exit) var(--ease-in) both; }
html:active-view-transition-type(forward)::view-transition-new(root) { animation: slide-in-right var(--dur-ui) var(--ease-out) both; }
html:active-view-transition-type(back)::view-transition-old(root) { animation: slide-out-right var(--dur-ui-exit) var(--ease-in) both; }
html:active-view-transition-type(back)::view-transition-new(root) { animation: slide-in-left var(--dur-ui) var(--ease-out) both; }
```

Pair it with the reduced-motion block from `SKILL.md`, which disables every `::view-transition-*` animation.

### Cross-document (multi-page sites)

- Opt in with `@view-transition { navigation: auto; }` on both the old and the new page; same-origin navigations only.
- `pageswap` (old page) and `pagereveal` (new page) events expose `event.viewTransition` for setting types or names per navigation.
- Keep the new page's first render fast: a slow document delays the transition and the whole navigation feels slower. Unsupported browsers navigate normally.

## Scroll-driven animations

| Timeline | Progress follows | Typical use |
| --- | --- | --- |
| `scroll()` | Scroll position of the nearest (or `root`) scroll container | Reading-progress bar, header shrink |
| `view()` | The element's own visibility within its scroll container | Reveal, parallax, scrubbed image |
| `view-timeline: --name` + `timeline-scope` | A named element, consumed by another element | Animate a sticky caption from a section's progress |

`animation-range` picks the slice of the timeline: `entry`, `exit`, `cover`, `contain`, with percentages, e.g. `entry 0% entry 100%` (while entering) or `cover 0% cover 100%` (whole pass).

Reading-progress bar:

```css
.read-progress {
  position: fixed; inset: 0 0 auto; block-size: 3px;
  background-color: var(--accent);
  transform-origin: 0 50%;
  transform: scaleX(0);
}
@supports (animation-timeline: scroll()) {
  .read-progress {
    animation: grow-x 1ms linear both;
    animation-timeline: scroll(root block);
  }
}
@keyframes grow-x { to { transform: scaleX(1); } }
```

Parallax (decorative only):

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .parallax-img {
      animation: drift 1ms linear both;
      animation-timeline: view();
      animation-range: cover 0% cover 100%;
    }
  }
}
@keyframes drift {
  from { transform: translateY(-8%); }
  to { transform: translateY(8%); }
}
```

- Declare `animation-timeline` after the `animation` shorthand; the shorthand resets it.
- Give a small non-zero duration (`1ms`); the timeline maps it to scroll progress, and some engines ignore the animation otherwise.
- Use `linear` easing for scrubbed effects so motion tracks the finger; ease inside keyframes with more stops if needed.
- An ancestor with `overflow: hidden` becomes the scroll container that `scroll()`/`view()` look at; use `overflow: clip` for clipping without creating one.
- Scroll-driven animations of `transform`/`opacity` run off the main thread; they stay smooth while JS is busy.
- **Reduced motion:** keep the progress bar (it mirrors the user's own scrolling 1:1); drop parallax, scrubbed zooms and reveals; content must be in its final state.
- Fallback where unsupported: static (progress bar hidden or omitted, parallax off) or IntersectionObserver-triggered reveals as in `SKILL.md`. Never polyfill with `scroll` event handlers that write styles every frame.

## Motion (motion.dev, formerly Framer Motion)

- Package `motion`; React API from `motion/react`, vanilla `animate`/`scroll`/`inView` from `motion`. Older projects import from `framer-motion`; keep their import path unless the task is a migration.
- Core props: `initial`, `animate`, `exit` (needs an `AnimatePresence` parent), `transition`, `whileHover`, `whileTap`, `whileInView` (with `viewport={{ once: true }}`), `layout`, `layoutId`.
- Reduced motion: wrap the app in `<MotionConfig reducedMotion="user">` (transform and layout animations are skipped; opacity and color still animate). For custom logic, `const reduce = useReducedMotion()`.
- Match tokens: `transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}`. Reserve `type: 'spring'` for the one emphasis role, e.g. `{ type: 'spring', stiffness: 500, damping: 30 }` on small elements.
- Shared-element indicator (tabs, segmented control):

```tsx
import { motion } from 'motion/react';

type Tab = { id: string; label: string };

export function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4 }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          style={{ position: 'relative', isolation: 'isolate', padding: '8px 12px' }}
        >
          {tab.id === active && (
            <motion.span
              layoutId="tab-indicator"
              transition={{ duration: 0.24, ease: [0.65, 0, 0.35, 1] }}
              style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'var(--tab-active-bg)', zIndex: -1 }}
            />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- `layout` animations measure the DOM; keep them to the components that actually move and avoid them in long lists (>50 rows).
- Bundle size: for motion-light pages use `LazyMotion` with `m.*` components, or plain CSS.

## GSAP

Use when the project already ships GSAP or for long sequenced timelines, SVG morphs and pinned storytelling that CSS cannot express.

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.from('.feature', {
    y: 24,
    autoAlpha: 0,
    duration: 0.48,
    ease: 'power3.out',
    stagger: { each: 0.04 },
    scrollTrigger: { trigger: '.features', start: 'top 80%', once: true },
  });
  // everything created here is reverted automatically when the query stops matching
});
```

- `gsap.matchMedia()` is the reduced-motion switch: create motion only inside the `no-preference` branch.
- `gsap.from` sets start values when it runs, so content is visible if the script never loads.
- In React use `useGSAP(() => { … }, { scope: containerRef })` from `@gsap/react` so tweens and ScrollTriggers are cleaned up on unmount.
- Animate `x`, `y`, `scale`, `rotation`, `autoAlpha`; avoid `width`/`height`/`top`/`left` tweens.
- `pin: true` changes scroll behavior; use only for deliberate storytelling sections, never on core task pages, and never together with smooth-scroll hijacking.
- Check the license terms of GSAP and any plugin before adding it to a project that does not already use it.
