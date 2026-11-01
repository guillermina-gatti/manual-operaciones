import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth';
import { AreasService } from './areas.service';
import { AreaResponse } from './dto/area.response';

@ApiTags('areas')
@ApiBearerAuth()
@Controller('areas')
@UseGuards(JwtAuthGuard)
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'Catálogo completo de áreas activas e inactivas, ordenado por nombre y UUID',
    type: AreaResponse,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'La ruta no acepta parámetros de consulta' })
  @ApiResponse({ status: 401, description: 'Sin autenticación o cuenta inactiva' })
  @ApiResponse({ status: 503, description: 'La base de datos no responde' })
  list(@Query() query: Record<string, unknown>): Promise<AreaResponse[]> {
    if (Object.keys(query).length > 0) {
      throw new BadRequestException('GET /api/areas no admite parámetros de consulta');
    }
    return this.areas.list();
  }
}
