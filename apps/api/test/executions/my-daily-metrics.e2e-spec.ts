/* Daily activity of the employee end to end over HTTP (GET /metrics/me/daily): real SQL,
company days in Buenos Aires, only the executions of the user of the session. The app reads
"today" from a clock owned by the test, so the window does not depend on when it runs */

import request from 'supertest';
import { AREA_IDS, FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import {
  FIXTURE_PROCEDURE_VERSIONS,
  PROCEDURE_IDS,
  PROCEDURE_VERSION_IDS,
} from '../../src/executions/adapters/procedure-fixtures';
import { Clock } from '../../src/executions/ports/clock';
import type { CatalogStep } from '../../src/executions/ports/procedures-catalog';
import {
  ExecutionsTestApp,
  OTRO_EMPLEADO_VENTAS,
  authHeaders,
  cleanExecutions,
  closeExecutionsTestApp,
  createExecutionsTestApp,
} from './helpers';

interface DailyBody {
  windowFrom: string;
  windowTo: string;
  days: {
    date: string;
    procedures: {
      procedureId: string;
      title: string | null;
      completed: number;
    }[];
  }[];
  week: {
    from: string;
    to: string;
    activeDays: string[];
    completedCount: number;
  };
}

interface SeedVersion {
  procedureId: string;
  versionId: string;
  steps: CatalogStep[];
}

// The time the app reads; each test may move it.
class TestClock extends Clock {
  at = new Date();
  now(): Date {
    return this.at;
  }
}

const CIERRE = PROCEDURE_IDS.cierreDeCaja;
const RECEPCION = PROCEDURE_IDS.recepcionMercaderia;
const stepsOf = (versionId: string) =>
  FIXTURE_PROCEDURE_VERSIONS.find((v) => v.versionId === versionId)!.steps;
const CIERRE_V2: SeedVersion = {
  procedureId: CIERRE,
  versionId: PROCEDURE_VERSION_IDS.cierreDeCajaV2,
  steps: stepsOf(PROCEDURE_VERSION_IDS.cierreDeCajaV2),
};
const RECEPCION_V1: SeedVersion = {
  procedureId: RECEPCION,
  versionId: PROCEDURE_VERSION_IDS.recepcionMercaderiaV1,
  steps: stepsOf(PROCEDURE_VERSION_IDS.recepcionMercaderiaV1),
};

const STEP_MS = 3 * 60 * 1000;
// A wall-clock time in Buenos Aires (UTC-3, no daylight saving) as an instant.
const ar = (day: string, time = '12:00') => new Date(`${day}T${time}:00-03:00`);

// Thursday 12 November 2026, 12:00 in Buenos Aires: the window is 23 Oct – 12 Nov and the
// week 9 – 13 Nov.
const THURSDAY = ar('2026-11-12');
const MONDAY = '2026-11-09';

const ELENA = FIXTURE_USERS.empleadoVentas;

describe('Daily activity of the employee (integration)', () => {
  let t: ExecutionsTestApp;
  let previousTimeZone: string | undefined;
  const clock = new TestClock();
  const http = () => request(t.app.getHttpServer());
  const daily = (headers: Record<string, string>, query = '') =>
    http().get(`/api/metrics/me/daily${query}`).set(headers);
  const body = async (headers: Record<string, string>, query = '') =>
    (await daily(headers, query).expect(200)).body as DailyBody;
  const dayOf = (result: DailyBody, date: string) =>
    result.days.find((d) => d.date === date)!;

  const elena = authHeaders(ELENA);
  const otra = authHeaders(OTRO_EMPLEADO_VENTAS);

  // An execution completed at `finishedAt`: every step, STEP_MS each, the last one
  // finishing then.
  async function completed(
    version: SeedVersion,
    finishedAt: Date,
    userId: string = ELENA.id,
  ): Promise<string> {
    const n = version.steps.length;
    const at = (i: number) =>
      new Date(finishedAt.getTime() - (n - i) * STEP_MS);
    const execution = await t.prisma.execution.create({
      data: {
        userId,
        procedureId: version.procedureId,
        procedureVersionId: version.versionId,
        status: 'COMPLETED',
        startedAt: at(0),
        finishedAt,
        steps: {
          create: version.steps.map((step, i) => ({
            stepId: step.id,
            stepOrder: step.order,
            startedAt: at(i),
            finishedAt: at(i + 1),
          })),
        },
      },
    });
    return execution.id;
  }

  // An execution in progress whose first step finished at `stepFinishedAt`, now on the
  // second one. Old enough, it is an abandoned one.
  async function inProgress(
    version: SeedVersion,
    stepFinishedAt: Date,
    userId: string = ELENA.id,
  ): Promise<string> {
    const startedAt = new Date(stepFinishedAt.getTime() - STEP_MS);
    const execution = await t.prisma.execution.create({
      data: {
        userId,
        procedureId: version.procedureId,
        procedureVersionId: version.versionId,
        status: 'IN_PROGRESS',
        startedAt,
        steps: {
          create: [
            {
              stepId: version.steps[0].id,
              stepOrder: version.steps[0].order,
              startedAt,
              finishedAt: stepFinishedAt,
            },
            {
              stepId: version.steps[1].id,
              stepOrder: version.steps[1].order,
              startedAt: stepFinishedAt,
              finishedAt: null,
            },
          ],
        },
      },
    });
    return execution.id;
  }

  beforeAll(async () => {
    previousTimeZone = process.env.APP_TIMEZONE;
    process.env.APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
    t = await createExecutionsTestApp({ clock });
  });

  afterAll(async () => {
    await closeExecutionsTestApp(t);
    if (previousTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimeZone;
  });

  beforeEach(async () => {
    clock.at = THURSDAY;
    await cleanExecutions(t.prisma);
    t.catalog.assignAreas(CIERRE, [AREA_IDS.ventas]);
    t.catalog.assignAreas(RECEPCION, [AREA_IDS.operaciones]);
  });

  describe('the 21 days', () => {
    it('every day up to today, also the empty ones; the 22nd day back is out', async () => {
      await completed(CIERRE_V2, ar('2026-11-12', '09:00'));
      await completed(CIERRE_V2, ar('2026-10-23', '09:00'));
      await completed(CIERRE_V2, ar('2026-10-22', '18:00'));

      const result = await body(elena);

      expect(result.windowFrom).toBe('2026-10-23');
      expect(result.windowTo).toBe('2026-11-12');
      expect(result.days).toHaveLength(21);
      expect(result.days.map((d) => d.date)).toEqual(
        result.days.map((d) => d.date).sort(),
      );
      expect(result.days[0]).toEqual({
        date: '2026-10-23',
        procedures: [
          { procedureId: CIERRE, title: 'Cierre de caja', completed: 1 },
        ],
      });
      expect(result.days[20].procedures).toEqual([
        { procedureId: CIERRE, title: 'Cierre de caja', completed: 1 },
      ]);
      expect(result.days.filter((d) => d.procedures.length === 0)).toHaveLength(
        19,
      );
    });

    it('several procedures on the same day, the most completed first', async () => {
      t.catalog.assignAreas(RECEPCION, [AREA_IDS.ventas]);
      await completed(RECEPCION_V1, ar('2026-11-11', '09:00'));
      await completed(CIERRE_V2, ar('2026-11-11', '10:00'));
      await completed(CIERRE_V2, ar('2026-11-11', '19:00'));

      const result = await body(elena);

      expect(dayOf(result, '2026-11-11').procedures).toEqual([
        { procedureId: CIERRE, title: 'Cierre de caja', completed: 2 },
        {
          procedureId: RECEPCION,
          title: 'Recepción de mercadería',
          completed: 1,
        },
      ]);
    });

    it('23:30 in Buenos Aires (already the next day in UTC) is on its Argentine day', async () => {
      // Tuesday 10 November 23:30 = Wednesday 11, 02:30 UTC.
      await completed(CIERRE_V2, ar('2026-11-10', '23:30'));

      const result = await body(elena);

      expect(dayOf(result, '2026-11-10').procedures).toHaveLength(1);
      expect(dayOf(result, '2026-11-11').procedures).toEqual([]);
      expect(result.week.activeDays).toEqual(['2026-11-10']);
    });

    it('"today" is the Argentine day too: at 23:30 the window still ends on that day', async () => {
      clock.at = ar('2026-11-12', '23:30');
      await completed(CIERRE_V2, ar('2026-11-12', '23:00'));

      const result = await body(elena);

      expect(result.windowTo).toBe('2026-11-12');
      expect(result.days[20].procedures).toHaveLength(1);
    });
  });

  describe('what never counts', () => {
    it('a RESTARTED execution: not in the days, not progress, not in the week', async () => {
      const old = await completed(CIERRE_V2, ar('2026-11-10', '10:00'));
      await t.prisma.execution.update({
        where: { id: old },
        data: { status: 'RESTARTED' },
      });

      const result = await body(elena);

      expect(result.days.every((d) => d.procedures.length === 0)).toBe(true);
      expect(result.week).toEqual({
        from: MONDAY,
        to: '2026-11-13',
        activeDays: [],
        completedCount: 0,
      });
    });

    it('an execution in progress or abandoned is not completed, but a finished step is progress', async () => {
      // Abandoned last week, and one moved on Wednesday.
      await inProgress(CIERRE_V2, ar('2026-11-03', '10:00'));
      await inProgress(RECEPCION_V1, ar('2026-11-11', '10:00'));

      const result = await body(elena);

      expect(result.days.every((d) => d.procedures.length === 0)).toBe(true);
      expect(result.week.activeDays).toEqual(['2026-11-11']);
      expect(result.week.completedCount).toBe(0);
    });
  });

  describe('areas', () => {
    beforeEach(async () => {
      // Cierre is in Ventas (hers); Recepción in Operaciones (not hers).
      await completed(CIERRE_V2, ar('2026-11-09', '10:00'));
      await completed(RECEPCION_V1, ar('2026-11-10', '10:00'));
    });

    it('the days only have the procedures of her areas; the week is the whole person', async () => {
      for (const query of ['', `?areaId=${AREA_IDS.ventas}`]) {
        const result = await body(elena, query);

        expect(dayOf(result, '2026-11-09').procedures).toHaveLength(1);
        expect(dayOf(result, '2026-11-10').procedures).toEqual([]);
        expect(result.week.activeDays).toEqual(['2026-11-09', '2026-11-10']);
        expect(result.week.completedCount).toBe(2);
      }
    });

    it('an area that is not hers is a 404', async () => {
      await daily(elena, `?areaId=${AREA_IDS.operaciones}`).expect(404);
    });
  });

  describe('the week of the nest', () => {
    it('no day with progress', async () => {
      await completed(CIERRE_V2, ar('2026-11-06', '10:00'));

      const result = await body(elena);

      expect(result.week).toEqual({
        from: MONDAY,
        to: '2026-11-13',
        activeDays: [],
        completedCount: 0,
      });
    });

    it('the 5 working days, on Friday', async () => {
      clock.at = ar('2026-11-13', '18:00');
      for (const day of ['09', '10', '11', '12', '13']) {
        await completed(CIERRE_V2, ar(`2026-11-${day}`, '10:00'));
      }

      const result = await body(elena);

      expect(result.week).toEqual({
        from: MONDAY,
        to: '2026-11-13',
        activeDays: [
          '2026-11-09',
          '2026-11-10',
          '2026-11-11',
          '2026-11-12',
          '2026-11-13',
        ],
        completedCount: 5,
      });
    });

    it.each([
      ['Saturday', '2026-11-14'],
      ['Sunday', '2026-11-15'],
    ])(
      'on %s, the week that just ended; the weekend counts as completed, not as a day',
      async (_name, today) => {
        clock.at = ar(today, '11:00');
        await completed(CIERRE_V2, ar('2026-11-11', '10:00'));
        await completed(CIERRE_V2, ar('2026-11-14', '10:00'));

        const result = await body(elena);

        expect(result.windowTo).toBe(today);
        expect(result.week).toEqual({
          from: MONDAY,
          to: '2026-11-13',
          activeDays: ['2026-11-11'],
          completedCount: 2,
        });
        // The chart still shows Saturday.
        expect(dayOf(result, '2026-11-14').procedures).toHaveLength(1);
      },
    );
  });

  it('another employee never sees her executions', async () => {
    await completed(CIERRE_V2, ar('2026-11-11', '10:00'));
    await completed(
      CIERRE_V2,
      ar('2026-11-10', '10:00'),
      OTRO_EMPLEADO_VENTAS.id,
    );

    const hers = await body(elena);
    const theirs = await body(otra);

    expect(hers.week.activeDays).toEqual(['2026-11-11']);
    expect(theirs.week.activeDays).toEqual(['2026-11-10']);
    expect(dayOf(theirs, '2026-11-11').procedures).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain(ELENA.id);
  });

  it('401 without a session, 403 for ADMIN and SUPERVISOR, 400 with dates', async () => {
    await http().get('/api/metrics/me/daily').expect(401);
    await daily(authHeaders(FIXTURE_USERS.admin)).expect(403);
    await daily(authHeaders(FIXTURE_USERS.supervisorVentas)).expect(403);
    await daily(elena, '?from=2026-11-01').expect(400);
    await daily(elena, '?areaId=ventas').expect(400);
  });
});
