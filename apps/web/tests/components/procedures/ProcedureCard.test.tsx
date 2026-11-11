import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ProcedureCard } from '@/components/procedures/ProcedureCard';
import { PROCEDURE_ID } from '../../support/procedures';
import { OPERACIONES_AREA, VENTAS_AREA, listItem } from '../../support/procedure-view';

// Spec 006, W4 (E44): what the card of a procedure in the list says.
describe('ProcedureCard', () => {
  test('says the title, the version and its state, and the steps', () => {
    const procedure = listItem({
      version: { ...listItem().version, versionNumber: 2, stepCount: 3 },
    });

    render(<ProcedureCard procedure={procedure} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeInTheDocument();
    expect(screen.getByText('Versión 2 · publicada')).toBeInTheDocument();
    expect(screen.getByText('3 pasos')).toBeInTheDocument();
  });

  test.each([
    ['DRAFT', 'Versión 2 · borrador'],
    ['PUBLISHED', 'Versión 2 · publicada'],
    ['SUPERSEDED', 'Versión 2 · reemplazada'],
  ] as const)('a %s version says "%s", the same text as the editor', (status, text) => {
    const version = { ...listItem().version, versionNumber: 2, status };

    render(<ProcedureCard procedure={listItem({ version })} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('says "1 paso" for one and "sin pasos" for none', () => {
    const one = listItem({ version: { ...listItem().version, stepCount: 1 } });
    const none = listItem({ version: { ...listItem().version, stepCount: 0 } });

    const { rerender } = render(<ProcedureCard procedure={one} />);
    expect(screen.getByText('1 paso')).toBeInTheDocument();
    rerender(<ProcedureCard procedure={none} />);

    expect(screen.getByText('sin pasos')).toBeInTheDocument();
  });

  test('shows each area as a chip with its name', () => {
    render(<ProcedureCard procedure={listItem({ areas: [OPERACIONES_AREA, VENTAS_AREA] })} />);

    const areas = within(screen.getByRole('term').parentElement as HTMLElement);
    expect(screen.getByRole('term')).toHaveTextContent('Áreas');
    expect(areas.getByText('Operaciones')).toBeInTheDocument();
    expect(areas.getByText('Ventas')).toBeInTheDocument();
  });

  test('marks a deactivated area, which only an ADMIN receives', () => {
    const areas = [{ ...VENTAS_AREA, isActive: false }];

    render(<ProcedureCard procedure={listItem({ areas })} />);

    expect(screen.getByText('Ventas (inactiva)')).toBeInTheDocument();
  });

  test('the title is the only link, and goes to the detail', () => {
    render(<ProcedureCard procedure={listItem()} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Cierre de caja');
    expect(links[0]).toHaveAttribute('href', `/procedimientos/${PROCEDURE_ID}`);
  });

  test('says "borrador" for a procedure that was never published, and when it has an open draft', () => {
    const draft = listItem({
      version: { ...listItem().version, status: 'DRAFT' },
      hasOpenDraft: true,
    });

    render(<ProcedureCard procedure={draft} />);

    expect(screen.getByText('Versión 1 · borrador')).toBeInTheDocument();
    expect(screen.getByText('Borrador abierto')).toBeInTheDocument();
  });

  test('does not say "Borrador abierto" when the API does not say so', () => {
    render(<ProcedureCard procedure={listItem()} />);

    expect(screen.queryByText('Borrador abierto')).not.toBeInTheDocument();
  });
});
