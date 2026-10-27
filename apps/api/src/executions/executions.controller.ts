/* HTTP routes of step-by-step execution (spec 005). No logic: guards, pipes and the
DTO validate the input, the service decides, and the response is mapped field by field */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import {
  ExecutionResponse,
  toExecutionResponse,
} from './dto/execution.response';
import { StartExecutionDto } from './dto/start-execution.dto';
import { ExecutionService } from './execution.service';

const UNAUTHORIZED = { status: 401, description: 'Sin autenticación' };
// Provisional: until it is agreed whether ADMIN and SUPERVISOR can execute.
const FORBIDDEN = {
  status: 403,
  description: 'El rol no puede ejecutar procedimientos (solo EMPLOYEE)',
};
const EXECUTION_NOT_FOUND = {
  status: 404,
  description:
    'La ejecución no existe, es de otro usuario, el usuario ya no comparte un área con el procedimiento o el paso no es de su versión (misma respuesta en todos los casos)',
};
const UNAVAILABLE = {
  status: 503,
  description:
    'La base, el catálogo de procedimientos o el directorio de usuarios no responden',
};

@ApiTags('executions')
@ApiBearerAuth()
@Controller('executions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EMPLOYEE')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionService) {}

  // POST /executions: starts an execution, or returns the one in progress (CA3).
  @Post()
  @ApiResponse({
    status: 201,
    description:
      'Ejecución nueva, atada a la versión publicada, con el paso 1 iniciado',
    type: ExecutionResponse,
  })
  @ApiResponse({
    status: 200,
    description:
      'El usuario ya tenía una ejecución en curso de ese procedimiento: se devuelve esa',
    type: ExecutionResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'procedureId falta, no es un UUID o hay propiedades de más',
  })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse({
    status: 404,
    description:
      'El procedimiento no existe, no tiene una versión publicada con pasos o no comparte un área con el usuario',
  })
  @ApiResponse(UNAVAILABLE)
  async start(
    @Body() dto: StartExecutionDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ExecutionResponse> {
    const { execution, created } = await this.executions.start(
      user,
      dto.procedureId,
    );
    response.status(created ? 201 : 200);
    return toExecutionResponse(execution);
  }

  // GET /executions/:id: the execution with its steps and where to resume (CA3, CA4).
  @Get(':id')
  @ApiResponse({ status: 200, description: 'Detalle', type: ExecutionResponse })
  @ApiResponse({ status: 400, description: 'El id no es un UUID' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(EXECUTION_NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExecutionResponse> {
    return toExecutionResponse(await this.executions.findOne(user, id));
  }

  // POST /executions/:id/steps/:stepId/complete: ends the current step and starts the
  // next one, or completes the execution (CA2).
  @Post(':id/steps/:stepId/complete')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'Ejecución actualizada (COMPLETED si era el último paso)',
    type: ExecutionResponse,
  })
  @ApiResponse({ status: 400, description: 'Un id no es un UUID' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(EXECUTION_NOT_FOUND)
  @ApiResponse({
    status: 409,
    description:
      'reason: "EXECUTION_COMPLETED" (la ejecución ya terminó), "STEP_OUT_OF_ORDER" (no es el paso actual) o "STEP_ALREADY_FINISHED" (el paso ya terminó)',
  })
  @ApiResponse(UNAVAILABLE)
  async completeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExecutionResponse> {
    return toExecutionResponse(
      await this.executions.completeStep(user, id, stepId),
    );
  }
}
