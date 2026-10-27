import {
  filterableAreaIds,
  inScope,
  metricsScope,
} from './metrics-access.policy';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';

describe('metricsScope', () => {
  it('ADMIN without an area sees every procedure', () => {
    expect(metricsScope('ADMIN', [])).toEqual({ all: true });
  });

  it('ADMIN with an area sees only that area, even with no areas of their own', () => {
    expect(metricsScope('ADMIN', [], OPERACIONES)).toEqual({
      all: false,
      areaIds: [OPERACIONES],
    });
  });

  it('SUPERVISOR without an area sees their own areas', () => {
    expect(metricsScope('SUPERVISOR', [VENTAS])).toEqual({
      all: false,
      areaIds: [VENTAS],
    });
  });

  it('SUPERVISOR with one of their areas sees only that one', () => {
    expect(
      metricsScope('SUPERVISOR', [VENTAS, OPERACIONES], OPERACIONES),
    ).toEqual({ all: false, areaIds: [OPERACIONES] });
  });

  it('SUPERVISOR asking for an area of someone else gets nothing (404)', () => {
    expect(metricsScope('SUPERVISOR', [VENTAS], OPERACIONES)).toBeNull();
  });

  it('SUPERVISOR without areas sees no procedure', () => {
    const scope = metricsScope('SUPERVISOR', []);

    expect(scope).toEqual({ all: false, areaIds: [] });
    expect(inScope(scope!, [VENTAS])).toBe(false);
  });

  it('EMPLOYEE gets nothing, with or without an area', () => {
    expect(metricsScope('EMPLOYEE', [VENTAS])).toBeNull();
    expect(metricsScope('EMPLOYEE', [VENTAS], VENTAS)).toBeNull();
  });
});

describe('inScope', () => {
  it('everything is in view for all', () => {
    expect(inScope({ all: true }, [OPERACIONES])).toBe(true);
    expect(inScope({ all: true }, [])).toBe(true);
  });

  it('a procedure sharing an area is in view', () => {
    expect(
      inScope({ all: false, areaIds: [VENTAS] }, [OPERACIONES, VENTAS]),
    ).toBe(true);
  });

  it('a supervisor of Ventas does not see a procedure of Operaciones', () => {
    expect(inScope({ all: false, areaIds: [VENTAS] }, [OPERACIONES])).toBe(
      false,
    );
  });

  it('a procedure without areas is only in view for all', () => {
    expect(inScope({ all: false, areaIds: [VENTAS] }, [])).toBe(false);
  });
});

describe('filterableAreaIds', () => {
  it('ADMIN may filter by any area', () => {
    expect(filterableAreaIds('ADMIN', [])).toBeNull();
  });

  it('SUPERVISOR may filter only by their areas', () => {
    expect(filterableAreaIds('SUPERVISOR', [VENTAS])).toEqual([VENTAS]);
  });
});
