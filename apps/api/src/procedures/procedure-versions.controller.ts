/* HTTP routes to publish a draft and to read the history and the versions of a procedure (spec 015).
No logic: guards, pipes and DTOs validate, the services decide, the response is mapped field by field */
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import { CompareResponse, toCompareResponse } from './dto/compare.response';
import { CompareVersionsQuery } from './dto/compare-versions.query';
import { ListVersionsQuery } from './dto/list-versions.query';
import { PublishVersionDto } from './dto/publish-version.dto';
import { toVersionDetailResponse, VersionDetailResponse } from './dto/version-detail.response';
import {
  toVersionHistoryItem,
  toVersionHistoryPage,
  VersionHistoryItemResponse,
  VersionHistoryPageResponse,
} from './dto/version-history.response';
import { ProcedureCompareService } from './procedure-compare.service';
import { ProcedureHistoryService } from './procedure-history.service';
import { ProcedurePublishService } from './procedure-publish.service';
import { FORBIDDEN, INVALID, NOT_FOUND, UNAUTHORIZED, UNAVAILABLE } from './version-api-responses';

const CONFLICT = {
  status: 409,
  description:
    'reason: "VERSION_NOT_DRAFT" (no es un borrador), "NO_STEPS" (no tiene pasos) o "NO_AREAS" (el procedimiento no tiene áreas)',
};

@ApiTags('procedures')
@ApiBearerAuth()
@Controller('procedures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProcedureVersionsController {
  constructor(
    private readonly publishing: ProcedurePublishService,
    private readonly history: ProcedureHistoryService,
    private readonly comparing: ProcedureCompareService,
  ) {}

  // R2: the draft becomes the PUBLISHED one.
  @Post(':id/versions/:versionId/publish')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: 'La versión publicada', type: VersionHistoryItemResponse })
  @ApiResponse(INVALID)
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  @ApiResponse(UNAVAILABLE)
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: PublishVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<VersionHistoryItemResponse> {
    return toVersionHistoryItem(await this.publishing.publish(user, id, versionId, dto));
  }

  // R8: the history, newest first.
  @Get(':id/versions')
  @ApiResponse({ status: 200, description: 'Una página: { data, total, page, limit }', type: VersionHistoryPageResponse })
  @ApiResponse(INVALID)
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListVersionsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<VersionHistoryPageResponse> {
    const page = await this.history.list(user, id, query.page, query.limit);
    return toVersionHistoryPage(page, query.page, query.limit);
  }

  // R10: what changed between two versions. Before :versionId, so "compare" is not taken for an id.
  @Get(':id/versions/compare')
  @ApiResponse({ status: 200, description: 'Pasos agregados, quitados y modificados', type: CompareResponse })
  @ApiResponse({ ...INVALID, description: 'Falta from o to, no son UUID, o son la misma versión' })
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async compare(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CompareVersionsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<CompareResponse> {
    return toCompareResponse(await this.comparing.compare(user, id, query.from, query.to));
  }

  // R9: one version with its steps, in any state.
  @Get(':id/versions/:versionId')
  @ApiResponse({ status: 200, description: 'La versión con sus pasos', type: VersionDetailResponse })
  @ApiResponse(INVALID)
  @ApiResponse(UNAUTHORIZED)
  @ApiResponse(FORBIDDEN)
  @ApiResponse(NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async getVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<VersionDetailResponse> {
    return toVersionDetailResponse(await this.history.getVersion(user, id, versionId));
  }
}
