// La revisión del detalle: próxima fecha, cuánto falta y la barra (spec 005; el color lo decide la API).
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ReviewCountdown, describeCountdown } from '@/components/documents/ReviewCountdown';

describe('describeCountdown', () => {
  test.each([
    [12, 'Faltan 12 días'],
    [2, 'Faltan 2 días'],
    [1, 'Falta 1 día'],
    [0, 'Vence hoy'],
    [-1, 'Venció ayer'],
    [-3, 'Venció hace 3 días'],
  ])('%i → %s', (days, text) => {
    expect(describeCountdown(days)).toBe(text);
  });
});

// 19/02/2027 a las 12:00 en Buenos Aires: faltan 10 días para el 01/03/2027.
const NOW = new Date('2027-02-19T15:00:00.000Z');

describe('ReviewCountdown', () => {
  test('muestra la próxima fecha y cuántos días faltan', () => {
    render(
      <ReviewCountdown
        status="DUE_SOON"
        reviewDate="2027-03-01"
        since="2026-12-01T15:00:00.000Z"
        now={NOW}
      />,
    );

    expect(screen.getByText('Próxima revisión')).toBeInTheDocument();
    expect(screen.getByText('01/03/2027')).toBeInTheDocument();
    expect(screen.getByText('Faltan 10 días')).toBeInTheDocument();
  });

  test('la barra: el color del estado de la API y el ancho por lo que falta (10 de 90 días)', () => {
    const { container } = render(
      <ReviewCountdown
        status="DUE_SOON"
        reviewDate="2027-03-01"
        since="2026-12-01T15:00:00.000Z"
        now={NOW}
      />,
    );

    const bar = container.querySelector('[data-part="bar"]') as HTMLElement;
    expect(bar).toHaveClass('bg-naranja');
    expect(parseFloat(bar.style.width)).toBeCloseTo((10 / 90) * 100, 1);
  });

  test.each([
    ['UP_TO_DATE', 'bg-exito'],
    ['OVERDUE', 'bg-peligro'],
  ] as const)('%s pinta la barra con %s', (status, color) => {
    const { container } = render(
      <ReviewCountdown status={status} reviewDate="2027-03-01" since="2026-12-01T15:00:00.000Z" now={NOW} />,
    );

    expect(container.querySelector('[data-part="bar"]')).toHaveClass(color);
  });

  test('vencida: "Venció hace N días" y siempre queda un poco de barra', () => {
    const { container } = render(
      <ReviewCountdown
        status="OVERDUE"
        reviewDate="2027-02-16"
        since="2026-12-01T15:00:00.000Z"
        now={NOW}
      />,
    );

    expect(screen.getByText('Venció hace 3 días')).toBeInTheDocument();
    expect((container.querySelector('[data-part="bar"]') as HTMLElement).style.width).toBe('6%');
  });
});
