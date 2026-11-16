/* Reconciliador periódico de versiones PENDING antiguas y PROCESSING con lease vencido (M2-B.4).
   Coordina múltiples instancias con pg_try_advisory_xact_lock en PostgreSQL, inspecciona BullMQ
   sin duplicar jobs activos y no bloquea el arranque ni los endpoints HTTP de la API. */
import type { ProcessingQueue } from '../documents/ports/processing-queue';
import type { ProcessingRepository } from './ports/processing-repository';

export const RECONCILE_PENDING_MIN_AGE_SECONDS = 120;
export const RECONCILE_INTERVAL_MS = 300_000;
export const RECONCILE_BATCH_LIMIT = 50;

const ACTIVE_QUEUE_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
]);

const RESIDUAL_QUEUE_STATES = new Set(['completed', 'failed']);

export interface QueueJobHandle {
  getState(): Promise<string>;
  remove(): Promise<void>;
}

export interface ProcessingQueueInspector {
  getJob(jobId: string): Promise<QueueJobHandle | undefined | null>;
}

export interface ReconcilerLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface ProcessingReconcilerOptions {
  enabled?: boolean;
  pendingMinAgeSeconds?: number;
  intervalMs?: number;
  batchLimit?: number;
  logger?: ReconcilerLogger;
}

export interface ReconciliationSummary {
  candidates: number;
  recovered: number;
  skipped: number;
  failed: number;
}

function safeErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
    ? `${error.name}:${code}`
    : error.name;
}

export class ProcessingReconcilerService {
  private readonly enabled: boolean;
  private readonly pendingMinAgeSeconds: number;
  private readonly intervalMs: number;
  private readonly batchLimit: number;
  private readonly logger?: ReconcilerLogger;

  private initialTimer?: NodeJS.Timeout;
  private intervalTimer?: NodeJS.Timeout;
  private isReconciling = false;
  private inFlightCycle?: Promise<ReconciliationSummary>;
  private stopPromise?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly repository: Pick<
      ProcessingRepository,
      'findPendingOrExpiredForReconciliation' | 'prepareReconciliation'
    >,
    private readonly processingQueue: Pick<ProcessingQueue, 'enqueue'>,
    private readonly queueInspector: ProcessingQueueInspector,
    options: ProcessingReconcilerOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.pendingMinAgeSeconds =
      options.pendingMinAgeSeconds ?? RECONCILE_PENDING_MIN_AGE_SECONDS;
    this.intervalMs = options.intervalMs ?? RECONCILE_INTERVAL_MS;
    this.batchLimit = options.batchLimit ?? RECONCILE_BATCH_LIMIT;
    this.logger = options.logger;
  }

  onModuleInit(): void {
    if (!this.enabled || this.stopped) return;

    // Primera pasada en background: no bloquea el arranque de NestJS si Redis falla.
    this.initialTimer = setTimeout(() => {
      this.initialTimer = undefined;
      void this.reconcileOnce();
    }, 0);
    this.initialTimer.unref?.();

    this.intervalTimer = setInterval(() => {
      void this.reconcileOnce();
    }, this.intervalMs);
    this.intervalTimer.unref?.();
  }

  onModuleDestroy(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = undefined;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    this.stopPromise = this.inFlightCycle
      ? this.inFlightCycle.then(() => undefined, () => undefined)
      : Promise.resolve();
    return this.stopPromise;
  }

  async reconcileOnce(): Promise<ReconciliationSummary> {
    const empty: ReconciliationSummary = {
      candidates: 0,
      recovered: 0,
      skipped: 0,
      failed: 0,
    };
    if (this.stopped || this.isReconciling) return empty;

    this.isReconciling = true;
    const cycle = this.runCycle();
    this.inFlightCycle = cycle;
    try {
      return await cycle;
    } finally {
      this.inFlightCycle = undefined;
      this.isReconciling = false;
    }
  }

  private async runCycle(): Promise<ReconciliationSummary> {
    const summary: ReconciliationSummary = {
      candidates: 0,
      recovered: 0,
      skipped: 0,
      failed: 0,
    };

    let candidates;
    try {
      candidates = await this.repository.findPendingOrExpiredForReconciliation(
        this.pendingMinAgeSeconds,
        this.batchLimit,
      );
    } catch (error) {
      this.logger?.warn(
        `Reconciliación omitida por error al consultar PostgreSQL (${safeErrorLabel(error)})`,
      );
      return summary;
    }

    summary.candidates = candidates.length;
    if (candidates.length === 0) return summary;

    for (const candidate of candidates) {
      if (this.stopped) break;

      try {
        const decision = await this.repository.prepareReconciliation(
          candidate.id,
          this.pendingMinAgeSeconds,
        );

        if (decision.action !== 'enqueue') {
          summary.skipped += 1;
          continue;
        }

        const outcome = await this.inspectAndRecover(
          candidate.id,
          decision.previousStatus,
        );

        if (outcome === 'recovered') {
          summary.recovered += 1;
        } else if (outcome === 'failed') {
          summary.failed += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        this.logger?.warn(
          `Error al reconciliar versión ${candidate.id} (${safeErrorLabel(error)})`,
        );
      }
    }

    this.logger?.log(
      `Reconciliación completada: candidates=${summary.candidates} recovered=${summary.recovered} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return summary;
  }

  private async inspectAndRecover(
    versionId: string,
    previousStatus: 'PENDING' | 'PROCESSING',
  ): Promise<'recovered' | 'already_queued' | 'failed'> {
    try {
      const existingJob = await this.queueInspector.getJob(versionId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (ACTIVE_QUEUE_STATES.has(state)) {
          if (previousStatus === 'PROCESSING' && state === 'active') {
            this.logger?.warn(
              `Versión ${versionId} liberada de lease vencido aunque BullMQ mantiene job active residual`,
            );
          }
          return 'already_queued';
        }
        if (RESIDUAL_QUEUE_STATES.has(state)) {
          await existingJob.remove();
        }
      }

      await this.processingQueue.enqueue(versionId);
      return 'recovered';
    } catch (error) {
      this.logger?.warn(
        `Error de cola al reconciliar versión ${versionId} (${safeErrorLabel(error)})`,
      );
      return 'failed';
    }
  }
}
