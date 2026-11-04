import { UnrecoverableError } from 'bullmq';
import { StorageUnavailableError, StoredFileNotFoundError } from '../storage/file-storage';
import { DocumentBytesReader } from './ports/document-bytes-reader';
import { EmbeddingProvider } from './ports/embedding-provider';
import { ProcessDocumentHandler, ProcessDocumentJob } from './process-document.handler';
import { ProcessingService, VersionNotFoundError } from './processing.service';
import { FakeBytesReader, FakeEmbeddings, FakeProcessingRepository } from './testing/fakes';

const KEY = 'documents/doc-1/ver-1.md';
const VERSION_ID = 'ver-1';

function job(attemptsMade: number): ProcessDocumentJob {
  return { data: { documentVersionId: VERSION_ID }, attemptsMade, opts: { attempts: 5 } };
}

function setup(opts: { reader?: DocumentBytesReader; embeddings?: EmbeddingProvider; text?: string } = {}) {
  const repo = new FakeProcessingRepository();
  repo.versions.set(VERSION_ID, {
    id: VERSION_ID,
    documentId: 'doc-1',
    storageKey: KEY,
    mimeType: 'text/markdown',
    processingStatus: 'PENDING',
    status: 'CURRENT',
  });
  repo.areaIds = ['area-ventas'];
  const reader = opts.reader ?? new FakeBytesReader(new Map([[KEY, Buffer.from(opts.text ?? 'Texto del paso.', 'utf8')]]));
  const service = new ProcessingService(repo, reader, opts.embeddings ?? new FakeEmbeddings());
  return { repo, handler: new ProcessDocumentHandler(service, repo) };
}

describe('ProcessDocumentHandler', () => {
  it('devuelve ready cuando el procesamiento termina bien', async () => {
    const { repo, handler } = setup();

    await expect(handler.handle(job(0))).resolves.toBe('ready');
    expect(repo.versions.get(VERSION_ID)!.processingStatus).toBe('READY');
  });

  it('devuelve skipped si la versión ya estaba READY', async () => {
    const { repo, handler } = setup();
    repo.versions.get(VERSION_ID)!.processingStatus = 'READY';

    await expect(handler.handle(job(0))).resolves.toBe('skipped');
  });

  it('si la versión todavía no existe, reintenta antes del último intento', async () => {
    const { handler } = setup();

    await expect(handler.handle({ ...job(0), data: { documentVersionId: 'no-existe' } })).rejects.toBeInstanceOf(
      VersionNotFoundError,
    );
  });

  it('si la versión nunca apareció, descarta sin error en el último intento', async () => {
    const { repo, handler } = setup();

    await expect(
      handler.handle({ ...job(4), data: { documentVersionId: 'no-existe' } }),
    ).resolves.toBe('discarded');
    expect(repo.failures.size).toBe(0);
  });

  it('archivo que no existe en el almacenamiento: FAILED y trabajo no reintentable', async () => {
    const reader: DocumentBytesReader = {
      read: async (key: string) => {
        throw new StoredFileNotFoundError(key);
      },
    } as DocumentBytesReader;
    const { repo, handler } = setup({ reader });

    await expect(handler.handle(job(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repo.failures.get(VERSION_ID)).toContain('No existe un archivo');
  });

  it('documento sin texto extraíble: FAILED y trabajo no reintentable', async () => {
    const { repo, handler } = setup({ text: '   \n\n  ' });

    await expect(handler.handle(job(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repo.failures.has(VERSION_ID)).toBe(true);
  });

  it('error transitorio del almacenamiento: reintenta sin marcar FAILED', async () => {
    const reader = {
      read: async () => {
        throw new StorageUnavailableError('S3 no responde');
      },
    } as DocumentBytesReader;
    const { repo, handler } = setup({ reader });

    await expect(handler.handle(job(0))).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(repo.failures.size).toBe(0);
  });

  it('error transitorio en el último intento: FAILED con el motivo, sin reintentar', async () => {
    const embeddings = {
      embedMany: async () => {
        throw new Error('cuota agotada');
      },
    } as unknown as EmbeddingProvider;
    const { repo, handler } = setup({ embeddings });

    await expect(handler.handle(job(4))).resolves.toBe('failed');
    expect(repo.failures.get(VERSION_ID)).toBe('cuota agotada');
  });

  it('error transitorio antes del último intento: reintenta', async () => {
    const embeddings = {
      embedMany: async () => {
        throw new Error('cuota agotada');
      },
    } as unknown as EmbeddingProvider;
    const { repo, handler } = setup({ embeddings });

    await expect(handler.handle(job(0))).rejects.toThrow('cuota agotada');
    expect(repo.failures.size).toBe(0);
  });
});