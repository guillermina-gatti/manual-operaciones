/* Manejador del trabajo process-document (plan 5.1, 5.3 y M2-B.3). Decide la respuesta para BullMQ:
   - versión inexistente: reintenta; en el último intento descarta sin error (A3);
   - archivo que no existe o sin texto: FAILED (protegido por claimToken) + UnrecoverableError;
   - error transitorio: libera el claim y reintenta; en el último intento, FAILED;
   - claim perdido: devuelve 'stale' sin reintentar ni marcar FAILED. */
import { UnrecoverableError } from 'bullmq';
import { StoredFileNotFoundError } from '../storage/file-storage';
import { EmptyDocumentError, ProcessingService, VersionNotFoundError } from './processing.service';
import { ProcessingRepository } from './ports/processing-repository';

export interface ProcessDocumentJobData {
  documentVersionId: string;
}

export interface ProcessDocumentJob {
  data: ProcessDocumentJobData;
  attemptsMade: number;
  opts: { attempts?: number };
}

export type HandlerOutcome = 'ready' | 'skipped' | 'discarded' | 'failed' | 'stale';

export class ProcessDocumentHandler {
  constructor(
    private readonly service: ProcessingService,
    // Conservado en la firma del constructor por compatibilidad de inyección en módulo y tests.
    private readonly _repository: ProcessingRepository,
  ) {}

  async handle(job: ProcessDocumentJob): Promise<HandlerOutcome> {
    const { documentVersionId } = job.data;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    try {
      return await this.service.process(documentVersionId, {
        isLastAttempt: lastAttempt,
      });
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        if (lastAttempt) return 'discarded'; // la versión nunca apareció: se descarta sin error
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof EmptyDocumentError ||
        error instanceof StoredFileNotFoundError
      ) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }
}
