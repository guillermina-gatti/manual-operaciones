import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VersionReadOnly } from '@/components/procedures/VersionReadOnly';
import { ApiError } from '@/lib/api';
import { PROCEDURE_ID } from '../../support/procedures';
import { V1, versionDetail } from '../../support/versions';

const mocks = vi.hoisted(() => ({ getVersion: vi.fn() }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  getVersion: mocks.getVersion,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVersion.mockResolvedValue(versionDetail());
});

const setup = () => render(<VersionReadOnly procedureId={PROCEDURE_ID} versionId={V1} />);

describe('VersionReadOnly (spec 015, R6 and R9)', () => {
  test('asks for that version of that procedure', async () => {
    setup();

    await screen.findByRole('heading', { level: 2, name: 'Versión 1 · Publicada' });

    expect(mocks.getVersion).toHaveBeenCalledWith(PROCEDURE_ID, V1, expect.any(AbortSignal));
  });

  test('shows the description and the steps in order, and says it cannot be changed', async () => {
    setup();

    const steps = await screen.findByRole('list', { name: 'Pasos' });

    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Contar el efectivo'),
      expect.stringContaining('Comparar con el sistema'),
    ]);
    expect(screen.getByText('Al final del turno')).toBeInTheDocument();
    expect(screen.getByText('Esta versión ya no se puede modificar.')).toBeInTheDocument();
  });

  test('has nothing to edit: no fields and no buttons', async () => {
    setup();
    await screen.findByRole('list', { name: 'Pasos' });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('a superseded version is named by its state', async () => {
    mocks.getVersion.mockResolvedValue(versionDetail({ status: 'SUPERSEDED', versionNumber: 1 }));
    setup();

    expect(await screen.findByRole('heading', { level: 2, name: 'Versión 1 · Reemplazada' })).toBeInTheDocument();
  });

  test('while it loads it says so for screen readers', () => {
    mocks.getVersion.mockReturnValue(new Promise(() => {}));
    setup();

    expect(screen.getByRole('status')).toHaveTextContent('Cargando la versión…');
  });

  test('on an error it says what happened and lets try again', async () => {
    mocks.getVersion.mockRejectedValueOnce(new ApiError(503));
    setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la versión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Pasos' })).toBeInTheDocument();
  });
});
