import { Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RepositoryUnavailableError } from '../documents/documents.repository';
import { detail } from '../../test/procedures/version-fixtures';
import {
  ADMIN,
  EMPLOYEE,
  ID,
  buildViewService,
  operaciones,
  procedure,
  version,
} from '../../test/procedures/view-fixtures';

describe('ProcedureViewService.get (spec 006, R13, R14, P22)', () => {
  const steps = [{ id: 's1', order: 1, title: 'Contar', description: '' }];
  let view: ReturnType<typeof buildViewService>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    view = buildViewService();
    view.versions.findVersion.mockImplementation((_id: string, versionId: string) =>
      Promise.resolve(detail({ id: versionId, steps })),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const asEmployee = () => view.service.get(EMPLOYEE, ID);

  it('E22: a non-ADMIN gets only the current version with its steps, never the draft', async () => {
    view.procedures.findById.mockResolvedValue(
      procedure([version(1, 'SUPERSEDED'), version(2, 'PUBLISHED'), version(3, 'DRAFT')]),
    );

    const result = await asEmployee();

    expect(view.versions.findVersion).toHaveBeenCalledWith(ID, version(2, 'PUBLISHED').id);
    expect(result.version.steps).toEqual(steps);
    expect(result).not.toHaveProperty('hasOpenDraft');
  });

  it('P22: an ADMIN gets the open draft with its steps and hasOpenDraft', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED'), version(3, 'DRAFT')]));

    const result = await view.service.get(ADMIN, ID);

    expect(view.versions.findVersion).toHaveBeenCalledWith(ID, version(3, 'DRAFT').id);
    expect(result.hasOpenDraft).toBe(true);
  });

  it('P22: an ADMIN with no draft gets the current version', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(1, 'SUPERSEDED'), version(2, 'PUBLISHED')]));

    const result = await view.service.get(ADMIN, ID);

    expect(view.versions.findVersion).toHaveBeenCalledWith(ID, version(2, 'PUBLISHED').id);
    expect(result.hasOpenDraft).toBe(false);
  });

  it('does not give the owner or any internal field', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED')]));

    const result = await asEmployee();

    expect(Object.keys(result).sort()).toEqual(['areas', 'createdAt', 'id', 'version']);
  });

  it('E21: a procedure of another area is a 404', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED')], [operaciones]));

    await expect(asEmployee()).rejects.toThrow(new NotFoundException('No se encontró el procedimiento'));
  });

  it('E22: a procedure with only a draft, or a published one without steps, is a 404', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(1, 'DRAFT')]));
    await expect(asEmployee()).rejects.toBeInstanceOf(NotFoundException);

    view.procedures.findById.mockResolvedValue(procedure([version(1, 'PUBLISHED', 0)]));
    await expect(asEmployee()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('R14: a missing procedure has the same 404, and the directory was asked anyway', async () => {
    view.procedures.findById.mockResolvedValue(null);
    const missing = await asEmployee().catch((error: unknown) => error);
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED')], [operaciones]));
    const foreign = await asEmployee().catch((error: unknown) => error);

    expect(missing).toEqual(foreign);
    expect(view.users.findById).toHaveBeenCalledTimes(2);
  });

  it('E24: a user without areas gets a 404', async () => {
    view.users.findById.mockResolvedValue(null);
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED')]));

    await expect(asEmployee()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('E25: if the user directory fails it is a 503', async () => {
    view.users.findById.mockRejectedValue(new RepositoryUnavailableError('caído'));

    await expect(asEmployee()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('a version that disappears between the two reads is a 404', async () => {
    view.procedures.findById.mockResolvedValue(procedure([version(2, 'PUBLISHED')]));
    view.versions.findVersion.mockResolvedValue(null);

    await expect(asEmployee()).rejects.toBeInstanceOf(NotFoundException);
  });
});
