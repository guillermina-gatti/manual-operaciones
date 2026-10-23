import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatCreatedAt, formatReviewDate, formatSize } from '@/lib/documents/format';

describe('formatSize', () => {
  test.each([
    [0, '0 B'],
    [54, '54 B'],
    [1536, '1,5 KB'],
    [2 * 1024 * 1024, '2 MB'],
    [10 * 1024 * 1024, '10 MB'],
    [1.25 * 1024 * 1024, '1,3 MB'],
  ])('%i bytes → %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatReviewDate (F7)', () => {
  test('la trampa existe: con new Date, en Buenos Aires el 1/3 se muestra como 28/2', () => {
    vi.stubEnv('TZ', 'America/Argentina/Buenos_Aires');

    expect(new Date('2027-03-01').toLocaleDateString('es-AR')).toBe('28/2/2027');
  });

  test('"2027-03-01" da 01/03/2027 aunque el proceso esté en Buenos Aires', () => {
    vi.stubEnv('TZ', 'America/Argentina/Buenos_Aires');

    expect(formatReviewDate('2027-03-01')).toBe('01/03/2027');
  });

  test('da lo mismo en cualquier zona horaria', () => {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      vi.stubEnv('TZ', zone);
      expect(formatReviewDate('2027-12-31')).toBe('31/12/2027');
    }
  });

  test('un valor con otro formato muestra "—"', () => {
    for (const value of ['', '2027-3-1', '01/03/2027', '2027-03-01T00:00:00Z']) {
      expect(formatReviewDate(value)).toBe('—');
    }
  });
});

describe('formatCreatedAt (F7)', () => {
  test('muestra la fecha y la hora de Buenos Aires', () => {
    expect(formatCreatedAt('2026-10-23T15:00:00.000Z')).toBe('23/10/2026, 12:00');
  });

  test('usa Buenos Aires aunque el proceso esté en otra zona horaria', () => {
    for (const zone of ['UTC', 'Asia/Tokyo']) {
      vi.stubEnv('TZ', zone);
      expect(formatCreatedAt('2026-10-23T15:00:00.000Z')).toBe('23/10/2026, 12:00');
    }
  });

  test('a las 01:30 UTC todavía es el día anterior en Buenos Aires', () => {
    vi.stubEnv('TZ', 'UTC');

    expect(formatCreatedAt('2026-10-24T01:30:00.000Z')).toBe('23/10/2026, 22:30');
  });

  test('un valor que no es una fecha muestra "—"', () => {
    expect(formatCreatedAt('no es una fecha')).toBe('—');
  });
});
