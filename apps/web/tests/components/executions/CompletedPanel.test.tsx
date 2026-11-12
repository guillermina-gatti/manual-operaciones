import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CompletedPanel } from '@/components/executions/CompletedPanel';

const panel = (props: Partial<Parameters<typeof CompletedPanel>[0]> = {}) => {
  render(
    <CompletedPanel
      procedureName="Cierre de caja"
      totalSteps={5}
      totalDurationMs={14 * 60_000 + 32_000}
      slowestStep={{ title: 'Comparar con el reporte', durationMs: 5 * 60_000 + 10_000 }}
      {...props}
    />,
  );
  return screen.getByRole('status', { name: '¡Terminaste Cierre de caja!' });
};

describe('CompletedPanel', () => {
  test('says the nest is finished, the total time and the step that took longest', () => {
    const status = panel();

    expect(within(status).getByText('Nido terminado · 5 de 5 pasos')).toBeInTheDocument();
    expect(within(status).getByRole('heading', { level: 2 })).toHaveTextContent(
      '¡Terminaste Cierre de caja!',
    );
    expect(status).toHaveTextContent('14 min 32 s en total');
    expect(status).toHaveTextContent('El paso que más te llevó: Comparar con el reporte (5 min 10 s)');
  });

  test('without a duration per step, that line is not shown', () => {
    const status = panel({ slowestStep: null });

    expect(status).toHaveTextContent('14 min 32 s en total');
    expect(status).not.toHaveTextContent('El paso que más te llevó');
  });

  test('without the end of the execution, no total time', () => {
    const status = panel({ totalDurationMs: null });

    expect(status).not.toHaveTextContent('en total');
    expect(status).toHaveTextContent('¡Terminaste Cierre de caja!');
  });

  test('the whole nest: every layer done, one per step', () => {
    const status = panel({ totalSteps: 3 });

    const layers = status.querySelectorAll('[data-layer]');
    expect(layers).toHaveLength(3);
    layers.forEach((layer) => expect(layer).toHaveAttribute('data-state', 'done'));
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('three ways out: another procedure first, my activity, and home as a link', () => {
    const status = panel();

    const links = within(status).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Ver otro procedimiento →', '/ejecuciones'],
      ['Ver mi actividad', '/ejecuciones/mi-actividad'],
      ['Volver al inicio', '/'],
    ]);
    expect(within(status).getByRole('link', { name: 'Ver otro procedimiento' })).toBeInTheDocument();
  });

  test('the hornero is decorative', () => {
    const status = panel();

    expect(status.querySelector('img')).toHaveAttribute('alt', '');
  });
});
