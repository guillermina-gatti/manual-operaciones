/* Spec 011 (T08, R14, R15, E12): las rutas de las alertas son solo para el ADMIN */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, ROLES_KEY, RolesGuard } from '../../common/auth';
import { ConflictAlertsController } from './conflict-alerts.controller';

describe('ConflictAlertsController (spec 011)', () => {
  it('E12: la clase exige sesión y el rol ADMIN', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ConflictAlertsController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ConflictAlertsController)).toEqual([
      'ADMIN',
    ]);
  });

  it('las dos rutas le pasan al servicio lo que recibieron', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ data: [] }),
      resolve: jest.fn().mockResolvedValue({ id: 'alerta' }),
    };
    const controller = new ConflictAlertsController(service as never);
    const admin = { id: 'admin' } as never;

    await controller.list({ status: 'RESOLVED', page: 2, limit: 10 });
    await controller.resolve('alerta', { note: 'Listo' }, admin);

    expect(service.list).toHaveBeenCalledWith({
      status: 'RESOLVED',
      page: 2,
      limit: 10,
    });
    expect(service.resolve).toHaveBeenCalledWith('alerta', admin, {
      note: 'Listo',
    });
  });
});
