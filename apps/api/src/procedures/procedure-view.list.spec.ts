import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import {
  ADMIN,
  EMPLOYEE,
  buildViewService,
  listed,
  operaciones,
  ventas,
} from '../../test/procedures/view-fixtures';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

describe('ProcedureViewService.list (spec 006, R13, R15, R16)', () => {
  let view: ReturnType<typeof buildViewService>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    view = buildViewService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('R13: the repository is asked with the viewer areas, read from the directory', async () => {
    view.list.list.mockResolvedValue({ data: [], total: 0 });

    await view.service.list(EMPLOYEE, 2, 10);

    expect(view.users.findById).toHaveBeenCalledWith(EMPLOYEE.id);
    expect(view.list.list).toHaveBeenCalledWith({ role: 'EMPLOYEE', areaIds: [ventas] }, 2, 10);
  });

  it('P21: names the areas of the whole page with a single call to the directory', async () => {
    view.list.list.mockResolvedValue({
      data: [listed('p1', [ventas]), listed('p2', [ventas, operaciones])],
      total: 2,
    });

    const page = await view.service.list(ADMIN, 1, 20);

    expect(view.areas.findByIds).toHaveBeenCalledTimes(1);
    expect(view.areas.findByIds).toHaveBeenCalledWith(expect.arrayContaining([ventas, operaciones]));
    expect(page.data[1].areas).toEqual([
      { id: operaciones, name: 'Operaciones', isActive: false },
      { id: ventas, name: 'Ventas', isActive: true },
    ]);
    expect(page.total).toBe(2);
  });

  it('P23: the ADMIN gets hasOpenDraft and the inactive areas; the others get neither', async () => {
    view.list.list.mockResolvedValue({ data: [listed('p2', [ventas, operaciones])], total: 1 });

    const [forAdmin] = (await view.service.list(ADMIN, 1, 20)).data;
    const [forEmployee] = (await view.service.list(EMPLOYEE, 1, 20)).data;

    expect(forAdmin.hasOpenDraft).toBe(true);
    expect(forAdmin.areas).toHaveLength(2);
    expect(forEmployee).not.toHaveProperty('hasOpenDraft');
    expect(forEmployee.areas).toEqual([{ id: ventas, name: 'Ventas', isActive: true }]);
  });

  it('with an empty page it does not ask the directory for areas', async () => {
    view.list.list.mockResolvedValue({ data: [], total: 0 });

    await view.service.list(ADMIN, 1, 20);

    expect(view.areas.findByIds).not.toHaveBeenCalled();
  });

  it('E25: if the user directory fails it is a 503 and nothing is listed', async () => {
    view.users.findById.mockRejectedValue(new RepositoryUnavailableError('caído'));

    await expect(view.service.list(EMPLOYEE, 1, 20)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(view.list.list).not.toHaveBeenCalled();
  });

  it('if the database fails it is a 503', async () => {
    view.list.list.mockRejectedValue(new ProceduresRepositoryUnavailableError('caída'));

    await expect(view.service.list(ADMIN, 1, 20)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
