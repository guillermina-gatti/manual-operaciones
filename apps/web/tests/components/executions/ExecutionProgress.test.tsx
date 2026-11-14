import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ExecutionProgress } from '@/components/executions/ExecutionProgress';
import { summarizeExecution } from '@/lib/executions/summary';
import { execution } from '../../support/executions';

const progress = (finished: number) =>
  render(<ExecutionProgress summary={summarizeExecution(execution(finished))} />);

const bar = () => screen.getByRole('progressbar', { name: 'Pasos terminados' });
const layers = () =>
  [...bar().querySelectorAll('[data-layer]')].map((layer) => layer.getAttribute('data-state'));

describe('ExecutionProgress', () => {
  test('in progress: the title, the finished steps and one layer of the nest per step', () => {
    progress(2);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tu nido va tomando forma');
    expect(screen.getByText('pasos hechos').textContent).toBe('2 de 4 pasos hechos');
    expect(layers()).toEqual(['done', 'done', 'current', 'pending']);
  });

  test('the progressbar tells the finished steps as text', () => {
    progress(1);

    expect(bar()).toHaveAttribute('aria-valuemin', '0');
    expect(bar()).toHaveAttribute('aria-valuemax', '4');
    expect(bar()).toHaveAttribute('aria-valuenow', '1');
    expect(bar()).toHaveAttribute('aria-valuetext', '1 de 4 pasos terminados');
  });

  test('the nest is decorative: inside the progressbar, hidden from screen readers', () => {
    progress(1);

    expect(bar().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('a new execution: 0 steps done and the first layer is the current one', () => {
    progress(0);

    expect(screen.getByText('pasos hechos').textContent).toBe('0 de 4 pasos hechos');
    expect(layers()).toEqual(['current', 'pending', 'pending', 'pending']);
  });

  test('a live region announces the current step', () => {
    progress(1);

    const live = screen.getByText('Paso 2 de 4');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  test('completed: every layer done and "Procedimiento terminado" for screen readers', () => {
    progress(4);

    expect(screen.getByText('Procedimiento terminado')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('pasos hechos').textContent).toBe('4 de 4 pasos hechos');
    expect(layers()).toEqual(['done', 'done', 'done', 'done']);
    expect(bar()).toHaveAttribute('aria-valuetext', '4 de 4 pasos terminados');
  });
});
