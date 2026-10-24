import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NewVersionForm } from '@/components/documents/NewVersionForm';
import { ApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

const mocks = vi.hoisted(() => ({ uploadVersion: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  uploadVersion: mocks.uploadVersion,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const MB = 1024 * 1024;
const fileOf = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

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
const UPDATED: DocumentResponse = {
  ...DOCUMENT,
  currentVersion: { ...DOCUMENT.currentVersion, id: 'v2', versionNumber: 2, processingStatus: 'PENDING' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadVersion.mockResolvedValue(UPDATED);
});

// applyAccept: false = el usuario elige "Todos los archivos" en el selector del sistema.
const setupUser = () => userEvent.setup({ applyAccept: false });
const fileInput = () => screen.getByLabelText('Archivo') as HTMLInputElement;
const dateInput = () =>
  screen.getByLabelText('Nueva fecha de revisión (opcional)') as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: /Subir versión|Cargando…/ });

function renderForm(onDone = vi.fn()) {
  render(<NewVersionForm document={DOCUMENT} onDone={onDone} />);
  return onDone;
}

async function chooseAndSubmit(user: ReturnType<typeof setupUser>, file = fileOf('manual v2.pdf', 2 * MB)) {
  await user.upload(fileInput(), file);
  await user.click(submitButton());
  return file;
}

describe('NewVersionForm (spec 003, R6 a R9; plan 003, 6.3)', () => {
  test('la fecha es opcional y muestra la actual como ayuda', () => {
    renderForm();

    expect(dateInput()).toHaveAccessibleDescription('Fecha actual: 01/03/2027');
  });

  test('E2: con un PDF válido llama a uploadVersion sin fecha y avisa al detalle', async () => {
    const user = setupUser();
    const onDone = renderForm();

    const file = await chooseAndSubmit(user);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(UPDATED));
    expect(mocks.uploadVersion).toHaveBeenCalledWith(ID, { file, reviewDate: '' });
  });

  test('E4: con fecha la manda', async () => {
    const user = setupUser();
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2030-01-15' } });
    const file = await chooseAndSubmit(user);

    await waitFor(() =>
      expect(mocks.uploadVersion).toHaveBeenCalledWith(ID, { file, reviewDate: '2030-01-15' }),
    );
  });

  test('una fecha de hoy o anterior no se envía', async () => {
    const user = setupUser();
    renderForm();

    fireEvent.change(dateInput(), { target: { value: '2020-01-01' } });
    await chooseAndSubmit(user);

    expect(
      await screen.findByText('La fecha de revisión tiene que ser a partir de mañana.'),
    ).toBeInTheDocument();
    expect(mocks.uploadVersion).not.toHaveBeenCalled();
    expect(dateInput()).toHaveAttribute('min', tomorrowIn(COMPANY_TIME_ZONE, new Date()));
  });

  test('sin archivo: "Elegí un archivo." y no envía', async () => {
    const user = setupUser();
    renderForm();

    await user.click(submitButton());

    expect(await screen.findByText('Elegí un archivo.')).toBeInTheDocument();
    expect(mocks.uploadVersion).not.toHaveBeenCalled();
  });

  test('un .docx muestra el error al elegirlo y no se envía', async () => {
    const user = setupUser();
    renderForm();

    await user.upload(fileInput(), fileOf('manual.docx'));

    expect(screen.getByText('El archivo tiene que ser PDF, .txt o .md.')).toBeInTheDocument();
    await user.click(submitButton());
    expect(mocks.uploadVersion).not.toHaveBeenCalled();
  });

  describe('errores de la API: el archivo sigue elegido', () => {
    async function submitWithError(error: ApiError) {
      mocks.uploadVersion.mockRejectedValue(error);
      const user = setupUser();
      const onDone = renderForm();
      const file = await chooseAndSubmit(user);
      return { onDone, file };
    }

    test('E3: 409 IDENTICAL_TO_CURRENT', async () => {
      const { onDone, file } = await submitWithError(
        new ApiError(409, ['x'], undefined, 'IDENTICAL_TO_CURRENT'),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este archivo es igual a la versión vigente.',
      );
      expect(fileInput().files?.[0]).toBe(file);
      expect(screen.getByText('manual v2.pdf')).toBeInTheDocument();
      expect(onDone).not.toHaveBeenCalled();
    });

    test('409 DUPLICATE: el mensaje y el enlace al documento existente', async () => {
      await submitWithError(new ApiError(409, ['x'], OTHER, 'DUPLICATE'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ya existe otro documento con este mismo archivo.',
      );
      expect(screen.getByRole('link', { name: 'Ver el documento existente' })).toHaveAttribute(
        'href',
        `/documentos/${OTHER}`,
      );
    });

    test('409 CONCURRENT_VERSION: recargar y volver a intentar', async () => {
      await submitWithError(new ApiError(409, ['x'], undefined, 'CONCURRENT_VERSION'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Otra persona subió una versión al mismo tiempo.',
      );
    });

    test('E5: 503 → "Probá de nuevo en unos minutos" y el mismo archivo sigue en el campo', async () => {
      const { file } = await submitWithError(new ApiError(503, ['Service Unavailable']));

      expect(await screen.findByRole('alert')).toHaveTextContent('Probá de nuevo en unos minutos');
      expect(fileInput().files?.[0]).toBe(file);
      expect(submitButton()).toBeEnabled();
    });

    test('415: el error va junto al archivo', async () => {
      await submitWithError(new ApiError(415, ['Solo se aceptan archivos PDF, .txt o .md']));

      expect(
        await screen.findByText('El archivo no es un PDF, .txt o .md válido.'),
      ).toBeInTheDocument();
      expect(fileInput()).toHaveAttribute('aria-invalid', 'true');
    });
  });

  test('dos envíos juntos → una sola llamada, con "Cargando…" mientras espera (F5 del plan 002)', async () => {
    let resolve: (value: DocumentResponse) => void = () => {};
    mocks.uploadVersion.mockReturnValue(new Promise((done) => (resolve = done)));
    const user = setupUser();
    renderForm();

    await user.upload(fileInput(), fileOf('manual v2.pdf', 2 * MB));
    await user.dblClick(submitButton());

    expect(mocks.uploadVersion).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Cargando…');
    resolve(UPDATED);
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });
});
