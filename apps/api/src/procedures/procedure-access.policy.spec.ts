import { AREA_IDS } from '../documents/adapters/fixtures';
import type { Role } from '../common/auth';
import {
  PolicyVersion,
  ProcedureViewer,
  ViewableProcedure,
  canManage,
  canViewProcedure,
  currentVersion,
  listFilter,
} from './procedure-access.policy';

const { ventas, operaciones } = AREA_IDS;

const version = (
  versionNumber: number,
  status: PolicyVersion['status'],
  stepCount = 3,
): PolicyVersion => ({ versionNumber, status, stepCount });

const procedure = (
  areaIds: string[],
  versions: PolicyVersion[],
): ViewableProcedure => ({ areaIds, versions });

const viewer = (role: Role, areaIds: string[]): ProcedureViewer => ({
  role,
  areaIds,
});

describe('canManage', () => {
  it('R1: ADMIN can manage procedures', () => {
    expect(canManage('ADMIN')).toBe(true);
  });

  it.each(['SUPERVISOR', 'EMPLOYEE'] as const)(
    'R1: %s cannot manage procedures',
    (role) => {
      expect(canManage(role)).toBe(false);
    },
  );
});

describe('currentVersion', () => {
  it('is the PUBLISHED version', () => {
    const published = version(2, 'PUBLISHED');

    const result = currentVersion([
      version(1, 'SUPERSEDED'),
      published,
      version(3, 'DRAFT'),
    ]);

    expect(result).toBe(published);
  });

  it('is the most recent PUBLISHED when there are several, whatever the input order', () => {
    const latest = version(4, 'PUBLISHED');

    const result = currentVersion([
      version(2, 'PUBLISHED'),
      latest,
      version(3, 'PUBLISHED'),
    ]);

    expect(result).toBe(latest);
  });

  it.each([
    ['there are no versions', []],
    ['there is only a DRAFT', [version(1, 'DRAFT')]],
    ['there is only a SUPERSEDED', [version(1, 'SUPERSEDED')]],
  ])('is null when %s', (_, versions) => {
    expect(currentVersion(versions)).toBeNull();
  });
});

describe('canViewProcedure', () => {
  describe('ADMIN', () => {
    it.each([
      ['a draft-only procedure', procedure([ventas], [version(1, 'DRAFT')])],
      ['a procedure without areas', procedure([], [version(1, 'PUBLISHED')])],
      ['a procedure without versions', procedure([ventas], [])],
      [
        'a procedure of an area it does not belong to',
        procedure([operaciones], [version(1, 'PUBLISHED')]),
      ],
    ])('R13: sees %s', (_, target) => {
      expect(canViewProcedure(viewer('ADMIN', []), target)).toBe(true);
    });
  });

  describe.each(['SUPERVISOR', 'EMPLOYEE'] as const)('%s', (role) => {
    const published = procedure([ventas], [version(1, 'PUBLISHED')]);

    it('R13: sees a published procedure of one of its areas', () => {
      expect(canViewProcedure(viewer(role, [ventas]), published)).toBe(true);
    });

    it('R13: sees it when it shares only one of several areas', () => {
      const shared = procedure(
        [ventas, operaciones],
        [version(1, 'PUBLISHED')],
      );

      expect(canViewProcedure(viewer(role, [operaciones]), shared)).toBe(true);
    });

    it('R14: does not see a published procedure of another area', () => {
      expect(canViewProcedure(viewer(role, [operaciones]), published)).toBe(
        false,
      );
    });

    it('R15: does not see anything without areas', () => {
      expect(canViewProcedure(viewer(role, []), published)).toBe(false);
    });

    it('R14: does not see a procedure that has no areas', () => {
      const unassigned = procedure([], [version(1, 'PUBLISHED')]);

      expect(canViewProcedure(viewer(role, [ventas]), unassigned)).toBe(false);
    });

    it.each([
      ['has only a DRAFT', [version(1, 'DRAFT')]],
      ['has only a SUPERSEDED', [version(1, 'SUPERSEDED')]],
      ['has a PUBLISHED without steps', [version(1, 'PUBLISHED', 0)]],
      ['has no versions', []],
    ])('R13: does not see a procedure that %s', (_, versions) => {
      expect(
        canViewProcedure(viewer(role, [ventas]), procedure([ventas], versions)),
      ).toBe(false);
    });

    it('E22: sees a procedure with a SUPERSEDED, a PUBLISHED and a DRAFT', () => {
      const target = procedure(
        [ventas],
        [
          version(1, 'SUPERSEDED'),
          version(2, 'PUBLISHED'),
          version(3, 'DRAFT'),
        ],
      );

      expect(canViewProcedure(viewer(role, [ventas]), target)).toBe(true);
    });
  });
});

describe('listFilter', () => {
  it('R13: ADMIN has no filter', () => {
    expect(listFilter(viewer('ADMIN', []))).toEqual({});
  });

  it.each(['SUPERVISOR', 'EMPLOYEE'] as const)(
    'R13: %s only gets procedures of its areas with a PUBLISHED version with steps',
    (role) => {
      expect(listFilter(viewer(role, [ventas, operaciones]))).toEqual({
        areas: { some: { areaId: { in: [ventas, operaciones] } } },
        versions: {
          some: { status: 'PUBLISHED', steps: { some: {} } },
        },
      });
    },
  );

  it('R15: a user without areas gets a filter that matches nothing', () => {
    expect(listFilter(viewer('EMPLOYEE', []))).toEqual({
      areas: { some: { areaId: { in: [] } } },
      versions: { some: { status: 'PUBLISHED', steps: { some: {} } } },
    });
  });
});
