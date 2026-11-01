/* Contrato con las reglas de métricas de la pareja B (spec 007, D3; T02). Importa solo de
./metrics-rules: si la pareja B cambia una de estas reglas, falla acá y no en producción. */
import {
  documentMetricsAreaIds,
  isCalendarDate,
  metricsScope,
  toMetricsPeriod,
} from './metrics-rules';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

describe('metricsScope (R2, R3)', () => {
  it('E1: el ADMIN sin área cuenta todas', () => {
    expect(metricsScope('ADMIN', [])).toEqual({ all: true });
  });

  it('E3: el ADMIN con un área cuenta solo esa, exista o no (D14)', () => {
    expect(metricsScope('ADMIN', [], OPERACIONES)).toEqual({
      all: false,
      areaIds: [OPERACIONES],
    });
  });

  it('E2: el SUPERVISOR sin área cuenta sus áreas', () => {
    expect(metricsScope('SUPERVISOR', [VENTAS])).toEqual({
      all: false,
      areaIds: [VENTAS],
    });
  });

  it('el SUPERVISOR con una de sus áreas cuenta solo esa', () => {
    expect(metricsScope('SUPERVISOR', [VENTAS, OPERACIONES], VENTAS)).toEqual({
      all: false,
      areaIds: [VENTAS],
    });
  });

  it('E4: el SUPERVISOR con un área ajena no tiene alcance (404)', () => {
    expect(metricsScope('SUPERVISOR', [VENTAS], OPERACIONES)).toBeNull();
  });

  it('un SUPERVISOR sin áreas no cuenta ninguna', () => {
    expect(metricsScope('SUPERVISOR', [])).toEqual({ all: false, areaIds: [] });
  });

  it('E5: el EMPLOYEE no tiene alcance', () => {
    expect(metricsScope('EMPLOYEE', [VENTAS])).toBeNull();
    expect(metricsScope('EMPLOYEE', [VENTAS], VENTAS)).toBeNull();
  });
});

describe('toMetricsPeriod (R6)', () => {
  it('E9: los dos días inclusive, en hora de Argentina', () => {
    expect(toMetricsPeriod('2026-10-10', '2026-10-31', BUENOS_AIRES)).toEqual({
      from: new Date('2026-10-10T03:00:00.000Z'),
      // El 31/10 a las 23:30 de Argentina (2026-11-01T02:30Z) queda adentro.
      to: new Date('2026-11-01T03:00:00.000Z'),
    });
  });

  it('sin fechas no tiene límites', () => {
    expect(toMetricsPeriod(undefined, undefined, BUENOS_AIRES)).toEqual({
      from: null,
      to: null,
    });
  });

  it('solo from, o solo to, limita un lado', () => {
    expect(toMetricsPeriod('2026-10-10', undefined, BUENOS_AIRES)).toEqual({
      from: new Date('2026-10-10T03:00:00.000Z'),
      to: null,
    });
    expect(toMetricsPeriod(undefined, '2026-10-31', BUENOS_AIRES)).toEqual({
      from: null,
      to: new Date('2026-11-01T03:00:00.000Z'),
    });
  });
});

describe('isCalendarDate (R7)', () => {
  it('acepta un día que existe', () => {
    expect(isCalendarDate('2026-10-31')).toBe(true);
  });

  it.each(['2026-02-30', '01/10/2026', '2026-10-27T10:00:00Z'])(
    'E10: rechaza %s',
    (text) => {
      expect(isCalendarDate(text)).toBe(false);
    },
  );
});

describe('documentMetricsAreaIds (R2)', () => {
  it('todas las áreas → null (sin filtro)', () => {
    expect(documentMetricsAreaIds({ all: true })).toBeNull();
  });

  it('con áreas → esas áreas, también vacías', () => {
    expect(documentMetricsAreaIds({ all: false, areaIds: [VENTAS] })).toEqual([
      VENTAS,
    ]);
    expect(documentMetricsAreaIds({ all: false, areaIds: [] })).toEqual([]);
  });
});
