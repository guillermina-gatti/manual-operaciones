import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { UUID_REGEX } from '../auth/session.service';
import { AreasService } from './areas.service';
import { AreaResponse } from './dto/area.response';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

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

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({
    status: 201,
    description: 'Área creada correctamente',
    type: AreaResponse,
  })
  @ApiResponse({ status: 400, description: 'Datos del área inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede crear áreas' })
  @ApiResponse({ status: 409, description: 'Ya existe un área con ese nombre' })
  create(@Body() dto: CreateAreaDto): Promise<AreaResponse> {
    return this.areas.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Área actualizada correctamente',
    type: AreaResponse,
  })
  @ApiResponse({ status: 400, description: 'ID o datos del área inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede modificar áreas' })
  @ApiResponse({ status: 404, description: 'Área no encontrada' })
  @ApiResponse({ status: 409, description: 'Ya existe un área con ese nombre' })
  update(@Param('id') id: string, @Body() dto: UpdateAreaDto): Promise<AreaResponse> {
    if (!UUID_REGEX.test(id)) {
      throw new BadRequestException('ID de área inválido');
    }
    return this.areas.update(id, dto);
  }
}

