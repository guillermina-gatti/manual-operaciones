import {
  canBeOwner,
  canView,
  listWhere,
  searchScope,
} from './document-access.policy';

const VENTAS = 'area-ventas';
const OPERACIONES = 'area-operaciones';

const admin = { role: 'ADMIN' as const, areaIds: [] };
const empleadoDeVentas = { role: 'EMPLOYEE' as const, areaIds: [VENTAS] };
const empleadoSinAreas = { role: 'EMPLOYEE' as const, areaIds: [] };

describe('canView', () => {
  it('un ADMIN ve un documento ARCHIVED sin áreas en común', () => {
    const document = { status: 'ARCHIVED' as const, areaIds: [OPERACIONES] };

    expect(canView(admin, document)).toBe(true);
  });

  it('un EMPLOYEE de Ventas ve un ACTIVE de Ventas y Operaciones', () => {
    const document = {
      status: 'ACTIVE' as const,
      areaIds: [VENTAS, OPERACIONES],
    };

    expect(canView(empleadoDeVentas, document)).toBe(true);
  });

  it('un EMPLOYEE de Ventas no ve uno de Operaciones', () => {
    const document = { status: 'ACTIVE' as const, areaIds: [OPERACIONES] };

    expect(canView(empleadoDeVentas, document)).toBe(false);
  });

  it('un EMPLOYEE de Ventas no ve uno ARCHIVED de Ventas', () => {
    const document = { status: 'ARCHIVED' as const, areaIds: [VENTAS] };

    expect(canView(empleadoDeVentas, document)).toBe(false);
  });

  it('un EMPLOYEE sin áreas no ve un ACTIVE de Ventas', () => {
    const document = { status: 'ACTIVE' as const, areaIds: [VENTAS] };

    expect(canView(empleadoSinAreas, document)).toBe(false);
  });
});

describe('listWhere', () => {
  it('para un ADMIN no filtra', () => {
    expect(listWhere(admin)).toEqual({});
  });

  it('para un EMPLOYEE filtra por ACTIVE y por sus áreas', () => {
    expect(listWhere(empleadoDeVentas)).toEqual({
      status: 'ACTIVE',
      areas: { some: { areaId: { in: [VENTAS] } } },
    });
  });

  it('para un EMPLOYEE sin áreas filtra con la lista de áreas vacía', () => {
    expect(listWhere(empleadoSinAreas)).toEqual({
      status: 'ACTIVE',
      areas: { some: { areaId: { in: [] } } },
    });
  });
});

describe('canBeOwner', () => {
  it('responsable sin acceso: un EMPLOYEE solo de Operaciones no puede serlo de un documento de Ventas', () => {
    const owner = { role: 'EMPLOYEE' as const, areaIds: [OPERACIONES] };

    expect(canBeOwner(owner, [VENTAS])).toBe(false);
  });

  it('un ADMIN sin áreas puede ser responsable', () => {
    expect(canBeOwner(admin, [VENTAS])).toBe(true);
  });

  it('un SUPERVISOR de un área compartida puede ser responsable', () => {
    const owner = { role: 'SUPERVISOR' as const, areaIds: [VENTAS] };

    expect(canBeOwner(owner, [VENTAS, OPERACIONES])).toBe(true);
  });
});

// Spec 004, R3 (plan 004, 3.1 y D5): qué documentos puede encontrar cada usuario. El estado ACTIVE
// lo exige la consulta para todos; la política solo dice por qué áreas se filtra.
describe('searchScope', () => {
  it('para un ADMIN no filtra por áreas', () => {
    expect(searchScope(admin)).toEqual({ areaIds: null });
  });

  it('para un EMPLOYEE filtra por sus áreas', () => {
    expect(searchScope(empleadoDeVentas)).toEqual({ areaIds: [VENTAS] });
  });

  it('para un SUPERVISOR filtra por sus áreas', () => {
    const supervisor = {
      role: 'SUPERVISOR' as const,
      areaIds: [VENTAS, OPERACIONES],
    };

    expect(searchScope(supervisor)).toEqual({
      areaIds: [VENTAS, OPERACIONES],
    });
  });

  it('para un EMPLOYEE sin áreas filtra con la lista vacía: no encuentra nada', () => {
    expect(searchScope(empleadoSinAreas)).toEqual({ areaIds: [] });
  });
});
