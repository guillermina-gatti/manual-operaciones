import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { FeatherBar, FeatherLegend } from '@/components/metrics/FeatherBar';

const COUNTS = { started: 285, completed: 226, inProgress: 23, abandoned: 36 };

describe('FeatherBar', () => {
  test('tells screen readers the counts as text', () => {
    render(<FeatherBar counts={COUNTS} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Distribución: 226 completadas, 23 en curso, 36 abandonadas',
    );
  });

  test('each segment carries its percentage, in order', () => {
    render(<FeatherBar counts={COUNTS} />);

    const segments = [...screen.getByRole('img').children];
    expect(segments.map((segment) => segment.textContent)).toEqual(['79,3%', '8,1%', '12,6%']);
    expect(segments.map((segment) => (segment as HTMLElement).style.flexGrow)).toEqual([
      String(226 / 285),
      String(23 / 285),
      String(36 / 285),
    ]);
  });

  test('an outcome without executions has no segment', () => {
    render(<FeatherBar counts={{ started: 2, completed: 2, inProgress: 0, abandoned: 0 }} />);

    expect([...screen.getByRole('img').children].map((s) => s.textContent)).toEqual(['100,0%']);
  });

  test('the thin sizes do not write the percentage', () => {
    render(<FeatherBar counts={COUNTS} size="sm" />);

    expect(screen.getByRole('img').textContent).toBe('');
    expect(screen.getByRole('img').children).toHaveLength(3);
  });
});

describe('FeatherLegend', () => {
  test('shows only the counts, without percentages', () => {
    render(<FeatherLegend counts={COUNTS} />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Completadas: 226',
      'En curso: 23',
      'Abandonadas: 36',
    ]);
  });
});
