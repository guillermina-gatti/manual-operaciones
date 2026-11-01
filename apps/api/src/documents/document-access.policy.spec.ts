import {
  canBeOwner,
  canReview,
  canView,
  listWhere,
  pendingReviewWhere,
  searchScope,
} from './document-access.policy';

// Constantes de prueba para simular áreas de la empresa
const VENTAS = 'area-ventas';
const OPERACIONES = 'area-operaciones';

// Usuarios simulados con diferentes roles y áreas asignadas para las pruebas
const admin = { role: 'ADMIN' as const, areaIds: [] };
const empleadoDeVentas = { role: 'EMPLOYEE' as const, areaIds: [VENTAS] };
const empleadoSinAreas = { role: 'EMPLOYEE' as const, areaIds: [] };

// Pruebas para la función canView (¿Quién puede ver qué documento?)
describe('canView', () => {
  it('un ADMIN ve un documento ARCHIVED sin áreas en común', () => {
    const document = { status: 'ARCHIVED' as const, areaIds: [OPERACIONES] };
    expect(canView(admin, document)).toBe(true);
  });

  it('un EMPLOYEE de Ventas ve un ACTIVE de Ventas y Operaciones', () => {
    const document = { status: 'ACTIVE' as const, areaIds: [VENTAS, OPERACIONES] };
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

// Pruebas para listWhere (Generación de filtros de consulta para Prisma)
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

// Pruebas para canBeOwner (¿Quién puede ser designado responsable de un documento?)
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

// Pruebas para searchScope (Delimitación de búsqueda según el rol y áreas)
describe('searchScope', () => {
  it('para un ADMIN no filtra por áreas', () => {
    expect(searchScope(admin)).toEqual({ areaIds: null });
  });

  it('para un EMPLOYEE filtra por sus áreas', () => {
    expect(searchScope(empleadoDeVentas)).toEqual({ areaIds: [VENTAS] });
  });

  it('para un SUPERVISOR filtra por sus áreas', () => {
    const supervisor = { role: 'SUPERVISOR' as const, areaIds: [VENTAS, OPERACIONES] };
    expect(searchScope(supervisor)).toEqual({ areaIds: [VENTAS, OPERACIONES] });
  });

  it('para un EMPLOYEE sin áreas filtra con la lista vacía: no encuentra nada', () => {
    expect(searchScope(empleadoSinAreas)).toEqual({ areaIds: [] });
  });
});

// Spec 005, R4 y R6: quién ve el estado de revisión y puede marcar como revisado.
describe('canReview', () => {
  const OWNER = 'usuario-responsable';
  const OTHER = 'otro-usuario';
  const document = { ownerId: OWNER };

  it('un ADMIN puede, aunque no sea el responsable', () => {
    expect(canReview({ id: OTHER, role: 'ADMIN' }, document)).toBe(true);
  });

  it.each(['EMPLOYEE', 'SUPERVISOR'] as const)(
    'el responsable %s puede',
    (role) => {
      expect(canReview({ id: OWNER, role }, document)).toBe(true);
    },
  );

  it('E5: otro EMPLOYEE, aunque sea de la misma área, no puede', () => {
    expect(canReview({ id: OTHER, role: 'EMPLOYEE' }, document)).toBe(false);
  });
});

// Spec 005, R5: los documentos por vencer o vencidos que el usuario puede revisar.
describe('pendingReviewWhere', () => {
  const LAST_DAY = new Date('2026-12-09T00:00:00.000Z');

  it('para un ADMIN: todos los ACTIVE hasta la fecha límite, de cualquier responsable y área', () => {
    expect(pendingReviewWhere(admin, 'id-admin', LAST_DAY)).toEqual({
      status: 'ACTIVE',
      reviewDate: { lte: LAST_DAY },
    });
  });

  it('para los demás: lo que ve (listWhere, solo ACTIVE), del que es responsable, hasta la fecha límite', () => {
    const where = pendingReviewWhere(empleadoDeVentas, 'id-empleado', LAST_DAY);
    expect(where).toEqual({
      ...listWhere(empleadoDeVentas),
      ownerId: 'id-empleado',
      reviewDate: { lte: LAST_DAY },
    });
    expect(where).toMatchObject({ status: 'ACTIVE' });
  });
});
