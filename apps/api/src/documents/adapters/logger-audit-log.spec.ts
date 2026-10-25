import { Logger } from '@nestjs/common';
import type { AuditEntry } from '../ports/audit-log';
import { LoggerAuditLog } from './logger-audit-log';

const ADMIN_ID = '0b000000-0000-4000-8000-000000000001';
const DOCUMENT_ID = '0c000000-0000-4000-8000-000000000001';
const AT = new Date('2026-10-22T12:00:00.000Z');

describe('LoggerAuditLog', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('registra una carga exitosa con un objeto estructurado', async () => {
    await new LoggerAuditLog().record({
      action: 'DOCUMENT_UPLOAD',
      actorId: ADMIN_ID,
      documentId: DOCUMENT_ID,
      result: 'SUCCESS',
      at: AT,
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      action: 'DOCUMENT_UPLOAD',
      actorId: ADMIN_ID,
      documentId: DOCUMENT_ID,
      result: 'SUCCESS',
      at: '2026-10-22T12:00:00.000Z',
    });
  });

  it('registra un fallo con su motivo y sin documento', async () => {
    await new LoggerAuditLog().record({
      action: 'DOCUMENT_UPLOAD',
      actorId: ADMIN_ID,
      result: 'FAILURE',
      detail: '415',
      at: AT,
    });

    expect(log).toHaveBeenCalledWith({
      action: 'DOCUMENT_UPLOAD',
      actorId: ADMIN_ID,
      result: 'FAILURE',
      detail: '415',
      at: '2026-10-22T12:00:00.000Z',
    });
  });

  it('no escribe datos que no sean de auditoría, aunque lleguen en el objeto', async () => {
    const entry = {
      action: 'DOCUMENT_UPLOAD',
      actorId: ADMIN_ID,
      documentId: DOCUMENT_ID,
      result: 'SUCCESS',
      at: AT,
      buffer: Buffer.from('contenido del archivo'),
      token: 'Bearer abc.def.ghi',
    } as AuditEntry;
    const tx = { connection: 'postgresql://app:secreto@db/manual' };

    await new LoggerAuditLog().record(entry, tx);

    const [logged] = log.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(logged).sort()).toEqual(
      ['action', 'actorId', 'at', 'documentId', 'result'].sort(),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /contenido|Bearer|secreto/,
    );
  });

  // Spec 003, R13: cada cambio de áreas, versión nueva y archivo queda registrado.
  describe.each([
    'DOCUMENT_AREAS_CHANGE',
    'DOCUMENT_VERSION_UPLOAD',
    'DOCUMENT_ARCHIVE',
  ] as const)('acción %s (spec 003)', (action) => {
    it('registra el éxito con quién, qué documento y cuándo', async () => {
      await new LoggerAuditLog().record({
        action,
        actorId: ADMIN_ID,
        documentId: DOCUMENT_ID,
        result: 'SUCCESS',
        at: AT,
      });

      expect(log).toHaveBeenCalledWith({
        action,
        actorId: ADMIN_ID,
        documentId: DOCUMENT_ID,
        result: 'SUCCESS',
        at: '2026-10-22T12:00:00.000Z',
      });
    });

    it('registra el fallo con su código y el documento', async () => {
      await new LoggerAuditLog().record({
        action,
        actorId: ADMIN_ID,
        documentId: DOCUMENT_ID,
        result: 'FAILURE',
        detail: '409',
        at: AT,
      });

      expect(log).toHaveBeenCalledWith({
        action,
        actorId: ADMIN_ID,
        documentId: DOCUMENT_ID,
        result: 'FAILURE',
        detail: '409',
        at: '2026-10-22T12:00:00.000Z',
      });
    });
  });
});
