import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CompareResult } from '@/components/procedures/CompareResult';
import type { VersionComparison } from '@/lib/api/procedure-versions';

const step = (id: string, order: number, title: string, description = '') => ({ id, order, title, description });

const comparison = (overrides: Partial<VersionComparison> = {}): VersionComparison => ({
  from: { id: 'v1', versionNumber: 1, status: 'SUPERSEDED' },
  to: { id: 'v2', versionNumber: 2, status: 'PUBLISHED' },
  added: [],
  removed: [],
  modified: [],
  unchanged: 0,
  ...overrides,
});

const group = (name: string) => screen.getByRole('region', { name });

describe('CompareResult (spec 015, R10)', () => {
  test('says which two versions were compared', () => {
    render(<CompareResult comparison={comparison({ unchanged: 1 })} />);

    expect(screen.getByText('De la versión 1 (reemplazada) a la versión 2 (publicada)')).toBeInTheDocument();
  });

  test('E12: lists the added, the removed and the modified steps, each with how many', () => {
    render(
      <CompareResult
        comparison={comparison({
          added: [step('s4', 3, 'Guardar el arqueo')],
          removed: [step('s3', 3, 'Cerrar la caja')],
          modified: [
            {
              before: step('s2', 2, 'Comparar'),
              after: step('s5', 2, 'Comparar', 'Con el reporte'),
              changedFields: ['description'],
            },
          ],
          unchanged: 1,
        })}
      />,
    );

    expect(within(group('Agregados · 1')).getByText('Guardar el arqueo')).toBeInTheDocument();
    expect(within(group('Quitados · 1')).getByText('Cerrar la caja')).toBeInTheDocument();
    const modified = group('Modificados · 1');
    expect(within(modified).getByText('Comparar')).toBeInTheDocument();
    expect(within(modified).getByText('Cambió la descripción')).toBeInTheDocument();
    expect(screen.getByText('1 paso sin cambios')).toBeInTheDocument();
  });

  test('E13: a step that only moved says from which place to which', () => {
    render(
      <CompareResult
        comparison={comparison({
          modified: [{ before: step('s1', 1, 'Contar'), after: step('s1', 2, 'Contar'), changedFields: ['order'] }],
        })}
      />,
    );

    expect(screen.getByText('Cambió de lugar: de la posición 1 a la 2')).toBeInTheDocument();
  });

  test('a group with nothing in it is not shown', () => {
    render(<CompareResult comparison={comparison({ added: [step('s4', 1, 'Guardar')], unchanged: 2 })} />);

    expect(screen.queryByRole('region', { name: /^Quitados/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Modificados/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 pasos sin cambios')).toBeInTheDocument();
  });

  test('without differences it says the versions have the same steps', () => {
    render(<CompareResult comparison={comparison({ unchanged: 3 })} />);

    expect(screen.getByText('Las dos versiones tienen los mismos pasos.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
