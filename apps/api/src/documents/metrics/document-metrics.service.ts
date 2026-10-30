/* Caso de uso de las métricas de documentos (spec 007, HU38): cuántos documentos activos hay, su
estado de revisión, cuántos tienen la versión vigente en error y cuántos se cargaron en un período,
con las mismas reglas de roles, áreas y errores que las métricas de procedimientos (P3) */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth';
import { Clock } from '../../common/clock';
import { companyTimeZone, todayInCompany } from '../company-date';
import { toHttpException } from '../http-errors';
import { UsersDirectory } from '../ports/users-directory';
import { dueSoonThrough } from '../review-status';
import {
  DocumentMetricsRepository,
  DocumentMetricsTotals,
} from './document-metrics.repository';
import {
  documentMetricsAreaIds,
  metricsScope,
  toMetricsPeriod,
} from './metrics-rules';

// Ya validado por el DTO: from y to son días "YYYY-MM-DD" que existen.
export interface DocumentMetricsFilters {
  areaId?: string;
  from?: string;
  to?: string;
}

export interface DocumentMetricsView {
  filters: { areaId: string | null; from: string | null; to: string | null };
  totals: DocumentMetricsTotals;
}

// R3: la misma respuesta para un área ajena y para una que no existe, como en procedimientos.
const areaNotFound = () => new NotFoundException('No se encontró el área');

@Injectable()
export class DocumentMetricsService {
  private readonly logger = new Logger(DocumentMetricsService.name);

  constructor(
    private readonly users: UsersDirectory,
    private readonly metrics: DocumentMetricsRepository,
    private readonly clock: Clock,
  ) {}

  async documents(
    user: AuthUser,
    filters: DocumentMetricsFilters,
  ): Promise<DocumentMetricsView> {
    try {
      return await this.build(user, filters);
    } catch (error) {
      throw toHttpException(error, this.logger, 'métricas');
    }
  }

  private async build(
    user: AuthUser,
    { areaId, from, to }: DocumentMetricsFilters,
  ): Promise<DocumentMetricsView> {
    // R7. "YYYY-MM-DD" ordena igual que las fechas que representa.
    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    }

    // R2: las áreas salen del directorio en cada pedido, nunca de la sesión.
    const viewerAreaIds = (await this.users.findById(user.id))?.areaIds ?? [];
    // R3: null es el SUPERVISOR con un área que no es suya, exista o no. Para el ADMIN un área que
    // no existe no se busca: no la tiene ningún documento y los totales dan 0 (D14).
    const scope = metricsScope(user.role, viewerAreaIds, areaId);
    if (!scope) throw areaNotFound();

    // R5: una sola "hoy" por pedido, en hora de la empresa.
    const today = todayInCompany(this.clock.now());
    const period = toMetricsPeriod(from, to, companyTimeZone());
    const totals = await this.metrics.totals({
      areaIds: documentMetricsAreaIds(scope),
      today,
      dueSoonThrough: dueSoonThrough(today),
      uploadedFrom: period.from,
      uploadedTo: period.to,
    });

    return {
      filters: { areaId: areaId ?? null, from: from ?? null, to: to ?? null },
      totals,
    };
  }
}
