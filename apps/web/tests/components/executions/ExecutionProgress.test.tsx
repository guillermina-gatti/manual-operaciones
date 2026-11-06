import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ExecutionProgress } from '@/components/executions/ExecutionProgress';
import { summarizeExecution } from '@/lib/executions/summary';
import { execution } from '../../support/executions';

const progress = (finished: number) =>
  render(<ExecutionProgress summary={summarizeExecution(execution(finished))} />);

const bar = () => screen.getByRole('progressbar', { name: 'Pasos terminados' });
const segments = () => [...bar().children].map((segment) => segment.getAttribute('data-state'));

describe('ExecutionProgress', () => {
  test('in progress: the current step, the percentage and one segment per step', () => {
    progress(2);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Paso 3 de 4');
    expect(screen.getByText('completado').textContent).toBe('50% completado');
    expect(segments()).toEqual(['done', 'done', 'current', 'pending']);
  });

  test('the bar tells the finished steps as text', () => {
    progress(1);

    expect(bar()).toHaveAttribute('aria-valuemin', '0');
    expect(bar()).toHaveAttribute('aria-valuemax', '4');
    expect(bar()).toHaveAttribute('aria-valuenow', '1');
    expect(bar()).toHaveAttribute('aria-valuetext', '1 de 4 pasos terminados');
  });

  test('a new execution: 0% and the first segment is the current one', () => {
    progress(0);

    expect(screen.getByText('completado').textContent).toBe('0% completado');
    expect(segments()).toEqual(['current', 'pending', 'pending', 'pending']);
  });

  test('the title is a live region, so the new step is announced', () => {
    progress(1);

    expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('aria-live', 'polite');
  });

  test('completed: "Procedimiento terminado", 100% and every segment done', () => {
    progress(4);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Procedimiento terminado');
    expect(screen.getByText('completado').textContent).toBe('100% completado');
    expect(segments()).toEqual(['done', 'done', 'done', 'done']);
    expect(bar()).toHaveAttribute('aria-valuetext', '4 de 4 pasos terminados');
  });
});
