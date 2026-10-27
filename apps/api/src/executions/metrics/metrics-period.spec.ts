import {
  DEFAULT_TIME_ZONE,
  isCalendarDate,
  staleBefore,
  toMetricsPeriod,
} from './metrics-period';

describe('isCalendarDate', () => {
  it.each(['2026-10-27', '2024-02-29', '2026-01-01'])('accepts %s', (text) => {
    expect(isCalendarDate(text)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-10-00',
    '2026-1-5',
    '27/10/2026',
    '2026-10-27T00:00:00Z',
    '',
  ])('rejects %s', (text) => {
    expect(isCalendarDate(text)).toBe(false);
  });
});

describe('toMetricsPeriod', () => {
  it('turns company days into instants: from at midnight, to at the next midnight', () => {
    const period = toMetricsPeriod(
      '2026-10-01',
      '2026-10-27',
      DEFAULT_TIME_ZONE,
    );

    // Buenos Aires is UTC-3.
    expect(period).toEqual({
      from: new Date('2026-10-01T03:00:00.000Z'),
      to: new Date('2026-10-28T03:00:00.000Z'),
    });
  });

  it('the same day as from and to covers that whole day', () => {
    const { from, to } = toMetricsPeriod(
      '2026-10-27',
      '2026-10-27',
      DEFAULT_TIME_ZONE,
    );

    expect(to!.getTime() - from!.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('crosses the end of a month and of a year', () => {
    expect(
      toMetricsPeriod(undefined, '2026-12-31', DEFAULT_TIME_ZONE).to,
    ).toEqual(new Date('2027-01-01T03:00:00.000Z'));
  });

  it('a missing side has no limit', () => {
    expect(toMetricsPeriod(undefined, undefined, DEFAULT_TIME_ZONE)).toEqual({
      from: null,
      to: null,
    });
  });

  it('uses the time zone it receives', () => {
    expect(toMetricsPeriod('2026-10-27', undefined, 'UTC').from).toEqual(
      new Date('2026-10-27T00:00:00.000Z'),
    );
  });

  it('handles a day that starts on a daylight saving change', () => {
    // In Santiago, clocks jumped from 00:00 to 01:00 on 2026-09-06 (UTC-4 to UTC-3).
    expect(
      toMetricsPeriod('2026-09-06', undefined, 'America/Santiago').from,
    ).toEqual(new Date('2026-09-06T04:00:00.000Z'));
  });
});

describe('staleBefore', () => {
  it('is 24 hours before now', () => {
    expect(staleBefore(new Date('2026-10-27T15:00:00.000Z'))).toEqual(
      new Date('2026-10-26T15:00:00.000Z'),
    );
  });
});
