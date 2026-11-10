/* What the versions services share: the 404, the 409 and the ADMIN check (spec 015, R1) */
import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { toHttpException } from './http-errors';
import type { ProcedureOperation } from './http-errors';
import { canManage } from './procedure-access.policy';

// The same message for a missing procedure and for a version that is not in it (R3, R9).
export const procedureNotFound = () => new NotFoundException('No se encontró el procedimiento');

export const conflict = (reason: string, message: string) =>
  new ConflictException({ statusCode: 409, message, error: 'Conflict', reason });

// R1: only an ADMIN; every error leaves as HTTP.
export async function runAsAdmin<T>(
  operation: ProcedureOperation,
  user: AuthUser,
  logger: Logger,
  work: () => Promise<T>,
): Promise<T> {
  try {
    if (!canManage(user.role)) {
      throw new ForbiddenException('No tenés permiso para ver ni publicar versiones');
    }
    return await work();
  } catch (error) {
    throw toHttpException(error, logger, operation);
  }
}
