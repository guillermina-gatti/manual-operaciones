/* Use case of the area assignment of a procedure (spec 006, R11) */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AreasDirectory } from '../documents/ports/areas-directory';
import { toHttpException } from './http-errors';
import { canManage } from './procedure-access.policy';
import { ProceduresRepository } from './procedures.repository';

@Injectable()
export class ProcedureAreasService {
  private readonly logger = new Logger(ProcedureAreasService.name);

  constructor(
    private readonly procedures: ProceduresRepository,
    private readonly areas: AreasDirectory,
  ) {}

  // R11: the whole set replaces the previous one. The directory says which areas exist
  // before anything is written, so a bad id leaves the procedure as it was (E18, P19).
  async setAreas(
    user: AuthUser,
    procedureId: string,
    areaIds: string[],
  ): Promise<string[]> {
    try {
      if (!canManage(user.role)) {
        throw new ForbiddenException(
          'No tenés permiso para modificar procedimientos',
        );
      }
      if (areaIds.length > 0) {
        const existing = await this.areas.findExistingIds(areaIds);
        if (existing.length !== areaIds.length) {
          throw new BadRequestException('Alguna de las áreas no existe');
        }
      }
      const saved = await this.procedures.setAreas(procedureId, areaIds);
      if (!saved)
        throw new NotFoundException('No se encontró el procedimiento');
      return saved;
    } catch (error) {
      throw toHttpException(error, this.logger, 'setAreas');
    }
  }
}
