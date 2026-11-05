// Barra de frescura del detalle (diseño pispIAr). Los días se cuentan con "hoy" en Buenos Aires, como
// la API; cada test pasa una fecha fija, así no depende de la hora en que corre.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { FreshnessBar, daysUntilReview } from '@/components/documents/design';

// 4/11/2026 a las 23:30 en Buenos Aires: en UTC ya es 5/11.
const LATE_NIGHT = new Date('2026-11-05T02:30:00.000Z');
// 4/11/2026 al mediodía en Buenos Aires.
const NOON = new Date('2026-11-04T15:00:00.000Z');

describe('daysUntilReview', () => {
  test('cuenta desde el día de Buenos Aires, no desde el de UTC', () => {
    expect(daysUntilReview('2026-11-08', LATE_NIGHT)).toBe(4);
    expect(daysUntilReview('2026-11-08', NOON)).toBe(4);
  });

  test('hoy da 0 y una fecha pasada da negativo', () => {
    expect(daysUntilReview('2026-11-04', NOON)).toBe(0);
    expect(daysUntilReview('2026-11-01', NOON)).toBe(-3);
  });

  test('cruza fin de año', () => {
    expect(daysUntilReview('2027-01-02', new Date('2026-12-31T15:00:00.000Z'))).toBe(2);
  });
});

describe('FreshnessBar', () => {
  const since = '2026-10-01T15:00:00.000Z';

  test('al día: "Revisar en N días" y barra verde', () => {
    const { container } = render(
      <FreshnessBar status="UP_TO_DATE" reviewDate="2026-11-08" since={since} now={NOON} />,
    );
    expect(screen.getByText('Frescura')).toBeInTheDocument();
    expect(screen.getByText('Revisar en 4 días')).toBeInTheDocument();
    expect(container.querySelector('.bg-exito')).not.toBeNull();
  });

  test('el color sale del estado de la API, no de los días', () => {
    const { container } = render(
      <FreshnessBar status="DUE_SOON" reviewDate="2026-12-31" since={since} now={NOON} />,
    );
    expect(container.querySelector('.bg-naranja')).not.toBeNull();
    expect(container.querySelector('.bg-exito')).toBeNull();
  });

  test('hoy y mañana', () => {
    const { rerender } = render(
      <FreshnessBar status="DUE_SOON" reviewDate="2026-11-04" since={since} now={NOON} />,
    );
    expect(screen.getByText('Revisar hoy')).toBeInTheDocument();
    rerender(<FreshnessBar status="DUE_SOON" reviewDate="2026-11-05" since={since} now={NOON} />);
    expect(screen.getByText('Revisar mañana')).toBeInTheDocument();
  });

  test('vencido: dice hace cuánto pasó la fecha, sin repetir la etiqueta "Vencido"', () => {
    const { container } = render(
      <FreshnessBar status="OVERDUE" reviewDate="2026-11-01" since={since} now={NOON} />,
    );
    expect(screen.getByText('La fecha pasó hace 3 días')).toBeInTheDocument();
    expect(screen.queryByText(/Vencido/)).not.toBeInTheDocument();
    expect(container.querySelector('.bg-peligro')).not.toBeNull();
  });
});
