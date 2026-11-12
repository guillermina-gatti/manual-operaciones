import { AREA_IDS, FIXTURE_USERS } from '../documents/adapters/fixtures';
import { canAccessProcedure, isOwner } from './execution-access.policy';

const OTHER_AREA = '0a000000-0000-4000-8000-000000000099';

describe('canAccessProcedure', () => {
  it('is true when the viewer shares the only area of the procedure', () => {
    expect(canAccessProcedure([AREA_IDS.ventas], [AREA_IDS.ventas])).toBe(true);
  });

  it('is true when they share one area among several', () => {
    expect(
      canAccessProcedure(
        [OTHER_AREA, AREA_IDS.operaciones],
        [AREA_IDS.ventas, AREA_IDS.operaciones],
      ),
    ).toBe(true);
  });

  it('is false when they share no area', () => {
    expect(canAccessProcedure([AREA_IDS.ventas], [AREA_IDS.operaciones])).toBe(
      false,
    );
  });

  it('is false when the viewer has no areas', () => {
    expect(canAccessProcedure([], [AREA_IDS.ventas])).toBe(false);
  });

  it('is false when the procedure has no areas', () => {
    expect(canAccessProcedure([AREA_IDS.ventas], [])).toBe(false);
  });
});

describe('isOwner', () => {
  const execution = { userId: FIXTURE_USERS.empleadoVentas.id };

  it('is true for the user who started the execution', () => {
    expect(isOwner(FIXTURE_USERS.empleadoVentas.id, execution)).toBe(true);
  });

  it('is false for another employee', () => {
    expect(isOwner(FIXTURE_USERS.empleadoOperaciones.id, execution)).toBe(
      false,
    );
  });

  it('is false for an admin (no exception by role)', () => {
    expect(isOwner(FIXTURE_USERS.admin.id, execution)).toBe(false);
  });
});
