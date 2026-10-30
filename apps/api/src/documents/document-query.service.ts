/*Servicio de consultas de documentos */
import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { Clock, SystemClock } from '../common/clock';
import { DownloadUrl, FileStorage } from '../storage/file-storage';
import { toDbDate, todayInCompany } from './company-date';
import {
  documentNotFound,
  findVisibleDocument,
  viewerFor,
} from './document-access';
import {
  AccessSubject,
  listWhere,
  pendingReviewWhere,
  searchScope,
} from './document-access.policy';
import { DocumentRecord, DocumentsRepository } from './documents.repository';
import {
  DocumentResponse,
  DocumentSearchResult,
  DocumentSummary,
  VersionHistoryItem,
  toDocumentResponse,
  toDocumentSearchResult,
  toDocumentSummary,
  toVersionHistoryItem,
} from './dto/document.response';
import { ListDocumentsQuery } from './dto/list-documents.query';
import { SearchDocumentsQuery } from './dto/search-documents.query';
import { toHttpException } from './http-errors';
import type { HttpOperation } from './http-errors';
import { UsersDirectory } from './ports/users-directory';
import { dueSoonThrough, reviewFor } from './review-status';
import { buildFragment } from './search-fragment';

// Forma del listado (R13). La clase para Swagger la agrega el controller (T19).
export interface DocumentListResponse {
  data: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

// "Por revisar" (spec 005, plan 3.1): la forma del listado, más si el usuario es revisor (D19).
export interface PendingReviewResponse extends DocumentListResponse {
  isReviewer: boolean;
}

// Historial de versiones (spec 003, plan 1.4). La clase para Swagger la agrega el controller (T16).
export interface VersionHistoryResponse {
  data: VersionHistoryItem[];
}

// Búsqueda (spec 004, plan 1.2): la misma forma que el listado, con el fragmento en cada resultado.
export interface DocumentSearchResponse {
  data: DocumentSearchResult[];
  total: number;
  page: number;
  limit: number;
}

// Consultas de documentos (plan 1): listado, detalle y descarga.
@Injectable()
export class DocumentQueryService {
  private readonly logger = new Logger(DocumentQueryService.name);

  // El reloj es el último parámetro y tiene valor por defecto (spec 005, D2).
  constructor(
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  // Spec 005 (R4, D6): cada respuesta lleva `review` solo para el ADMIN y el responsable.
  findOne(user: AuthUser, id: string): Promise<DocumentResponse> {
    return this.mapErrors(async () => {
      const today = this.today();
      const record = await this.findVisible(user, id);
      return toDocumentResponse(record, reviewFor(user, record, today));
    });
  }

  // R12: en cualquier processingStatus, y el enlace se pide solo después de comprobar R10.
  getDownloadUrl(user: AuthUser, id: string): Promise<DownloadUrl> {
    return this.mapErrors(async () => {
      const { currentVersion } = await this.findVisible(user, id);
      return this.storage.getDownloadUrl(
        currentVersion.storageKey,
        currentVersion.originalFileName,
      );
    });
  }

  list(
    user: AuthUser,
    query: ListDocumentsQuery,
  ): Promise<DocumentListResponse> {
    return this.mapErrors(async () => {
      const today = this.today();
      const viewer = await this.viewerFor(user);
      const { data, total } = await this.documents.list(
        listWhere(viewer), // la regla de visibilidad vive en la política (R10, D2)
        query.page,
        query.limit,
      );
      return {
        data: data.map((record) =>
          toDocumentSummary(record, reviewFor(user, record, today)),
        ),
        total,
        page: query.page,
        limit: query.limit,
      };
    });
  }

  // Spec 005 (R5, plan 3.1): los ACTIVE por vencer o vencidos que el usuario puede revisar, los
  // vencidos primero. Una sola "hoy" para el filtro y las etiquetas (D4). isReviewer le dice a la web
  // si mostrar el acceso aunque no haya pendientes (D19); nunca hay 403 (D9).
  pendingReview(
    user: AuthUser,
    query: ListDocumentsQuery,
  ): Promise<PendingReviewResponse> {
    return this.mapErrors(async () => {
      const today = this.today();
      const viewer = await this.viewerFor(user);
      const lastDay = toDbDate(dueSoonThrough(today));
      const { data, total } = await this.documents.listForReview(
        pendingReviewWhere(viewer, user.id, lastDay),
        query.page,
        query.limit,
      );
      const isReviewer =
        user.role === 'ADMIN' ||
        total > 0 ||
        (await this.documents.count({
          ...listWhere(viewer),
          ownerId: user.id,
        })) > 0;
      return {
        data: data.map((record) =>
          toDocumentSummary(record, reviewFor(user, record, today)),
        ),
        total,
        page: query.page,
        limit: query.limit,
        isReviewer,
      };
    });
  }

  // Spec 004 (plan 3.1): el alcance sale de la política y el fragmento, de buildFragment. Primero el
  // visor: si el directorio falla, el error se propaga y nunca se busca sin filtro (R3).
  search(
    user: AuthUser,
    query: SearchDocumentsQuery,
  ): Promise<DocumentSearchResponse> {
    return this.mapErrors(
      async () => {
        const today = this.today();
        const viewer = await this.viewerFor(user);
        const { data, total } = await this.documents.search({
          text: query.q,
          scope: searchScope(viewer),
          page: query.page,
          limit: query.limit,
        });
        return {
          data: data.map(({ record, fragment }) =>
            toDocumentSearchResult(
              record,
              fragment && {
                parts: buildFragment(fragment.markedText),
                pageNumber: fragment.pageNumber,
              },
              reviewFor(user, record, today), // spec 005, D7
            ),
          ),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      'búsqueda',
    );
  }

  // Spec 003, R12: solo el ADMIN llega acá (lo controla el guard), así que no hay filtro de
  // visibilidad y funciona también con documentos archivados (D10).
  listVersions(id: string): Promise<VersionHistoryResponse> {
    return this.mapErrors(async () => {
      if (!(await this.documents.findByIdWithAreas(id))) {
        throw documentNotFound();
      }
      const versions = await this.documents.listVersions(id);
      return { data: versions.map(toVersionHistoryItem) };
    });
  }

  // Spec 003, R12: el enlace se pide solo después de comprobar que la versión es de ese documento.
  getVersionDownloadUrl(id: string, versionId: string): Promise<DownloadUrl> {
    return this.mapErrors(async () => {
      const version = await this.documents.findVersion(id, versionId);
      if (!version) throw documentNotFound();
      return this.storage.getDownloadUrl(
        version.storageKey,
        version.originalFileName,
      );
    });
  }

  // D13: el mismo mapeo que la carga. El 404 de R11 pasa sin cambios; una dependencia caída es 503;
  // cualquier otro error, 500.
  private async mapErrors<T>(
    run: () => Promise<T>,
    operation: HttpOperation = 'consulta',
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toHttpException(error, this.logger, operation);
    }
  }

  // La regla de visibilidad vive en document-access.ts (spec 005, D11): la comparten las consultas y
  // "Marcar como revisado".
  private findVisible(user: AuthUser, id: string): Promise<DocumentRecord> {
    return findVisibleDocument(this.users, this.documents, user, id);
  }

  private viewerFor(user: AuthUser): Promise<AccessSubject> {
    return viewerFor(this.users, user);
  }

  // "Hoy" en hora de la empresa, una vez por pedido (spec 005, plan 1.2).
  private today(): string {
    return todayInCompany(this.clock.now());
  }
}
