/* Rutas HTTP de documentos. Sin lógica: valida la entrada con guards, multer y el DTO, y llama al servicio */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
  DocumentSearchResponse,
  PendingReviewResponse,
  VersionHistoryResponse,
} from './document-query.service';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentUploadService } from './document-upload.service';
import { ChangeAreasDto } from './dto/change-areas.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import {
  DocumentResponse,
  DocumentSearchResult,
  DocumentSummary,
  VersionHistoryItem,
} from './dto/document.response';
import { ListDocumentsQuery } from './dto/list-documents.query';
import { MarkReviewedDto } from './dto/mark-reviewed.dto';
import { SearchDocumentsQuery } from './dto/search-documents.query';
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

// Lo mismo para el cuerpo de la versión nueva (spec 003)
class UploadVersionBody extends CreateVersionDto {
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

// Clase para documentar en Swagger "Por revisar" (spec 005): el listado, más si el usuario es revisor
class PendingReviewBody
  extends DocumentListBody
  implements PendingReviewResponse
{
  @ApiProperty({
    example: true,
    description:
      'true si es ADMIN o responsable de algún documento activo que ve, aunque no tenga pendientes',
  })
  isReviewer: boolean;
}

// Clase para documentar en Swagger la respuesta de la búsqueda (spec 004)
class DocumentSearchBody implements DocumentSearchResponse {
  @ApiProperty({ type: [DocumentSearchResult] })
  data: DocumentSearchResult[];

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

// Clase para documentar en Swagger el historial de versiones (spec 003)
class VersionHistoryBody implements VersionHistoryResponse {
  @ApiProperty({ type: [VersionHistoryItem] })
  data: VersionHistoryItem[];
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

// Ciclo de vida (spec 003): respuestas comunes a las acciones sobre un documento existente
const ADMIN_ONLY_DESCRIPTION =
  'El rol no puede modificar documentos (solo ADMIN)';
const ARCHIVED_DESCRIPTION = 'El documento está archivado (reason: "ARCHIVED")';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard) // Aplica autenticación y control de roles a todas las rutas
export class DocumentsController {
  constructor(
    private readonly uploads: DocumentUploadService,
    private readonly queries: DocumentQueryService,
    private readonly lifecycle: DocumentLifecycleService,
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

  // Ruta GET /documents/search: Buscar en el título, la descripción y el contenido (spec 004).
  // Va ANTES de GET /documents/:id: si no, "search" llega al ParseUUIDPipe y responde 400.
  @Get('search')
  @ApiResponse({
    status: 200,
    description:
      'Documentos visibles que coinciden, del más relevante al menos relevante, con el fragmento',
    type: DocumentSearchBody,
  })
  @ApiResponse({
    status: 400,
    description:
      'q falta o no tiene entre 3 y 100 caracteres (sin los espacios de los extremos), o page o limit inválidos',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 503,
    description: 'La base o el directorio de usuarios no responden',
  })
  search(
    @Query() query: SearchDocumentsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentSearchResponse> {
    return this.queries.search(user, query);
  }

  // Ruta GET /documents/pending-review: "Por revisar" (spec 005, R5). Va ANTES de GET /documents/:id,
  // como search. Sin @Roles: quien no es responsable de nada recibe la lista vacía, no 403 (D9)
  @Get('pending-review')
  @ApiResponse({
    status: 200,
    description:
      'Documentos activos por vencer o vencidos que el usuario puede revisar, los vencidos primero, y si es revisor',
    type: PendingReviewBody,
  })
  @ApiResponse({
    status: 400,
    description: 'page o limit inválidos (limit va de 1 a 100)',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 503,
    description: 'La base o el directorio de usuarios no responden',
  })
  pendingReview(
    @Query() query: ListDocumentsQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<PendingReviewResponse> {
    return this.queries.pendingReview(user, query);
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

  // Ruta PATCH /documents/:id/areas: Cambiar las áreas y, opcionalmente, el responsable (spec 003)
  @Patch(':id/areas')
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Documento con las áreas nuevas',
    type: DocumentResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'id o datos inválidos, área inexistente o responsable sin acceso a las áreas nuevas',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 403, description: ADMIN_ONLY_DESCRIPTION })
  @ApiResponse({ status: 404, description: 'El documento no existe' })
  @ApiResponse({ status: 409, description: ARCHIVED_DESCRIPTION })
  @ApiResponse({
    status: 503,
    description: 'La base no responde; no cambió nada',
  })
  changeAreas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAreasDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.lifecycle.changeAreas(id, dto, user);
  }

  // Ruta POST /documents/:id/versions: Subir una versión nueva (spec 003). Mismos límites que la carga
  @Post(':id/versions')
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadVersionBody })
  @ApiResponse({
    status: 201,
    description: 'Documento con la versión nueva como vigente',
    type: DocumentResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'id inválido, falta el archivo o reviewDate mal formada o no posterior a hoy',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 403, description: ADMIN_ONLY_DESCRIPTION })
  @ApiResponse({ status: 404, description: 'El documento no existe' })
  @ApiResponse({
    status: 409,
    description:
      'reason: "ARCHIVED" (archivado), "IDENTICAL_TO_CURRENT" (igual a la vigente), "DUPLICATE" (igual a otro documento, con existingDocumentId) o "CONCURRENT_VERSION"',
  })
  @ApiResponse({ status: 413, description: 'El archivo pesa más de 10 MB' })
  @ApiResponse({ status: 415, description: 'No es un PDF, .txt o .md real' })
  @ApiResponse({
    status: 503,
    description:
      'El almacenamiento, la base o la cola no responden; no se guardó nada',
  })
  addVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileInput | undefined,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.lifecycle.addVersion(id, file, dto, user);
  }

