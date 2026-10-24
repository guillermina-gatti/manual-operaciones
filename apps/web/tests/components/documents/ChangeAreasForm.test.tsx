import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChangeAreasForm } from '@/components/documents/ChangeAreasForm';
import { ApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';

const mocks = vi.hoisted(() => ({
  changeAreas: vi.fn(),
  listAreas: vi.fn(),
  listOwnerCandidates: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  changeAreas: mocks.changeAreas,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
  usersDirectory: { listOwnerCandidates: mocks.listOwnerCandidates, getNames: vi.fn() },
}));

const ID = '11111111-1111-4111-8111-111111111111';

// Un documento de Ventas con el supervisor de Ventas como responsable.
const DOCUMENT: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.supervisorVentas.id,
  reviewDate: '2027-03-01',
  createdById: FIXTURE_USERS.admin.id,
  createdAt: '2026-10-23T15:00:00.000Z',
  archivedAt: null,
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    status: 'CURRENT',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2097152,
    processingStatus: 'READY',
    createdAt: '2026-10-23T15:00:00.000Z',
  },
};

const areas = createFakeAreasDirectory({ delayMs: 0 });
const users = createFakeUsersDirectory({ delayMs: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAreas.mockImplementation(() => areas.listAreas());
  mocks.listOwnerCandidates.mockImplementation((ids: string[]) => users.listOwnerCandidates(ids));
  mocks.changeAreas.mockImplementation((_id: string, values: { areaIds: string[] }) =>
    Promise.resolve({ ...DOCUMENT, areaIds: values.areaIds }),
  );
});

const ownerSelect = () => screen.getByRole('combobox', { name: 'Responsable' }) as HTMLSelectElement;
const saveButton = () => screen.getByRole('button', { name: /Guardar áreas|Guardando…/ });
const checkbox = (name: string) => screen.getByRole('checkbox', { name });

async function renderForm(document: DocumentResponse = DOCUMENT, onDone = vi.fn()) {
  render(<ChangeAreasForm document={document} onDone={onDone} />);
  await screen.findByRole('group', { name: 'Áreas' });
  await waitFor(() => expect(ownerSelect()).toBeEnabled());
  return onDone;
}

// Desmarca Ventas y marca Operaciones.
async function moveToOperaciones(user: ReturnType<typeof userEvent.setup>) {
  await user.click(checkbox('Ventas'));
  await user.click(checkbox('Operaciones'));
}

describe('ChangeAreasForm (spec 003, R3 a R5; plan 003, 6.2)', () => {
  test('empieza con las áreas y el responsable actuales', async () => {
    await renderForm();

    expect(checkbox('Ventas')).toBeChecked();
    expect(checkbox('Operaciones')).not.toBeChecked();
    expect(ownerSelect().value).toBe(FIXTURE_USERS.supervisorVentas.id);
  });

  test('E1: pasa a Operaciones con un responsable nuevo y avisa al detalle con el documento', async () => {
    const user = userEvent.setup();
    const onDone = await renderForm();

    await moveToOperaciones(user);
    await waitFor(() => expect(ownerSelect().value).toBe(''));
    await user.selectOptions(ownerSelect(), FIXTURE_USERS.supervisorOperaciones.id);
    await user.click(saveButton());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mocks.changeAreas).toHaveBeenCalledWith(ID, {
      areaIds: [AREA_IDS.operaciones],
      ownerId: FIXTURE_USERS.supervisorOperaciones.id,
    });
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, areaIds: [AREA_IDS.operaciones] }),
    );
  });

  test('E6: el responsable de Ventas se borra con el aviso y no se puede enviar sin elegir otro', async () => {
    const user = userEvent.setup();
    await renderForm();

    await moveToOperaciones(user);

    expect(
      await screen.findByText('El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro'),
    ).toBeInTheDocument();
    expect(ownerSelect().value).toBe('');

    await user.click(saveButton());

    expect(await screen.findByText('Elegí un responsable.')).toBeInTheDocument();
    expect(mocks.changeAreas).not.toHaveBeenCalled();
  });

  test('con el mismo responsable válido, no manda ownerId', async () => {
    const user = userEvent.setup();
    await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id });

    await moveToOperaciones(user);
    await user.click(saveButton());

    await waitFor(() => expect(mocks.changeAreas).toHaveBeenCalledTimes(1));
    expect(mocks.changeAreas).toHaveBeenCalledWith(ID, { areaIds: [AREA_IDS.operaciones] });
  });

  test('sin áreas: "Elegí al menos un área." y no envía', async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.click(checkbox('Ventas'));
    await user.click(saveButton());

    expect(await screen.findByText('Elegí al menos un área.')).toBeInTheDocument();
    expect(mocks.changeAreas).not.toHaveBeenCalled();
  });

  describe('errores de la API, sin perder lo elegido', () => {
    async function submitOperacionesWithError(error: ApiError) {
      mocks.changeAreas.mockRejectedValue(error);
      const user = userEvent.setup();
      const onDone = await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id });
      await moveToOperaciones(user);
      await user.click(saveButton());
      return onDone;
    }

    test('400 ownerId: el error va junto al responsable', async () => {
      await submitOperacionesWithError(
        new ApiError(400, ['ownerId: el responsable no comparte ningún área con el documento']),
      );

      expect(
        await screen.findByText(
          'El responsable tiene que pertenecer a alguna de las áreas elegidas, o ser administrador.',
        ),
      ).toBeInTheDocument();
      expect(ownerSelect()).toHaveAttribute('aria-invalid', 'true');
    });

    test('409 ARCHIVED: su mensaje', async () => {
      const onDone = await submitOperacionesWithError(
        new ApiError(409, ['El documento está archivado'], undefined, 'ARCHIVED'),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El documento fue archivado. Ya no se puede modificar.',
      );
      expect(onDone).not.toHaveBeenCalled();
    });

    test('503: el mensaje y lo elegido sigue igual', async () => {
      await submitOperacionesWithError(new ApiError(503, ['Service Unavailable']));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Probá de nuevo en unos minutos',
      );
      expect(checkbox('Ventas')).not.toBeChecked();
      expect(checkbox('Operaciones')).toBeChecked();
      expect(ownerSelect().value).toBe(FIXTURE_USERS.admin.id);
      expect(saveButton()).toBeEnabled();
    });
  });

  test('dos envíos juntos → una sola llamada, con el botón deshabilitado mientras espera', async () => {
    let resolve: (value: DocumentResponse) => void = () => {};
    mocks.changeAreas.mockReturnValue(new Promise((done) => (resolve = done)));
    const user = userEvent.setup();
    await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id });

    await moveToOperaciones(user);
    await user.dblClick(saveButton());

    expect(mocks.changeAreas).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Guardando…');
    resolve(DOCUMENT);
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});
