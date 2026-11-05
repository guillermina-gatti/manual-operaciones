import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChangeAreasForm } from '@/components/documents/ChangeAreasForm';
import { ApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { createFakeAreasDirectory } from '@/lib/directory/fake-areas-directory';
import { createFakeUsersDirectory } from '@/lib/directory/fake-users-directory';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import { areaRef, personRef, referencesOf } from '../../support/documents';

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
  ...referencesOf(FIXTURE_USERS.supervisorVentas.id, [AREA_IDS.ventas]),
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
    await waitFor(() =>
      expect(within(ownerSelect()).getByRole('option', { name: /Emilio/ })).toBeInTheDocument(),
    );
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

  // Spec 008 (P5, F4): antes el formulario borraba al responsable actual (E6 de la spec 003). Ahora
  // lo conserva y es la API la que rechaza si perdió el acceso (R6); el error queda en el campo.
  test('E6 y spec 008, E16: el responsable actual no se borra; el 400 de la API queda en el campo', async () => {
    mocks.changeAreas.mockRejectedValue(
      new ApiError(400, ['ownerId: el responsable no comparte ningún área con el documento']),
    );
    const user = userEvent.setup();
    await renderForm();

    await moveToOperaciones(user);
    await waitFor(() =>
      expect(within(ownerSelect()).getByRole('option', { name: /Emilio/ })).toBeInTheDocument(),
    );
    expect(ownerSelect().value).toBe(FIXTURE_USERS.supervisorVentas.id);
    expect(
      screen.queryByText('El responsable elegido no tiene acceso a las áreas nuevas. Elegí otro'),
    ).not.toBeInTheDocument();

    await user.click(saveButton());

    expect(mocks.changeAreas).toHaveBeenCalledWith(ID, { areaIds: [AREA_IDS.operaciones] });
    expect(
      await screen.findByText(
        'El responsable tiene que pertenecer a alguna de las áreas elegidas, o ser administrador.',
      ),
    ).toBeInTheDocument();
    expect(ownerSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(ownerSelect().value).toBe(FIXTURE_USERS.supervisorVentas.id);
  });

  describe('spec 008: responsable inactivo y áreas inactivas', () => {
    const COMPRAS = '0a000000-0000-4000-8000-000000000003';
    const ANA = '0b000000-0000-4000-8000-000000000098';
    // Un documento de Ventas y Compras (inactiva), con una responsable inactiva.
    const WITH_INACTIVE: DocumentResponse = {
      ...DOCUMENT,
      areaIds: [AREA_IDS.ventas, COMPRAS],
      areas: [areaRef(AREA_IDS.ventas), { id: COMPRAS, name: 'Compras', isActive: false }],
      ownerId: ANA,
      owner: { id: ANA, name: 'Ana Pérez', isActive: false },
    };

    beforeEach(async () => {
      const catalog = await areas.listAreas();
      mocks.listAreas.mockResolvedValue([...catalog, { id: COMPRAS, name: 'Compras', isActive: false }]);
    });

    test('E19: la responsable inactiva aparece elegida y, sin cambiarla, no se manda ownerId', async () => {
      const user = userEvent.setup();
      await renderForm(WITH_INACTIVE);

      expect(ownerSelect().value).toBe(ANA);
      expect(within(ownerSelect()).getByRole('option', { name: 'Ana Pérez (inactivo)' })).toBeInTheDocument();

      await user.click(checkbox('Operaciones'));
      await waitFor(() =>
        expect(within(ownerSelect()).getByRole('option', { name: /Emilio/ })).toBeInTheDocument(),
      );
      expect(ownerSelect().value).toBe(ANA);
      await user.click(saveButton());

      await waitFor(() => expect(mocks.changeAreas).toHaveBeenCalledTimes(1));
      expect(mocks.changeAreas).toHaveBeenCalledWith(ID, {
        areaIds: [AREA_IDS.ventas, AREA_IDS.operaciones, COMPRAS],
      });
    });

    test('E20: elegir un candidato activo manda el ownerId nuevo', async () => {
      const user = userEvent.setup();
      await renderForm(WITH_INACTIVE);

      await user.selectOptions(ownerSelect(), FIXTURE_USERS.supervisorVentas.id);
      await user.click(saveButton());

      await waitFor(() => expect(mocks.changeAreas).toHaveBeenCalledTimes(1));
      expect(mocks.changeAreas).toHaveBeenCalledWith(ID, {
        areaIds: [AREA_IDS.ventas, COMPRAS],
        ownerId: FIXTURE_USERS.supervisorVentas.id,
      });
    });

    test('E21: los candidatos se piden solo con las áreas activas', async () => {
      await renderForm(WITH_INACTIVE);

      expect(mocks.listOwnerCandidates).toHaveBeenCalledWith([AREA_IDS.ventas]);
      expect(mocks.listOwnerCandidates).not.toHaveBeenCalledWith(expect.arrayContaining([COMPRAS]));
    });

    test('E21: sin áreas activas no pide candidatos, conserva a la responsable y lo explica', async () => {
      const user = userEvent.setup();
      await renderForm(WITH_INACTIVE);
      mocks.listOwnerCandidates.mockClear();

      await user.click(checkbox('Ventas'));

      expect(
        await screen.findByText('Para elegir otro responsable, marcá al menos un área activa'),
      ).toBeInTheDocument();
      expect(ownerSelect().value).toBe(ANA);
      expect(mocks.listOwnerCandidates).not.toHaveBeenCalled();
    });
  });

  test('con el mismo responsable válido, no manda ownerId', async () => {
    const user = userEvent.setup();
    await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id, owner: personRef(FIXTURE_USERS.admin.id) });

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
      const onDone = await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id, owner: personRef(FIXTURE_USERS.admin.id) });
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
    await renderForm({ ...DOCUMENT, ownerId: FIXTURE_USERS.admin.id, owner: personRef(FIXTURE_USERS.admin.id) });

    await moveToOperaciones(user);
    await user.dblClick(saveButton());

    expect(mocks.changeAreas).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Guardando…');
    resolve(DOCUMENT);
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});
