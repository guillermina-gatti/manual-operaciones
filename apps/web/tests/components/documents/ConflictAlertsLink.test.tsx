// Spec 011 (T12; F5): el acceso a "Alertas", con la cantidad de abiertas.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConflictAlertsLink } from '@/components/documents/ConflictAlertsLink';
import { ApiError } from '@/lib/api';

const mocks = vi.hoisted(() => ({ listConflictAlerts: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listConflictAlerts: mocks.listConflictAlerts,
}));

const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const counts = (openTotal: number) => ({ data: [], total: openTotal, openTotal, page: 1, limit: 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConflictAlertsLink (F5)', () => {
  test('E11: "Alertas (2)", con su nombre accesible y el enlace', async () => {
    mocks.listConflictAlerts.mockResolvedValue(counts(2));
    render(<ConflictAlertsLink userId={ADMIN_ID} />);

    const link = await screen.findByRole('link', { name: 'Alertas: 2 abiertas' });
    expect(link).toHaveTextContent('Alertas (2)');
    expect(link).toHaveAttribute('href', '/documentos/alertas');
  });

  test('pide solo la cantidad: las abiertas, página 1 con limit=1', async () => {
    mocks.listConflictAlerts.mockResolvedValue(counts(1));
    render(<ConflictAlertsLink userId={ADMIN_ID} />);

    expect(await screen.findByRole('link', { name: 'Alertas: 1 abierta' })).toHaveTextContent('Alertas (1)');
    expect(mocks.listConflictAlerts).toHaveBeenCalledWith('OPEN', 1, 1, expect.any(AbortSignal));
  });

  test('sin abiertas, "Alertas (0)"', async () => {
    mocks.listConflictAlerts.mockResolvedValue(counts(0));
    render(<ConflictAlertsLink userId={ADMIN_ID} />);

    expect(await screen.findByRole('link', { name: 'Alertas: ninguna abierta' })).toHaveTextContent(
      'Alertas (0)',
    );
  });

  test('mientras carga, nada', () => {
    mocks.listConflictAlerts.mockReturnValue(new Promise(() => undefined));
    render(<ConflictAlertsLink userId={ADMIN_ID} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('si falla, "Alertas" sin número', async () => {
    mocks.listConflictAlerts.mockRejectedValue(new ApiError(503, ['Service Unavailable']));
    render(<ConflictAlertsLink userId={ADMIN_ID} />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Alertas' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Alertas' })).toHaveTextContent(/^Alertas$/);
  });
});
