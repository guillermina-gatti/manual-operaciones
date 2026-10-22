import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { DownloadUrl, FileStorage } from '../storage/file-storage';
import { AccessSubject, canView, listWhere } from './document-access.policy';
import { DocumentRecord, DocumentsRepository } from './documents.repository';
import {
  DocumentResponse,
  DocumentSummary,
  toDocumentResponse,
  toDocumentSummary,
} from './dto/document.response';
import { ListDocumentsQuery } from './dto/list-documents.query';
import { UsersDirectory } from './ports/users-directory';

// Forma del listado (R13). La clase para Swagger la agrega el controller (T19).
export interface DocumentListResponse {
  data: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

// R11: el mismo error, con el mismo mensaje, para un documento inexistente y para uno no visible.
const documentNotFound = () =>
  new NotFoundException('No se encontró el documento');

// Consultas de documentos (plan 1): listado, detalle y descarga.
@Injectable()
export class DocumentQueryService {
  constructor(
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
  ) {}

  async findOne(user: AuthUser, id: string): Promise<DocumentResponse> {
    return toDocumentResponse(await this.findVisible(user, id));
  }

  // R12: en cualquier processingStatus, y el enlace se pide solo después de comprobar R10.
  async getDownloadUrl(user: AuthUser, id: string): Promise<DownloadUrl> {
    const { currentVersion } = await this.findVisible(user, id);
    return this.storage.getDownloadUrl(
      currentVersion.storageKey,
      currentVersion.originalFileName,
    );
  }

  private async findVisible(
    user: AuthUser,
    id: string,
  ): Promise<DocumentRecord> {
    // Primero el visor y después el documento, siempre: si se cortara antes para un id inexistente,
    // la diferencia de tiempo revelaría qué documentos existen.
    const viewer = await this.viewerFor(user);
    const record = await this.documents.findByIdWithAreas(id);
    if (!record || !canView(viewer, record)) throw documentNotFound();
    return record;
  }

  async list(
    user: AuthUser,
    query: ListDocumentsQuery,
  ): Promise<DocumentListResponse> {
    const viewer = await this.viewerFor(user);
    const { data, total } = await this.documents.list(
      listWhere(viewer), // la regla de visibilidad vive en la política (R10, D2)
      query.page,
      query.limit,
    );
    return {
      data: data.map(toDocumentSummary),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  // El rol sale de la sesión; las áreas, del directorio y no del token (D5).
  // Si el directorio falla, el error se propaga: nunca se lista sin filtro.
  private async viewerFor(user: AuthUser): Promise<AccessSubject> {
    // El ADMIN ve todo y la política no usa sus áreas: no hace falta pedirlas.
    if (user.role === 'ADMIN') return { role: user.role, areaIds: [] };
    const found = await this.users.findById(user.id);
    // Un usuario que el directorio no conoce no ve ningún área.
    return { role: user.role, areaIds: found?.areaIds ?? [] };
  }
}
