/* HTTP routes to list and read the procedures that the user can see (spec 006, HU11).
Open to every role: the visibility is decided by the service (R13 and R14), not by the role.
No logic here: guards, pipes and DTOs validate, the service decides, the response is mapped field by field */
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import { ListProceduresQuery } from './dto/list-procedures.query';
import {
  ProcedureDetailResponse,
  ProcedureListPageResponse,
  toProcedureDetailResponse,
  toProcedureListPage,
} from './dto/procedure-view.response';
import { ProcedureViewService } from './procedure-view.service';
import { INVALID, UNAUTHORIZED, UNAVAILABLE } from './version-api-responses';

const NOT_FOUND = {
  status: 404,
  description:
    'El procedimiento no existe, es de otra área o no tiene una versión publicada (misma respuesta en todos los casos)',
};

@ApiTags('procedures')
@ApiBearerAuth()
@Controller('procedures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProcedureViewController {
  constructor(private readonly view: ProcedureViewService) {}

  // R13 and R16: the ones the user can see, newest first.
  @Get()
  @ApiResponse({ status: 200, description: 'Una página: { data, total, page, limit }', type: ProcedureListPageResponse })
  @ApiResponse(INVALID)
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(UNAVAILABLE)
  async list(
    @Query() query: ListProceduresQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<ProcedureListPageResponse> {
    const page = await this.view.list(user, query.page, query.limit);
    return toProcedureListPage(page, query.page, query.limit);
  }

  // R13 and R14: one procedure, with the version the user can see and its steps.
  @Get(':id')
  @ApiResponse({ status: 200, description: 'El procedimiento con su versión y sus pasos', type: ProcedureDetailResponse })
  @ApiResponse(INVALID)
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProcedureDetailResponse> {
    return toProcedureDetailResponse(await this.view.get(user, id));
  }
}
