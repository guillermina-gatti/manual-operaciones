import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ReviewStatusBadge } from '@/components/documents/ReviewStatusBadge';

// Spec 005, F1: "Vencido" y "Vence pronto", siempre con la palabra; "Al día" no lleva etiqueta.
describe('ReviewStatusBadge (F1)', () => {
  test('OVERDUE → "Vencido"', () => {
    render(<ReviewStatusBadge status="OVERDUE" />);

    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  test('DUE_SOON → "Vence pronto"', () => {
    render(<ReviewStatusBadge status="DUE_SOON" />);

    expect(screen.getByText('Vence pronto')).toBeInTheDocument();
  });

  test.each(['UP_TO_DATE', null, undefined] as const)('%s → no muestra nada', (status) => {
    const { container } = render(<ReviewStatusBadge status={status} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('vencido y por vencer tienen colores distintos, pero se distinguen por el texto', () => {
    render(
      <>
        <ReviewStatusBadge status="OVERDUE" />
        <ReviewStatusBadge status="DUE_SOON" />
      </>,
    );

    const overdue = screen.getByText('Vencido');
    const dueSoon = screen.getByText('Vence pronto');
    expect(overdue.className).toMatch(/red/);
    expect(dueSoon.className).toMatch(/amber/);
  });
});
