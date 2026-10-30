import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MarkReviewedForm } from '@/components/documents/MarkReviewedForm';
import { ApiError } from '@/lib/api';
import type { DocumentResponse } from '@/lib/api';
import { AREA_IDS, FIXTURE_USERS } from '@/lib/directory/fixtures';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

const mocks = vi.hoisted(() => ({ markReviewed: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  markReviewed: mocks.markReviewed,
}));

const ID = '11111111-1111-4111-8111-111111111111';
// Una fecha válida en cualquier día que corra el test: lejos en el futuro.
const FAR = '2099-05-09';

const REVIEWED: DocumentResponse = {
  id: ID,
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [AREA_IDS.ventas],
  ownerId: FIXTURE_USERS.empleadoVentas.id,
  reviewDate: FAR,
  createdById: FIXTURE_USERS.admin.id,
  createdAt: '2026-10-20T15:00:00.000Z',
  archivedAt: null,
  review: {
    status: 'UP_TO_DATE',
    lastReviewedAt: '2026-11-10T02:30:00.000Z',
    lastReviewedById: FIXTURE_USERS.empleadoVentas.id,
  },
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    status: 'CURRENT',
    originalFileName: 'manual.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    processingStatus: 'READY',
    createdAt: '2026-10-20T15:00:00.000Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markReviewed.mockResolvedValue(REVIEWED);
});

const onDone = vi.fn();
const renderForm = () => render(<MarkReviewedForm documentId={ID} onDone={onDone} />);
const dateInput = () => screen.getByLabelText('Próxima fecha de revisión') as HTMLInputElement;
const submitButton = () => screen.getByRole('button', { name: /Marcar como revisado|Guardando…/ });
// El <input type="date"> recibe el valor completo, como al elegirlo en el calendario.
const chooseDate = (value: string) => fireEvent.change(dateInput(), { target: { value } });

describe('MarkReviewedForm (F4)', () => {
  test('la fecha es obligatoria, con el mínimo en mañana en Buenos Aires (R7)', () => {
    renderForm();

    expect(dateInput()).toHaveAttribute('type', 'date');
    expect(dateInput()).toHaveAttribute('min', tomorrowIn(COMPANY_TIME_ZONE, new Date()));
    expect(dateInput()).toHaveValue('');
  });

  test('vacía: el aviso junto al campo y ningún pedido', async () => {
    renderForm();

    await userEvent.click(submitButton());

    expect(dateInput()).toHaveAccessibleDescription('Elegí la próxima fecha de revisión.');
    expect(mocks.markReviewed).not.toHaveBeenCalled();
  });

  test('antes de mañana: el aviso de la fecha y ningún pedido', async () => {
    renderForm();
    chooseDate('2020-01-01');

    await userEvent.click(submitButton());

    expect(dateInput()).toHaveAccessibleDescription(
      'La fecha de revisión tiene que ser a partir de mañana.',
    );
    expect(mocks.markReviewed).not.toHaveBeenCalled();
  });

  test('E8: con una fecha válida, la manda y avisa con el documento actualizado', async () => {
    renderForm();
    chooseDate(FAR);

    await userEvent.click(submitButton());

    expect(mocks.markReviewed).toHaveBeenCalledWith(ID, FAR);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(REVIEWED));
  });

  test('E9: 400 de la API → el error junto al campo y la fecha sigue elegida (F5)', async () => {
    mocks.markReviewed.mockRejectedValue(
      new ApiError(400, ['reviewDate tiene que ser posterior a hoy (2099-05-08)']),
    );
    renderForm();
    chooseDate(FAR);

    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(dateInput()).toHaveAccessibleDescription(
        'La fecha de revisión tiene que ser a partir de mañana.',
      ),
    );
    expect(dateInput()).toHaveValue(FAR);
    expect(onDone).not.toHaveBeenCalled();
  });

  test.each([
    [new ApiError(403, ['Forbidden']), 'No tenés permiso para marcar este documento como revisado.'],
    [
      new ApiError(409, ['El documento está archivado'], undefined, 'ARCHIVED'),
      'El documento fue archivado. Ya no se puede modificar.',
    ],
    [
      new ApiError(503, ['Service Unavailable']),
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    ],
  ])('E10, E11 y 503: %s → su mensaje, sin perder la fecha (F5)', async (error, message) => {
    mocks.markReviewed.mockRejectedValue(error);
    renderForm();
    chooseDate(FAR);

    await userEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(dateInput()).toHaveValue(FAR);
  });

  test('dos clics juntos → un solo pedido, con "Guardando…" mientras espera', async () => {
    let resolve: (value: DocumentResponse) => void = () => {};
    mocks.markReviewed.mockReturnValue(new Promise((done) => (resolve = done)));
    renderForm();
    chooseDate(FAR);

    await userEvent.dblClick(submitButton());

    expect(mocks.markReviewed).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Guardando…');
    resolve(REVIEWED);
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });
});
