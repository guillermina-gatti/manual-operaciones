/* Rutas HTTP de documentos. Sin lógica: valida la entrada con guards, multer y el DTO, y llama al servicio */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import type { AuthUser } from '../common/auth';
import type { DownloadUrl } from '../storage/file-storage';
import {
  DocumentListResponse,
  DocumentQueryService,
} from './document-query.service';
import { DocumentUploadService } from './document-upload.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentResponse, DocumentSummary } from './dto/document.response';
import { ListDocumentsQuery } from './dto/list-documents.query';
import type { UploadedFileInput } from './file-inspector';

// R3: hasta 10 MB y un solo archivo; si se pasa, multer corta la lectura y Nest responde 413.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Solo para Swagger: los campos del DTO más el archivo, como se mandan en el multipart.
class UploadDocumentBody extends CreateDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PDF, .txt o .md, hasta 10 MB',
  })
  file: unknown;
}

// Solo para Swagger: la forma del listado (plan 3.2) que devuelve DocumentQueryService.
class DocumentListBody implements DocumentListResponse {
  @ApiProperty({ type: [DocumentSummary] })
  data: DocumentSummary[];

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

// Solo para Swagger: la respuesta de la descarga (plan 3.4).
class DownloadUrlBody {
  @ApiProperty({ example: 'https://…' })
  url: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

// R11: el mismo 404 si el documento no existe o si no es visible para el usuario.
const NOT_FOUND_DESCRIPTION =
  'El documento no existe o no es visible para el usuario (misma respuesta en los dos casos)';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly uploads: DocumentUploadService,
    private readonly queries: DocumentQueryService,
  ) {}

  // Los guards corren antes que el interceptor: el 401 y el 403 salen sin leer el archivo (plan 4, pasos 1 y 2).
  @Post()
  @Roles('ADMIN')
  // Sin `storage` ni `dest`, multer guarda el archivo en memoria (memoryStorage): nunca toca el disco.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadDocumentBody })
  @ApiResponse({
    status: 201,
    description: 'Documento cargado',
    type: DocumentResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'Datos inválidos, falta el archivo, área inexistente o responsable sin acceso',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'El rol no puede cargar documentos (solo ADMIN)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ya hay un documento vigente con el mismo archivo (incluye existingDocumentId)',
  })
  @ApiResponse({ status: 413, description: 'El archivo pesa más de 10 MB' })
  @ApiResponse({ status: 415, description: 'No es un PDF, .txt o .md real' })
  @ApiResponse({
    status: 503,
    description:
      'El almacenamiento, la base o la cola no responden; no se guardó nada',
  })
  upload(
    @UploadedFile() file: UploadedFileInput | undefined,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.uploads.upload(file, dto, user);
  }

  // Las consultas no llevan @Roles: entra cualquier usuario con sesión (plan 3.2 a 3.4).
  // Qué documentos ve cada uno lo decide DocumentQueryService (R10).
  @Get()
  @ApiResponse({
    status: 200,
    description: 'Página de documentos visibles',
    type: DocumentListBody,
  })
  @ApiResponse({
    status: 400,
    description: 'page o limit inválidos (limit va de 1 a 100)',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 503, description: 'La base no responde' })
  list(
    @Query() query: ListDocumentsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentListResponse> {
    return this.queries.list(user, query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Detalle', type: DocumentResponse })
  @ApiResponse({ status: 400, description: 'El id no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 503, description: 'La base no responde' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.queries.findOne(user, id);
  }

  @Get(':id/download')
  @ApiResponse({
    status: 200,
    description: 'Enlace temporal de descarga (5 minutos)',
    type: DownloadUrlBody,
  })
  @ApiResponse({ status: 400, description: 'El id no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION })
  @ApiResponse({
    status: 503,
    description: 'La base o el almacenamiento no responden',
  })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DownloadUrl> {
    return this.queries.getDownloadUrl(user, id);
  }
}
