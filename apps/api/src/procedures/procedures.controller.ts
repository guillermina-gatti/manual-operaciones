/* HTTP routes to create procedures and edit their drafts and steps (spec 006). No logic: guards,
pipes and the DTOs validate the input, the service decides, and the response is mapped field by
field */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import { AreasResponse } from './dto/areas.response';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { CreateStepDto } from './dto/create-step.dto';
import {
  ProcedureResponse,
  toProcedureResponse,
  toVersionResponse,
  VersionResponse,
} from './dto/procedure.response';
import { ReorderStepsDto } from './dto/reorder-steps.dto';
import { SetAreasDto } from './dto/set-areas.dto';
import { StepResponse, toStepResponse } from './dto/step.response';
import { UpdateStepDto } from './dto/update-step.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { ProcedureAreasService } from './procedure-areas.service';
import { ProcedureDraftService } from './procedure-draft.service';

const UNAUTHORIZED = { status: 401, description: 'Sin autenticación' };
const FORBIDDEN = {
  status: 403,
  description: 'Solo un ADMIN puede modificar procedimientos',
};
const INVALID = {
  status: 400,
  description: 'Un id no es un UUID o el cuerpo es inválido',
};
const NOT_FOUND = {
  status: 404,
  description:
    'El procedimiento, la versión o el paso no existen (misma respuesta en todos los casos)',
};
const NOT_EDITABLE = {
  status: 409,
  description:
    'reason: "VERSION_NOT_EDITABLE" (la versión no es un borrador) o "STEP_LIMIT_REACHED" (el borrador ya tiene 50 pasos)',
};
const UNAVAILABLE = { status: 503, description: 'La base no responde' };

@ApiTags('procedures')
@ApiBearerAuth()
@Controller('procedures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProceduresController {
  constructor(
    private readonly drafts: ProcedureDraftService,
    private readonly areas: ProcedureAreasService,
  ) {}

  // POST /procedures: a procedure with its version 1 as a DRAFT (R2).
  @Post()
  @ApiResponse({
    status: 201,
    description: 'Procedimiento con su versión 1 en borrador',
    type: ProcedureResponse,
  })
  @ApiResponse({ ...INVALID, description: 'Falta el título o es inválido' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(UNAVAILABLE)
  async create(
    @Body() dto: CreateProcedureDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProcedureResponse> {
    return toProcedureResponse(await this.drafts.create(user, dto));
  }

  // POST /procedures/:id/versions: the next draft, copied from the current version (R3, R4).
  @Post(':id/versions')
  @ApiResponse({
    status: 201,
    description: 'Borrador nuevo',
    type: VersionResponse,
  })
  @ApiResponse({ ...INVALID, description: 'El id no es un UUID' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'reason: "DRAFT_ALREADY_EXISTS" (ya hay un borrador abierto) o "NO_PUBLISHED_VERSION" (no hay una versión publicada de la que partir)',
  })
  @ApiResponse(UNAVAILABLE)
  async createDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<VersionResponse> {
    return toVersionResponse(await this.drafts.createDraft(user, id));
  }

  // PATCH /procedures/:id/versions/:versionId: title and/or description of the draft (R5).
  @Patch(':id/versions/:versionId')
  @ApiResponse({
    status: 200,
    description: 'Versión actualizada',
    type: VersionResponse,
  })
  @ApiResponse({
    ...INVALID,
    description:
      'Un id no es un UUID, el cuerpo es inválido o no trae título ni descripción',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: UpdateVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<VersionResponse> {
    return toVersionResponse(
      await this.drafts.update(user, id, versionId, dto),
    );
  }

  // DELETE /procedures/:id/versions/:versionId: deletes a draft (R10).
  @Delete(':id/versions/:versionId')
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Borrador borrado' })
  @ApiResponse({ ...INVALID, description: 'Un id no es un UUID' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.drafts.remove(user, id, versionId);
  }

  // POST …/steps: a step at the end or at a position (R6, R7).
  @Post(':id/versions/:versionId/steps')
  @ApiResponse({ status: 201, description: 'Paso nuevo', type: StepResponse })
  @ApiResponse({
    ...INVALID,
    description:
      'Un id no es un UUID, el cuerpo es inválido o la posición no existe',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async addStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateStepDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StepResponse> {
    return toStepResponse(await this.drafts.addStep(user, id, versionId, dto));
  }

  // PUT …/steps/order: every step of the draft in the new order (R8). It goes before
  // steps/:stepId only for reading; the methods differ, so the routes never clash.
  @Put(':id/versions/:versionId/steps/order')
  @ApiResponse({
    status: 200,
    description: 'Los pasos en el orden nuevo',
    type: [StepResponse],
  })
  @ApiResponse({
    ...INVALID,
    description:
      'Un id no es un UUID o la lista no tiene todos los pasos del borrador, una vez cada uno',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async reorderSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: ReorderStepsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StepResponse[]> {
    const steps = await this.drafts.reorderSteps(user, id, versionId, dto);
    return steps.map(toStepResponse);
  }

  // PATCH …/steps/:stepId: title and/or description of a step (R6).
  @Patch(':id/versions/:versionId/steps/:stepId')
  @ApiResponse({
    status: 200,
    description: 'Paso actualizado',
    type: StepResponse,
  })
  @ApiResponse({
    ...INVALID,
    description:
      'Un id no es un UUID, el cuerpo es inválido o no trae título ni descripción',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async updateStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StepResponse> {
    return toStepResponse(
      await this.drafts.updateStep(user, id, versionId, stepId, dto),
    );
  }

  // DELETE …/steps/:stepId: deletes a step and moves the following ones up (R7).
  @Delete(':id/versions/:versionId/steps/:stepId')
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Paso borrado' })
  @ApiResponse({ ...INVALID, description: 'Un id no es un UUID' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(NOT_EDITABLE)
  @ApiResponse(UNAVAILABLE)
  async removeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.drafts.removeStep(user, id, versionId, stepId);
  }

  // PUT /procedures/:id/areas: the whole set replaces the current one (R11, R12).
  @Put(':id/areas')
  @ApiResponse({
    status: 200,
    description: 'Las áreas que quedaron',
    type: AreasResponse,
  })
  @ApiResponse({
    ...INVALID,
    description:
      'El id no es un UUID, el cuerpo es inválido (repetidos, más de 100, ids que no son UUID) o alguna área no existe',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse({ ...NOT_FOUND, description: 'El procedimiento no existe' })
  @ApiResponse(UNAVAILABLE)
  async setAreas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAreasDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AreasResponse> {
    return { areaIds: await this.areas.setAreas(user, id, dto.areaIds) };
  }
}
