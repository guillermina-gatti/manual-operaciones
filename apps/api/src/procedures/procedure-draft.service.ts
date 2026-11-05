/* Use cases of procedures and drafts (spec 006): create, new draft, edit and delete a draft */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import type { CreateProcedureDto } from './dto/create-procedure.dto';
import type { CreateStepDto } from './dto/create-step.dto';
import type { ReorderStepsDto } from './dto/reorder-steps.dto';
import type { UpdateStepDto } from './dto/update-step.dto';
import type { UpdateVersionDto } from './dto/update-version.dto';
import { toHttpException } from './http-errors';
import type { ProcedureOperation } from './http-errors';
import { canManage } from './procedure-access.policy';
import {
  DraftAlreadyExistsError,
  NoPublishedVersionError,
  ProcedureRecord,
  ProceduresRepository,
  StepRecord,
  StepRejection,
  VersionRecord,
} from './procedures.repository';

// R6: the most steps a draft can have.
const MAX_STEPS = 50;

// The same error and message for a procedure that does not exist and for a version that is not in it.
const procedureNotFound = () =>
  new NotFoundException('No se encontró el procedimiento');

// A step that is not in that version looks like any other missing resource.
const stepNotFound = () => new NotFoundException('No se encontró el paso');

const conflict = (reason: string, message: string) =>
  new ConflictException({
    statusCode: 409,
    message,
    error: 'Conflict',
    reason,
  });

const CONFLICT_MESSAGES = {
  DRAFT_ALREADY_EXISTS: 'El procedimiento ya tiene un borrador abierto',
  NO_PUBLISHED_VERSION:
    'El procedimiento no tiene una versión publicada de la que partir',
  VERSION_NOT_EDITABLE: 'Solo se puede modificar una versión en borrador',
  STEP_LIMIT_REACHED: `Un borrador admite hasta ${MAX_STEPS} pasos`,
} as const;

@Injectable()
export class ProcedureDraftService {
  private readonly logger = new Logger(ProcedureDraftService.name);

  constructor(private readonly procedures: ProceduresRepository) {}

  // R2: the procedure is born with its version 1 as a DRAFT and the caller as owner.
  create(user: AuthUser, dto: CreateProcedureDto): Promise<ProcedureRecord> {
    return this.run('create', user, () =>
      this.procedures.create({
        id: randomUUID(),
        versionId: randomUUID(),
        ownerId: user.id,
        title: dto.title,
        description: dto.description ?? null,
      }),
    );
  }

  // R3 and R4: the next version as a DRAFT, copied from the current one.
  createDraft(user: AuthUser, procedureId: string): Promise<VersionRecord> {
    return this.run('createDraft', user, async () => {
      try {
        const draft = await this.procedures.createDraft({
          procedureId,
          versionId: randomUUID(),
          createdById: user.id,
        });
        if (!draft) throw procedureNotFound();
        return draft;
      } catch (error) {
        if (error instanceof DraftAlreadyExistsError) {
          throw conflict(
            'DRAFT_ALREADY_EXISTS',
            CONFLICT_MESSAGES.DRAFT_ALREADY_EXISTS,
          );
        }
        if (error instanceof NoPublishedVersionError) {
          throw conflict(
            'NO_PUBLISHED_VERSION',
            CONFLICT_MESSAGES.NO_PUBLISHED_VERSION,
          );
        }
        throw error;
      }
    });
  }

  // R5 and R9: title and/or description of a draft; at least one of them.
  update(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    changes: UpdateVersionDto,
  ): Promise<VersionRecord> {
    return this.run('update', user, async () => {
      if (changes.title === undefined && changes.description === undefined) {
        throw new BadRequestException(
          'Indicá al menos el título o la descripción',
        );
      }
      const result = await this.procedures.updateDraft(procedureId, versionId, {
        title: changes.title,
        description: changes.description,
      });
      if (!result.ok) throw this.rejection(result.reason);
      return result.value;
    });
  }

  // R9 and R10: deletes a draft, and the procedure with it when it was the only version.
  remove(
    user: AuthUser,
    procedureId: string,
    versionId: string,
  ): Promise<void> {
    return this.run('remove', user, async () => {
      const result = await this.procedures.deleteDraft(procedureId, versionId);
      if (!result.ok) throw this.rejection(result.reason);
    });
  }

  // R6 and R7: a new step at the end or at a position, up to MAX_STEPS.
  addStep(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    dto: CreateStepDto,
  ): Promise<StepRecord> {
    return this.run('addStep', user, async () => {
      const result = await this.procedures.addStep(
        procedureId,
        versionId,
        {
          id: randomUUID(),
          title: dto.title,
          description: dto.description ?? '',
          position: dto.position,
        },
        MAX_STEPS,
      );
      if (!result.ok) throw this.rejection(result.reason);
      return result.value;
    });
  }

  updateStep(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    stepId: string,
    changes: UpdateStepDto,
  ): Promise<StepRecord> {
    return this.run('updateStep', user, async () => {
      if (changes.title === undefined && changes.description === undefined) {
        throw new BadRequestException(
          'Indicá al menos el título o la descripción',
        );
      }
      const result = await this.procedures.updateStep(
        procedureId,
        versionId,
        stepId,
        { title: changes.title, description: changes.description },
      );
      if (!result.ok) throw this.rejection(result.reason);
      return result.value;
    });
  }

  removeStep(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    stepId: string,
  ): Promise<void> {
    return this.run('removeStep', user, async () => {
      const result = await this.procedures.deleteStep(
        procedureId,
        versionId,
        stepId,
      );
      if (!result.ok) throw this.rejection(result.reason);
    });
  }

  // R8: the repository checks the list against the steps of the draft with the version locked.
  reorderSteps(
    user: AuthUser,
    procedureId: string,
    versionId: string,
    dto: ReorderStepsDto,
  ): Promise<StepRecord[]> {
    return this.run('reorderSteps', user, async () => {
      const result = await this.procedures.reorderSteps(
        procedureId,
        versionId,
        dto.stepIds,
      );
      if (!result.ok) throw this.rejection(result.reason);
      return result.value;
    });
  }

  private rejection(reason: StepRejection) {
    switch (reason) {
      case 'NOT_FOUND':
        return procedureNotFound();
      case 'STEP_NOT_FOUND':
        return stepNotFound();
      case 'NOT_A_DRAFT':
        return conflict(
          'VERSION_NOT_EDITABLE',
          CONFLICT_MESSAGES.VERSION_NOT_EDITABLE,
        );
      case 'STEP_LIMIT_REACHED':
        return conflict(
          'STEP_LIMIT_REACHED',
          CONFLICT_MESSAGES.STEP_LIMIT_REACHED,
        );
      case 'INVALID_POSITION':
        return new BadRequestException('La posición indicada no es válida');
      case 'INVALID_ORDER':
        return new BadRequestException(
          'La lista tiene que incluir todos los pasos del borrador, una sola vez cada uno',
        );
    }
  }

  // R1: only an ADMIN gets here (the controller's guard says it too). Every error leaves as HTTP.
  private async run<T>(
    operation: ProcedureOperation,
    user: AuthUser,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      if (!canManage(user.role)) {
        throw new ForbiddenException(
          'No tenés permiso para modificar procedimientos',
        );
      }
      return await work();
    } catch (error) {
      throw toHttpException(error, this.logger, operation);
    }
  }
}
