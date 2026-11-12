import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ProgressNest, layerState, mudShade } from '@/components/executions/ProgressNest';

const nest = (total: number, finishedCount: number, currentNumber: number | null) => {
  const { container } = render(
    <ProgressNest total={total} finishedCount={finishedCount} currentNumber={currentNumber} />,
  );
  return container.querySelector('svg')!;
};

const states = (svg: SVGElement) =>
  [...svg.querySelectorAll('[data-layer]')].map((layer) => layer.getAttribute('data-state'));

describe('ProgressNest', () => {
  test.each([
    [5, 0, 1, ['current', 'pending', 'pending', 'pending', 'pending']],
    [5, 2, 3, ['done', 'done', 'current', 'pending', 'pending']],
    [5, 4, 5, ['done', 'done', 'done', 'done', 'current']],
    [5, 5, null, ['done', 'done', 'done', 'done', 'done']],
  ])('%i steps, %i done: one layer per step, from the bottom up', (total, done, current, expected) => {
    expect(states(nest(total, done, current))).toEqual(expected);
  });

  test('another number of steps divides the dome in that many layers', () => {
    expect(states(nest(3, 1, 2))).toEqual(['done', 'current', 'pending']);
    expect(states(nest(8, 8, null))).toHaveLength(8);
  });

  test('the layers are stacked from y=64 up and the top one reaches the top of the dome', () => {
    const rects = [...nest(4, 0, 1).querySelectorAll('[data-layer] > rect:not([data-fill])')];

    expect(rects.map((rect) => [rect.getAttribute('y'), rect.getAttribute('height')])).toEqual([
      ['50', '14'],
      ['36', '14'],
      ['22', '14'],
      ['0', '22'],
    ]);
  });

  test('the 5 layers of the mockup are 11.2 high, with a white line between them', () => {
    const svg = nest(5, 0, 1);

    const first = svg.querySelector('[data-layer="1"] > rect')!;
    expect(Number(first.getAttribute('y'))).toBeCloseTo(52.8);
    expect(Number(first.getAttribute('height'))).toBeCloseTo(11.2);
    const lines = svg.querySelectorAll('line');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toHaveAttribute('stroke-width', '1.2');
  });

  test('a finished layer shows its mud, the others do not', () => {
    const svg = nest(3, 1, 2);
    const fill = (n: number) => svg.querySelector(`[data-layer="${n}"] > [data-fill]`)!;

    expect(fill(1)).toHaveClass('scale-y-100');
    expect(fill(2)).toHaveClass('scale-y-0');
    expect(fill(3)).toHaveClass('scale-y-0');
  });

  test('with "reduce motion" nothing is animated', () => {
    const svg = nest(5, 2, 3);

    const animated = svg.querySelectorAll('[class*="transition"]');
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((element) => expect(element).toHaveClass('motion-reduce:transition-none'));
  });

  test('decorative, with the entrance and a clip path of its own', () => {
    const svg = nest(5, 0, 1);

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 120 72');
    expect(svg.querySelector('ellipse')).toHaveAttribute('cx', '95');
    const id = svg.querySelector('clipPath')!.id;
    expect(id).toMatch(/^nest-[a-zA-Z0-9_-]+$/);
    expect(svg.querySelector('g[clip-path]')).toHaveAttribute('clip-path', `url(#${id})`);
  });
});

describe('layerState', () => {
  test('done up to the finished count, then the current one, then pending', () => {
    expect([1, 2, 3, 4].map((n) => layerState(n, 2, 3))).toEqual([
      'done',
      'done',
      'current',
      'pending',
    ]);
  });
});

describe('mudShade', () => {
  test('darker at the bottom and lighter at the top, mixed from the team tokens', () => {
    expect(mudShade(0, 5)).toBe('color-mix(in srgb, var(--color-barro) 70%, var(--color-barro-puerta))');
    expect(mudShade(4, 5)).toBe('color-mix(in srgb, var(--color-barro) 70%, var(--color-blanco))');
    expect(mudShade(0, 1)).toContain('var(--color-barro-puerta)');
  });
});
