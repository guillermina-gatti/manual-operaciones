import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureAreasForm } from '@/components/procedures/ProcedureAreasForm';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { AREAS } from '../../support/procedure-areas';
import { ARCHIVO, OPERACIONES, PROCEDURE_ID, VENTAS, stored } from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  listAreas: vi.fn(),
  setAreas: vi.fn(),
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  setAreas: mocks.setAreas,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAreas.mockResolvedValue(AREAS);
  mocks.setAreas.mockImplementation((_id: string, areaIds: string[]) => Promise.resolve({ areaIds }));
});

async function renderForm(areaIds: string[], onChange = vi.fn()) {
  render(<ProcedureAreasForm procedure={stored({ areaIds })} onChange={onChange} />);
  await screen.findByRole('group', { name: 'Áreas' });
  return onChange;
}

describe('the areas', () => {
  test('shows the active areas, and the inactive one with "(inactiva)" if the procedure already had it', async () => {
    await renderForm([VENTAS, ARCHIVO]);

    expect(screen.getByRole('checkbox', { name: 'Ventas' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Archivo (inactiva)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Operaciones' })).not.toBeChecked();
  });

  test('an inactive area the procedure did not have cannot be chosen', async () => {
    await renderForm([VENTAS]);

    expect(screen.queryByRole('checkbox', { name: /Archivo/ })).not.toBeInTheDocument();
  });
});

describe('saving', () => {
  test('sends the chosen areas and gives the new copy to the screen', async () => {
    const onChange = await renderForm([VENTAS]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Operaciones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar áreas' }));

    // In the order of the list of areas.
    expect(mocks.setAreas).toHaveBeenCalledWith(PROCEDURE_ID, [OPERACIONES, VENTAS]);
    expect(await screen.findByRole('status')).toHaveTextContent('Áreas guardadas.');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ areaIds: [OPERACIONES, VENTAS] }));
  });

  test('400 shows the message, and nothing is given to the screen', async () => {
    mocks.setAreas.mockRejectedValue(new ApiError(400, ['Alguna de las áreas está inactiva']));
    const onChange = await renderForm([VENTAS]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Operaciones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar áreas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.areaNotAssignable);
    expect(onChange).not.toHaveBeenCalled();
  });
});
