// Spec 011 (T11): las llamadas a /api/conflict-alerts.
import { describe, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/lib/api';
import { createConflictAlertsApi, type ConflictAlert, type ConflictAlertPage } from '@/lib/api/conflict-alerts';

// Con la forma del backend (spec 011, R14): si un tipo de la web no coincide, no compila.
const ALERT: ConflictAlert = {
  id: '0c000000-0000-4000-8000-000000000001',
  status: 'OPEN',
  documents: [
    {
      id: '0d000000-0000-4000-8000-00000000000a',
      title: 'Manual de compras',
      status: 'ACTIVE',
      versionNumber: 2,
      section: 'Aprobaciones',
      isCurrentVersion: true,
    },
    {
      id: '0d000000-0000-4000-8000-00000000000b',
      title: 'Política de gastos',
      status: 'ACTIVE',
      versionNumber: 1,
      section: 'Sin sección',
      isCurrentVersion: true,
    },
  ],
  question: '¿Quién aprueba una compra de $800.000?',
  firstDetectedAt: '2026-11-05T13:00:00.000Z',
  lastDetectedAt: '2026-11-07T13:00:00.000Z',
  occurrences: 3,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
};

function fakeClient(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  const client: ApiClient = { request };
  return { api: createConflictAlertsApi(client), request };
}

describe('listConflictAlerts (R14)', () => {
  test('pide el estado, la página y el límite', async () => {
    const page: ConflictAlertPage = { data: [ALERT], total: 1, openTotal: 1, page: 2, limit: 20 };
    const { api, request } = fakeClient(page);
    const signal = new AbortController().signal;

    await expect(api.listConflictAlerts('RESOLVED', 2, 20, signal)).resolves.toEqual(page);
    expect(request).toHaveBeenCalledWith('/api/conflict-alerts?status=RESOLVED&page=2&limit=20', { signal });
  });
});

describe('resolveConflictAlert (R15)', () => {
  test('con nota, la manda en el cuerpo', async () => {
    const { api, request } = fakeClient({ ...ALERT, status: 'RESOLVED' });

    await api.resolveConflictAlert(ALERT.id, 'Corregida en la v2');

    expect(request).toHaveBeenCalledWith(`/api/conflict-alerts/${ALERT.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Corregida en la v2' }),
    });
  });

  test('sin nota, un cuerpo vacío', async () => {
    const { api, request } = fakeClient({ ...ALERT, status: 'RESOLVED' });

    await api.resolveConflictAlert(ALERT.id);

    expect(request.mock.calls[0][1]).toMatchObject({ body: '{}' });
  });
});
