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

// Límite máximo de tamaño de archivo: 10 Megabytes
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Clase DTO exclusiva para documentar en Swagger el cuerpo multipart/form-data
class UploadDocumentBody extends CreateDocumentDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PDF, .txt o .md, hasta 10 MB',
  })
  file: unknown;
}

// Clase para documentar en Swagger la respuesta de listados paginados
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

// Clase para documentar en Swagger la respuesta de enlaces temporales
class DownloadUrlBody {
  @ApiProperty({ example: 'https://…' })
  url: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

// Mensaje descriptivo reutilizable para respuestas 404
const NOT_FOUND_DESCRIPTION =
  'El documento no existe o no es visible para el usuario (misma respuesta en los dos casos)';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard) // Aplica autenticación y control de roles a todas las rutas
export class DocumentsController {
  constructor(
    private readonly uploads: DocumentUploadService,
    private readonly queries: DocumentQueryService,
  ) {}

  // Ruta POST /documents: Carga de un nuevo documento (Solo ADMINs)
  @Post()
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 }, // Máximo 10MB y 1 solo archivo
      defParamCharset: 'utf8', // Corrige problemas de caracteres especiales en el nombre del archivo
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

  // Ruta GET /documents: Obtener lista paginada de documentos visibles para el usuario
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

  // Ruta GET /documents/:id: Obtener el detalle de un documento específico por su ID
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

  // Ruta GET /documents/:id/download: Generar enlace firmado para descargar el archivo
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