  // Ruta GET /documents/:id/versions: Historial de versiones (spec 003, R12). El guard corre antes
  // que nada: otro rol recibe 403 aunque el documento no exista
  @Get(':id/versions')
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Versiones, de la más nueva a la más vieja',
    type: VersionHistoryBody,
  })
  @ApiResponse({ status: 400, description: 'El id no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'Solo el ADMIN ve el historial',
  })
  @ApiResponse({ status: 404, description: 'El documento no existe' })
  @ApiResponse({ status: 503, description: 'La base no responde' })
  listVersions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VersionHistoryResponse> {
    return this.queries.listVersions(id);
  }

  // Ruta GET /documents/:id/versions/:versionId/download: Enlace de una versión (spec 003, R12)
  @Get(':id/versions/:versionId/download')
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Enlace temporal de descarga de esa versión (5 minutos)',
    type: DownloadUrlBody,
  })
  @ApiResponse({ status: 400, description: 'Un id no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'Solo el ADMIN descarga versiones anteriores',
  })
  @ApiResponse({
    status: 404,
    description: 'El documento no existe o la versión no es de ese documento',
  })
  @ApiResponse({
    status: 503,
    description: 'La base o el almacenamiento no responden',
  })
  getVersionDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<DownloadUrl> {
    return this.queries.getVersionDownloadUrl(id, versionId);
  }

  // Ruta POST /documents/:id/review: "Marcar como revisado" (spec 005, R6 a R9; D10). Sin @Roles: el
  // ADMIN o el responsable, cosa que depende del documento y la decide el servicio
  @Post(':id/review')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description:
      'Documento con la fecha de revisión nueva y la última revisión registrada',
    type: DocumentResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'id inválido, o reviewDate falta, está mal formada o no es posterior a hoy (en hora de Argentina)',
  })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({
    status: 403,
    description: 'Ve el documento, pero no es el ADMIN ni el responsable',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION })
  @ApiResponse({ status: 409, description: ARCHIVED_DESCRIPTION })
  @ApiResponse({
    status: 503,
    description: 'La base o el directorio no responden; no cambió nada',
  })
  markReviewed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReviewedDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.lifecycle.markReviewed(id, dto, user);
  }

  // Ruta POST /documents/:id/archive: Archivar un documento (spec 003, D5)
  @Post(':id/archive')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiResponse({
    status: 200,
    description: 'Documento archivado',
    type: DocumentResponse,
  })
  @ApiResponse({ status: 400, description: 'El id no es un UUID' })
  @ApiResponse({ status: 401, description: 'Sin autenticación' })
  @ApiResponse({ status: 403, description: ADMIN_ONLY_DESCRIPTION })
  @ApiResponse({ status: 404, description: 'El documento no existe' })
  @ApiResponse({
    status: 409,
    description: 'El documento ya está archivado (reason: "ARCHIVED")',
  })
  @ApiResponse({
    status: 503,
    description: 'La base no responde; no cambió nada',
  })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentResponse> {
    return this.lifecycle.archive(id, user);
  }
}
