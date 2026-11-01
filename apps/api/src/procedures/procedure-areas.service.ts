/* Use case of the area assignment of a procedure (spec 006, R11) */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { toHttpException } from './http-errors';
import { canManage } from './procedure-access.policy';
import { ProcedureAreasCatalog } from './procedure-areas.catalog';
import { ProceduresRepository } from './procedures.repository';

@Injectable()
export class ProcedureAreasService {
  private readonly logger = new Logger(ProcedureAreasService.name);

  constructor(
    private readonly procedures: ProceduresRepository,
    private readonly areas: ProcedureAreasCatalog,
  ) {}

  // R11: the whole set replaces the previous one. The areas are checked before anything is
  // written, so a bad id leaves the procedure as it was (E18, E35, P19).
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
        await this.checkAreas(procedureId, areaIds);
      }
      const saved = await this.procedures.setAreas(procedureId, areaIds);
      if (!saved)
        throw new NotFoundException('No se encontró el procedimiento');
      return saved;
    } catch (error) {
      throw toHttpException(error, this.logger, 'setAreas');
    }
  }

  // Every area must exist (E18). An inactive one is only valid if the procedure already had it
  // (R11, P13): the procedure is read only when the request has an inactive area. A procedure
  // that does not exist has no areas, so an inactive one is new and the answer is 400 (E38).
  private async checkAreas(
    procedureId: string,
    areaIds: string[],
  ): Promise<void> {
    const states = await this.areas.findStates(areaIds);
    if (states.length !== areaIds.length) {
      throw new BadRequestException('Alguna de las áreas no existe');
    }
    const inactiveIds = states
      .filter((area) => !area.isActive)
      .map((area) => area.id);
    if (inactiveIds.length === 0) return;

    const procedure = await this.procedures.findById(procedureId);
    const current = new Set(procedure?.areaIds ?? []);
    if (inactiveIds.some((id) => !current.has(id))) {
      throw new BadRequestException('Alguna de las áreas está inactiva');
    }
  }
}
