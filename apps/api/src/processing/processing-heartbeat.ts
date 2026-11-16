/* Heartbeat periódico para renovar el lease de procesamiento en PostgreSQL.
   Si la renovación devuelve false o falla la conexión, dispara la señal de cancelación (AbortSignal)
   para que el Worker detenga operaciones subsiguientes sin asumir que conserva el claim. */
import {
  PROCESSING_HEARTBEAT_INTERVAL_MS,
  PROCESSING_LEASE_TTL_SECONDS,
  ProcessingRepository,
} from './ports/processing-repository';

export interface LeaseHeartbeatOptions {
  intervalMs?: number;
  leaseTtlSeconds?: number;
  onWarn?: (message: string) => void;
}

export class LeaseHeartbeat {
  private readonly controller = new AbortController();
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopPromise?: Promise<void>;
  private stopped = false;

  readonly signal: AbortSignal = this.controller.signal;

  constructor(
    private readonly repository: Pick<ProcessingRepository, 'renewLease'>,
    private readonly versionId: string,
    private readonly claimToken: string,
    private readonly options: LeaseHeartbeatOptions = {},
  ) {}

  start(): void {
    if (this.stopped || this.timer) return;
    const intervalMs = this.options.intervalMs ?? PROCESSING_HEARTBEAT_INTERVAL_MS;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.stopPromise = this.inFlight
      ? this.inFlight.catch(() => undefined)
      : Promise.resolve();
    return this.stopPromise;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.controller.signal.aborted || this.inFlight) return;

    const leaseTtlSeconds =
      this.options.leaseTtlSeconds ?? PROCESSING_LEASE_TTL_SECONDS;

    const run = (async () => {
      try {
        const renewed = await this.repository.renewLease(
          this.versionId,
          this.claimToken,
          leaseTtlSeconds,
        );
        if (!renewed && !this.stopped) {
          this.options.onWarn?.(
            `Claim perdido durante heartbeat para versión ${this.versionId}`,
          );
          this.controller.abort(new Error('CLAIM_LOST'));
        }
      } catch (error) {
        if (!this.stopped) {
          const name = error instanceof Error ? error.name : 'UnknownError';
          this.options.onWarn?.(
            `Error al renovar lease para versión ${this.versionId} (${name}); se invalida el claim local`,
          );
          this.controller.abort(new Error('LEASE_RENEWAL_FAILED'));
        }
      } finally {
        this.inFlight = undefined;
      }
    })();

    this.inFlight = run;
    await run;
  }
}
