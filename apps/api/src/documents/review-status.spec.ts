/* Pruebas del estado de revisión (spec 005, R1 a R3; plan 1.1; T03) */
import {
  DUE_SOON_DAYS,
  dueSoonThrough,
  reviewFor,
  reviewStatusOf,
} from './review-status';

// Spec 007 (T01): el último día "por vencer", compartido con "Por revisar" y las métricas.
describe('dueSoonThrough', () => {
  it.each([
    ['2026-11-09', '2026-12-09'],
    ['2026-12-15', '2027-01-14'],
  ])('%s → %s (hoy + 30)', (today, expected) => {
    expect(dueSoonThrough(today)).toBe(expected);
  });
});

const TODAY = '2026-11-09';
const active = (reviewDate: string) => ({
  status: 'ACTIVE' as const,
  reviewDate,
});

describe('reviewStatusOf (R1)', () => {
  it('el plazo de aviso es de 30 días (P1)', () => {
    expect(DUE_SOON_DAYS).toBe(30);
  });

  it.each(['2026-11-04', '2026-11-08'])(
    'E2: %s, anterior a hoy → OVERDUE',
    (date) => {
      expect(reviewStatusOf(active(date), TODAY)).toBe('OVERDUE');
    },
  );

  it('E4: hoy → DUE_SOON', () => {
    expect(reviewStatusOf(active(TODAY), TODAY)).toBe('DUE_SOON');
  });

  it.each(['2026-11-19', '2026-12-09'])(
    'E1: %s, de hoy a hoy + 30 → DUE_SOON',
    (date) => {
      expect(reviewStatusOf(active(date), TODAY)).toBe('DUE_SOON');
    },
  );

  it.each(['2026-12-10', '2027-02-07'])(
    'E3: %s, después de hoy + 30 → UP_TO_DATE',
    (date) => {
      expect(reviewStatusOf(active(date), TODAY)).toBe('UP_TO_DATE');
    },
  );

  it('cruce de año', () => {
    expect(reviewStatusOf(active('2027-01-14'), '2026-12-15')).toBe('DUE_SOON');
    expect(reviewStatusOf(active('2027-01-15'), '2026-12-15')).toBe(
      'UP_TO_DATE',
    );
  });
});

describe('reviewStatusOf (R2)', () => {
  it('un archivado no tiene estado, aunque su fecha esté vencida', () => {
    expect(
      reviewStatusOf({ status: 'ARCHIVED', reviewDate: '2026-11-04' }, TODAY),
    ).toBeNull();
  });
});

// Spec 005, R4 y R11: el estado y la última revisión, solo para el ADMIN y el responsable.
describe('reviewFor', () => {
  const OWNER = 'usuario-responsable';
  const document = {
    ownerId: OWNER,
    status: 'ACTIVE' as const,
    reviewDate: new Date('2026-11-04T00:00:00.000Z'),
    lastReviewedAt: null,
    lastReviewedById: null,
  };
  const never = { lastReviewedAt: null, lastReviewedById: null };

  it('al responsable le da el estado y, si nunca se revisó, la última revisión en null', () => {
    expect(reviewFor({ id: OWNER, role: 'EMPLOYEE' }, document, TODAY)).toEqual(
      {
        status: 'OVERDUE',
        ...never,
      },
    );
  });

  it('al ADMIN también, aunque no sea el responsable', () => {
    expect(reviewFor({ id: 'otro', role: 'ADMIN' }, document, TODAY)).toEqual({
      status: 'OVERDUE',
      ...never,
    });
  });

  it('un ADMIN responsable recibe un solo objeto (caso borde)', () => {
    expect(reviewFor({ id: OWNER, role: 'ADMIN' }, document, TODAY)).toEqual({
      status: 'OVERDUE',
      ...never,
    });
  });

  it('E5: a otro usuario no le da nada', () => {
    expect(
      reviewFor({ id: 'otro', role: 'EMPLOYEE' }, document, TODAY),
    ).toBeUndefined();
  });

  it('un registro sin los campos de la última revisión (armado a mano) los da en null', () => {
    const handBuilt = {
      ownerId: OWNER,
      status: 'ACTIVE' as const,
      reviewDate: document.reviewDate,
    };
    expect(
      reviewFor({ id: OWNER, role: 'EMPLOYEE' }, handBuilt, TODAY),
    ).toEqual({ status: 'OVERDUE', ...never });
  });

  it('con revisión previa: la fecha en ISO 8601 y quién la hizo', () => {
    const reviewed = {
      ...document,
      reviewDate: new Date('2027-05-09T00:00:00.000Z'),
      lastReviewedAt: new Date('2026-11-10T02:30:00.000Z'),
      lastReviewedById: OWNER,
    };
    expect(reviewFor({ id: OWNER, role: 'EMPLOYEE' }, reviewed, TODAY)).toEqual(
      {
        status: 'UP_TO_DATE',
        lastReviewedAt: '2026-11-10T02:30:00.000Z',
        lastReviewedById: OWNER,
      },
    );
  });

  it('R2: un archivado, para el ADMIN, sin estado pero con la última revisión', () => {
    const archived = { ...document, status: 'ARCHIVED' as const };
    expect(reviewFor({ id: 'otro', role: 'ADMIN' }, archived, TODAY)).toEqual({
      status: null,
      ...never,
    });
  });
});
