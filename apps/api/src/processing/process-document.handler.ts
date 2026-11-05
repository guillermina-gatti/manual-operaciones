/* Manejador del trabajo process-document (plan 5.1 y 5.3). Decide qué hacer con cada error:
   - versión inexistente: reintenta; en el último intento descarta sin error (A3);
   - archivo que no existe o sin texto: no tiene sentido reintentar: FAILED y trabajo fallido;
   - error transitorio (almacenamiento, IA, base): reintenta; en el último intento, FAILED. */
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

export type HandlerOutcome = 'ready' | 'skipped' | 'discarded' | 'failed';

export class ProcessDocumentHandler {
  constructor(
    private readonly service: ProcessingService,
    private readonly repository: ProcessingRepository,
  ) {}

  async handle(job: ProcessDocumentJob): Promise<HandlerOutcome> {
    const { documentVersionId } = job.data;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    try {
      return await this.service.process(documentVersionId);
    } catch (error) {
      if (error instanceof VersionNotFoundError) {
        if (lastAttempt) return 'discarded'; // la versión nunca apareció: se descarta sin error
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        error instanceof EmptyDocumentError || error instanceof StoredFileNotFoundError;

      if (permanent) {
        await this.repository.markFailed(documentVersionId, message);
        throw new UnrecoverableError(message);
      }
      if (lastAttempt) {
        await this.repository.markFailed(documentVersionId, message);
        return 'failed';
      }
      throw error;
    }
  }
}