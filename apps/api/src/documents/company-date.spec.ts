/* Pruebas de las fechas de la empresa (spec 005, plan 1.2; T02) */
import { addDays, toDbDate, todayInCompany } from './company-date';

describe('todayInCompany', () => {
  const previousTimeZone = process.env.APP_TIMEZONE;

  afterEach(() => {
    if (previousTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previousTimeZone;
  });

  it('a las 23:30 de Buenos Aires sigue siendo el mismo día, aunque en UTC ya sea el siguiente', () => {
    delete process.env.APP_TIMEZONE;
    expect(todayInCompany(new Date('2026-11-10T02:30:00.000Z'))).toBe(
      '2026-11-09',
    );
  });

  it('a la medianoche de Buenos Aires ya es el día siguiente', () => {
    delete process.env.APP_TIMEZONE;
    expect(todayInCompany(new Date('2026-11-10T03:00:00.000Z'))).toBe(
      '2026-11-10',
    );
  });

  it('respeta APP_TIMEZONE', () => {
    process.env.APP_TIMEZONE = 'UTC';
    expect(todayInCompany(new Date('2026-11-10T02:30:00.000Z'))).toBe(
      '2026-11-10',
    );
  });
});

describe('addDays', () => {
  it.each([
    ['2026-11-09', 30, '2026-12-09'],
    ['2026-11-09', 1, '2026-11-10'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-11-09', -5, '2026-11-04'],
  ])('%s + %i = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('toDbDate', () => {
  it('es la medianoche UTC de ese día, como se guarda un @db.Date', () => {
    expect(toDbDate('2026-11-09').toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
  });
});
