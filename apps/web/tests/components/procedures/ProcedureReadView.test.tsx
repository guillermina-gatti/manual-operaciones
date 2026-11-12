import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureReadView } from '@/components/procedures/ProcedureReadView';
import { ApiError } from '@/lib/api';
import { PROCEDURE_ID } from '../../support/procedures';
import { procedureDetail } from '../../support/procedure-view';

const mocks = vi.hoisted(() => ({
  getProcedure: vi.fn(),
  params: { id: '' } as { id: string },
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  getProcedure: mocks.getProcedure,
}));

vi.mock('next/navigation', () => ({ useParams: () => mocks.params }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: PROCEDURE_ID };
  mocks.getProcedure.mockResolvedValue(procedureDetail());
});

// Spec 006, W5 (E45), W7 (E47) and W9 (E48): the read-only sheet of a procedure.
describe('the sheet', () => {
  test('asks the API for the procedure of the address', async () => {
    render(<ProcedureReadView />);

    await screen.findByRole('heading', { level: 1 });
    expect(mocks.getProcedure).toHaveBeenCalledWith(PROCEDURE_ID, expect.any(AbortSignal));
  });

  test('shows the title, the version, the areas and the description', async () => {
    render(<ProcedureReadView />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' })).toBeVisible();
    expect(screen.getByText('Versión 2 · publicada')).toBeInTheDocument();
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('Operaciones')).toBeInTheDocument();
    expect(screen.getByText('Al final del día')).toBeInTheDocument();
  });

  test('shows the steps numbered, in order, with title and description', async () => {
    render(<ProcedureReadView />);

    const steps = within(await screen.findByRole('list', { name: 'Pasos' })).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveTextContent('1');
    expect(steps[0]).toHaveTextContent('Contar el efectivo');
    expect(steps[0]).toHaveTextContent('Billetes y monedas');
    expect(steps[1]).toHaveTextContent('2');
    expect(steps[1]).toHaveTextContent('Guardar el arqueo');
  });

  test('has nothing to edit: no field and no button', async () => {
    render(<ProcedureReadView />);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('has a link back to the list', async () => {
    render(<ProcedureReadView />);

    expect(await screen.findByRole('link', { name: /Volver a procedimientos/ })).toHaveAttribute(
      'href',
      '/procedimientos',
    );
  });
});

describe('when it is not there', () => {
  test('a 404 says it was not found and links back to the list', async () => {
    mocks.getProcedure.mockRejectedValue(new ApiError(404));

    render(<ProcedureReadView />);

    expect(await screen.findByText('No se encontró el procedimiento')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a procedimientos/ })).toHaveAttribute(
      'href',
      '/procedimientos',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  test('another error offers to retry, and retrying asks again', async () => {
    mocks.getProcedure.mockRejectedValueOnce(new ApiError(503));

    render(<ProcedureReadView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cierre de caja' })).toBeVisible();
    expect(mocks.getProcedure).toHaveBeenCalledTimes(2);
  });

  test('while it loads, it tells screen readers', () => {
    mocks.getProcedure.mockReturnValue(new Promise(() => undefined));

    render(<ProcedureReadView />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el procedimiento…');
  });
});
