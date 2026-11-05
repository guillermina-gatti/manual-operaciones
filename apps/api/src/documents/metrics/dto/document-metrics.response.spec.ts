/* Pruebas de la respuesta de las métricas de documentos (spec 007, R8; T05) */
import type { DocumentMetricsView } from '../document-metrics.service';
import { toDocumentMetricsResponse } from './document-metrics.response';

describe('toDocumentMetricsResponse (R8)', () => {
  it('devuelve exactamente filters y los seis totales, campo por campo', () => {
    const view = {
      filters: { areaId: null, from: '2026-10-10', to: null, extra: 'x' },
      totals: {
        active: 12,
        upToDate: 8,
        dueSoon: 3,
        overdue: 1,
        processingFailed: 0,
        uploaded: 4,
        consulted: 99, // un campo de más no llega a la respuesta
      },
      areaIds: ['no debería salir'],
    } as unknown as DocumentMetricsView;

    expect(toDocumentMetricsResponse(view)).toStrictEqual({
      filters: { areaId: null, from: '2026-10-10', to: null },
      totals: {
        active: 12,
        upToDate: 8,
        dueSoon: 3,
        overdue: 1,
        processingFailed: 0,
        uploaded: 4,
      },
    });
  });
});
