import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ExecutionSummaryCard } from '@/components/executions/ExecutionSummaryCard';
import { summarizeExecution } from '@/lib/executions/summary';
import { execution } from '../../support/executions';

const card = (finished: number) => {
  const value = execution(finished);
  render(<ExecutionSummaryCard execution={value} summary={summarizeExecution(value)} />);
  return screen.getByRole('region', { name: 'Resumen' });
};

const rows = (region: HTMLElement) =>
  [...region.querySelectorAll('dl > div')].map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ]);

describe('ExecutionSummaryCard', () => {
  test('in progress: finished steps and when it started, without a total yet', () => {
    expect(rows(card(2))).toEqual([
      ['Pasos terminados', '2 de 4'],
      ['Empezaste a las', '10:00'],
    ]);
  });

  test('completed: also how long it took', () => {
    expect(rows(card(4))).toEqual([
      ['Pasos terminados', '4 de 4'],
      ['Empezaste a las', '10:00'],
      ['Tiempo total', '12 min'],
    ]);
  });
});
