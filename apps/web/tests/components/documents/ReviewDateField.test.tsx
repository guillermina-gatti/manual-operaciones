import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ReviewDateField } from '@/components/documents/ReviewDateField';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

// Hace de formulario: guarda el valor como lo hacen UploadDocumentForm y NewVersionForm.
function Harness(props: { optional?: boolean; currentDate?: string; error?: string }) {
  const [value, setValue] = useState('');
  return <ReviewDateField {...props} value={value} onChange={setValue} />;
}

describe('ReviewDateField (spec 003, R7b; plan 003, 6.3)', () => {
  test('obligatorio: la etiqueta de la carga y el mínimo en mañana en Buenos Aires', () => {
    render(<Harness />);

    const input = screen.getByLabelText('Fecha de revisión');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('min', tomorrowIn(COMPANY_TIME_ZONE, new Date()));
  });

  test('opcional: dice "(opcional)" y muestra la fecha actual como ayuda, asociada al campo', () => {
    render(<Harness optional currentDate="2027-03-01" />);

    const input = screen.getByLabelText('Nueva fecha de revisión (opcional)');
    expect(input).toHaveAttribute('min', tomorrowIn(COMPANY_TIME_ZONE, new Date()));
    expect(input).toHaveAccessibleDescription('Fecha actual: 01/03/2027');
  });

  test('el error queda asociado al campo y lo marca inválido', () => {
    render(<Harness error="La fecha de revisión tiene que ser a partir de mañana." />);

    const input = screen.getByLabelText('Fecha de revisión');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'La fecha de revisión tiene que ser a partir de mañana.',
    );
  });

  test('opcional y con error: la descripción tiene la ayuda y el error', () => {
    render(<Harness optional currentDate="2027-03-01" error="Revisá la fecha." />);

    expect(screen.getByLabelText('Nueva fecha de revisión (opcional)')).toHaveAccessibleDescription(
      'Fecha actual: 01/03/2027 Revisá la fecha.',
    );
  });

  test('sin error no marca el campo', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Fecha de revisión')).not.toHaveAttribute('aria-invalid');
  });

  test('avisa cada cambio con el valor YYYY-MM-DD', async () => {
    const onChange = vi.fn();
    render(<ReviewDateField value="" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Fecha de revisión'), '2027-05-01');

    expect(onChange).toHaveBeenLastCalledWith('2027-05-01');
  });
});
