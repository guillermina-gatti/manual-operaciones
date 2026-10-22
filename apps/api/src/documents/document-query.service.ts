import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { AccessSubject, listWhere } from './document-access.policy';
import { DocumentsRepository } from './documents.repository';
import { DocumentSummary, toDocumentSummary } from './dto/document.response';
import { ListDocumentsQuery } from './dto/list-documents.query';
import { UsersDirectory } from './ports/users-directory';

// Forma del listado (R13). La clase para Swagger la agrega el controller (T19).
export interface DocumentListResponse {
  data: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

// Consultas de documentos (plan 1): listado, y en T17 detalle y descarga.
@Injectable()
export class DocumentQueryService {
  constructor(
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
  ) {}

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
