# Browser verification

Type-checks and unit tests do not show a clipped label, an invisible focus ring or a dark-mode surface with unreadable text. Every UI change is looked at in a real browser before it is called done.

## Tools

Use, in order of preference:

1. The project's own setup: Playwright or Cypress config, Storybook with the a11y addon, visual regression tests.
2. A browser automation tool available in the environment (open a tab, resize, emulate media, run JavaScript, screenshot).
3. The script below: Playwright + axe-core in a throwaway folder (`npm i -D playwright axe-core && npx playwright install chromium`). Do not add them to the project's dependencies unless asked.

Start the project's dev server first and note the URL of each screen touched.

## Procedure

1. **Widths × themes.** For each screen at 375, 768 and 1280 px, in light and dark: screenshot and look at it. Check the layout table in [layout-and-responsive.md](layout-and-responsive.md#widths-to-verify).
2. **Automated checks** (script): horizontal overflow, small targets, layout shift, console errors, axe violations, focus-ring presence on each tab stop.
3. **States.** Put each component in every state from the SKILL state table: hover and press with the pointer, focus with `Tab`, disabled, loading (throttle the network in DevTools or delay the mock), empty (no data), error (block the request or return 500). Screenshot the ones that changed.
4. **Keyboard walk.** Complete the screen's main task with the keyboard alone: open and close overlays, submit a form with an error, check where focus lands after each action.
5. **Reduced motion** (script emulates it): nothing large moves; only essential indicators animate.
6. **Zoom and reflow.** 320 px width and 200 % zoom at 1280: no horizontal scroll, nothing clipped.
7. **Fix and repeat** until every check passes, then write the verification notes.

## Script

```ts
// verify-ui.mts (.mts = ES module, needed for top-level await) — usage: npx tsx verify-ui.mts http://localhost:5173/ http://localhost:5173/settings
import { chromium, type Page } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const WIDTHS = [375, 768, 1280];
const SCHEMES = ['light', 'dark'] as const;
const OUT = 'ui-check';

const urls = process.argv.slice(2);
if (urls.length === 0) throw new Error('usage: verify-ui.mts <url> [url…]');
mkdirSync(OUT, { recursive: true });

type Stop = { tag: string; name: string; ring: boolean };

async function layoutIssues(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const interactive = 'button, input, select, textarea, [role="button"], [role="tab"], [role="switch"], a[href]:not(p a)';
    const smallTargets = [...document.querySelectorAll<HTMLElement>(interactive)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
      })
      .map((el) => el.outerHTML.slice(0, 100));
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      smallTargets,
      runningAnimations: document.getAnimations().length,
      cls: (window as unknown as { __cls: number }).__cls,
    };
  });
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string; help: string; nodes: unknown[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return result.violations.map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}`);
  });
}

async function tabWalk(page: Page, maxStops = 60): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
      // Approximate accessible name: aria-labelledby, aria-label, <label>, content, title
      const byIds = (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      const labels = [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent ?? '').join(' ');
      const name = (byIds.trim() || el.getAttribute('aria-label') || labels || el.textContent || el.title).trim().slice(0, 40);
      return { tag: el.tagName.toLowerCase(), name, ring };
    });
    if (!stop || (stops.length > 0 && stop.tag === stops[0].tag && stop.name === stops[0].name)) break; // wrapped around
    stops.push(stop);
  }
  return stops;
}

const browser = await chromium.launch();
let failures = 0;

for (const url of urls) {
  const slug = new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  for (const colorScheme of SCHEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!entry.hadRecentInput) w.__cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(e.message));

      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: `${OUT}/${slug}-${colorScheme}-${width}.png`, fullPage: true });

      const layout = await layoutIssues(page);
      const axe = await axeViolations(page);
      const problems = [
        layout.overflowX > 0 && `horizontal overflow ${layout.overflowX}px`,
        layout.cls > 0.1 && `layout shift ${layout.cls.toFixed(3)}`,
        layout.smallTargets.length > 0 && `targets < 24px: ${layout.smallTargets.join(' | ')}`,
        consoleErrors.length > 0 && `console: ${consoleErrors.join(' | ')}`,
        ...axe.map((v) => `axe ${v}`),
      ].filter(Boolean) as string[];

      if (width === 1280 && colorScheme === 'light') {
        const stops = await tabWalk(page);
        console.log(`  tab order: ${stops.map((s) => `${s.tag}"${s.name}"`).join(' → ')}`);
        problems.push(...stops.filter((s) => !s.ring).map((s) => `no focus ring on ${s.tag} "${s.name}"`));
        problems.push(...stops.filter((s) => !s.name).map((s) => `no name on focusable ${s.tag}`));
      }

      console.log(`${problems.length ? 'FAIL' : 'PASS'} ${slug} ${colorScheme} ${width}px (animations under reduced motion: ${layout.runningAnimations})`);
      for (const p of problems) console.log(`  - ${p}`);
      failures += problems.length;
      await context.close();
    }
  }
}

await browser.close();
console.log(failures ? `${failures} problem(s); screenshots in ${OUT}/` : `All checks passed; screenshots in ${OUT}/`);
process.exitCode = failures ? 1 : 0;
```

- The focus-ring check reads computed styles after keyboard focus, so it sees `:focus-visible` rings; rings drawn by a pseudo-element are reported as missing — confirm those on the screenshot.
- Inline links in running text are exempt from the target-size rule and excluded from the check.
- `runningAnimations` should only count essential indicators (spinners, progress); anything else must stop under reduced motion.
- Axe cannot judge contrast on text over images or gradients; check those with the contrast script in [design-tokens.md](design-tokens.md#checking-contrast).
- Delete `ui-check/` and the throwaway folder afterwards, or add them to `.gitignore` if the user wants to keep them.

## Screenshot review

Look at every screenshot for:

- Text clipped, overlapping, or wrapping one word per line; truncation without a way to read the full value.
- Unequal gaps or misaligned edges between siblings; elements touching the viewport edge on mobile.
- Dark mode: a hard-coded white card, dark text on dark surface, an unthemed native control or scrollbar, an image with a white box.
- Line length over ~65 characters on wide screens; stretched single-column forms.
- Controls in one row with different heights.

## Verification notes

End the task with a short report:

```markdown
Verified in Chromium at 375 / 768 / 1280 px, light and dark, reduced motion.
- Screens: <screen> (<url>), <screen> (<url>)
- States exercised: hover, focus, disabled, loading, empty, error
- Keyboard: <main task> completed; focus returns to <trigger> after closing <overlay>
- Automated: axe 0 violations, no overflow, CLS <value>, console clean
- Fixed during verification: <issue> → <fix>
- Not verified: <what and why, e.g. screen reader, Safari>
```
