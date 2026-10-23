/* Rutas HTTP de documentos. Sin lógica: valida la entrada con guards, multer y el DTO, y llama al servicio */

import {
  Body,
  Controller,
  Post,
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
import { DocumentUploadService } from './document-upload.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentResponse } from './dto/document.response';
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

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly uploads: DocumentUploadService) {}

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
}
