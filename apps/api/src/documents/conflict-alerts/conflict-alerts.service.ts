/* Caso de uso de las alertas de documentos contradictorios (spec 011, R14 a R16): listarlas y marcarlas
como resueltas. Solo para el ADMIN: lo exige el controlador (RolesGuard). Quien resolvió va como las
referencias de la spec 008, con su nombre y su estado actuales */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { Clock } from '../../common/clock';
import type { DocumentReference } from '../document-references';
import { toHttpException } from '../http-errors';
import { AuditLog } from '../ports/audit-log';
import { UsersDirectory } from '../ports/users-directory';
import {
  ConflictAlertRecord,
  ConflictAlertsRepository,
  ListConflictAlertsFilter,
} from './conflict-alerts.repository';
import {
  ConflictAlertListResponse,
  ConflictAlertResponse,
  toConflictAlertResponse,
} from './dto/conflict-alert.response';
import type { ResolveConflictAlertDto } from './dto/resolve-conflict-alert.dto';

export const ALERT_NOT_FOUND = 'No se encontró la alerta';
export const ALERT_ALREADY_RESOLVED = 'La alerta ya está resuelta';

@Injectable()
export class ConflictAlertsService {
  private readonly logger = new Logger(ConflictAlertsService.name);

  constructor(
    private readonly alerts: ConflictAlertsRepository,
    private readonly users: UsersDirectory,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {}

  async list(
    filter: ListConflictAlertsFilter,
  ): Promise<ConflictAlertListResponse> {
    try {
      const page = await this.alerts.list(filter);
      return {
        data: await this.toResponses(page.items),
        total: page.total,
        openTotal: page.openTotal,
        page: filter.page,
        limit: filter.limit,
      };
    } catch (error) {
      throw toHttpException(error, this.logger, 'alertas');
    }
  }

  // R15: solo una abierta pasa a resuelta. R16: el éxito y el fallo quedan en la auditoría.
  async resolve(
    id: string,
    actor: AuthUser,
    dto: ResolveConflictAlertDto,
  ): Promise<ConflictAlertResponse> {
    const note = dto.note?.trim() || null;
    let record: ConflictAlertRecord | null = null;
    try {
      const at = this.clock.now();
      const changed = await this.alerts.resolve(id, actor.id, note, at);
      record = await this.alerts.findById(id);
      if (!record) throw new NotFoundException(ALERT_NOT_FOUND);
      if (!changed) throw new ConflictException(ALERT_ALREADY_RESOLVED);

      await this.audit.record({
        action: 'CONFLICT_ALERT_RESOLVE',
        actorId: actor.id,
        conflictAlertId: id,
        documentId: record.a.documentId,
        relatedDocumentId: record.b.documentId,
        result: 'SUCCESS',
        at,
      });
      const [response] = await this.toResponses([record]);
      return response;
    } catch (error) {
      const failure = toHttpException(
        error,
        this.logger,
        'resolución de alerta',
      );
      await this.audit.record({
        action: 'CONFLICT_ALERT_RESOLVE',
        actorId: actor.id,
        conflictAlertId: id,
        ...(record && {
          documentId: record.a.documentId,
          relatedDocumentId: record.b.documentId,
        }),
        result: 'FAILURE',
        detail: String(failure.getStatus()),
        at: this.clock.now(),
      });
      throw failure;
    }
  }

  // Una sola búsqueda de usuarios por página, con los que resolvieron (sin repetidos).
  private async toResponses(
    records: ConflictAlertRecord[],
  ): Promise<ConflictAlertResponse[]> {
    const ids = [
      ...new Set(
        records.flatMap((r) => (r.resolvedById ? [r.resolvedById] : [])),
      ),
    ];
    const found = ids.length > 0 ? await this.users.findByIds(ids) : [];
    const byId = new Map(found.map((user) => [user.id, user]));
    const referenceOf = (id: string): DocumentReference => {
      const user = byId.get(id);
      // Spec 008 (R12): quien el directorio no encuentra, sin nombre.
      return user
        ? { id, name: user.name, isActive: user.isActive }
        : { id, name: null, isActive: false };
    };
    return records.map((record) =>
      toConflictAlertResponse(
        record,
        record.resolvedById ? referenceOf(record.resolvedById) : null,
      ),
    );
  }
}
