import { EMBEDDING_DIMENSIONS } from './ports/embedding-provider';
import {
  EmptyDocumentError,
  ProcessingService,
  VersionNotFoundError,
  isActiveFor,
} from './processing.service';
import {
  FakeBytesReader,
  FakeEmbeddings,
  FakeProcessingRepository,
} from './testing/fakes';

const KEY = 'documents/doc-1/ver-1.md';
const VERSION_ID = 'ver-1';
const DOC_AREA_VENTAS = 'area-ventas';
const DOC_AREA_LOGISTICA = 'area-logistica';

function setup(text = '# Apertura\n\nAbrir la caja a las ocho.\n\nContar el efectivo.') {
  const repo = new FakeProcessingRepository();
  repo.versions.set(VERSION_ID, {
    id: VERSION_ID,
    documentId: 'doc-1',
    storageKey: KEY,
    mimeType: 'text/markdown',
    processingStatus: 'PENDING',
    status: 'CURRENT',
  });
  repo.areaIds = [DOC_AREA_VENTAS];
  const reader = new FakeBytesReader(new Map([[KEY, Buffer.from(text, 'utf8')]]));
  const embeddings = new FakeEmbeddings();
  const service = new ProcessingService(repo, reader, embeddings);
  return { repo, service, embeddings };
}

describe('ProcessingService.process', () => {
  describe('camino feliz', () => {
    it('deja los fragmentos activos con las áreas del documento y marca la versión READY', async () => {
      const { repo, service } = setup();

      const outcome = await service.process(VERSION_ID);

      expect(outcome).toBe('ready');
      const rows = repo.chunksByVersion.get(VERSION_ID)!;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.isActive)).toBe(true);
      expect(rows.every((r) => r.areaIds.join() === DOC_AREA_VENTAS)).toBe(true);
      expect(repo.versions.get(VERSION_ID)!.processingStatus).toBe('READY');
    });

    it('guarda un embedding de 768 dimensiones por fragmento', async () => {
      const { repo, service } = setup();

      await service.process(VERSION_ID);

      const rows = repo.chunksByVersion.get(VERSION_ID)!;
      expect(rows.every((r) => r.embedding.length === EMBEDDING_DIMENSIONS)).toBe(true);
    });

    it('guarda la sección y la página de origen de cada fragmento', async () => {
      const { repo, service } = setup();

      await service.process(VERSION_ID);

      const [first] = repo.chunksByVersion.get(VERSION_ID)!;
      expect(first.section).toBe('Apertura');
      expect(first.pageNumber).toBeNull();
    });
  });

  describe('versión inexistente y reintentos', () => {
    it('lanza VersionNotFoundError si la versión todavía no existe', async () => {
      const { service } = setup();

      await expect(service.process('no-existe')).rejects.toBeInstanceOf(VersionNotFoundError);
    });

    it('no vuelve a procesar una versión que ya está READY', async () => {
      const { repo, service, embeddings } = setup();
      const spy = jest.spyOn(embeddings, 'embedMany');
      repo.versions.get(VERSION_ID)!.processingStatus = 'READY';

      const outcome = await service.process(VERSION_ID);

      expect(outcome).toBe('skipped');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('casos de carrera (plan 003, sección 3.4)', () => {
    it('versión reemplazada mientras se procesa: los fragmentos quedan inactivos', async () => {
      const { repo, service } = setup();
      repo.beforeCommit = (r) => {
        r.versions.get(VERSION_ID)!.status = 'REPLACED';
      };

      const outcome = await service.process(VERSION_ID);

      expect(outcome).toBe('ready');
      const rows = repo.chunksByVersion.get(VERSION_ID)!;
      expect(rows.every((r) => r.isActive === false)).toBe(true);
    });

    it('documento archivado mientras se procesa: los fragmentos quedan inactivos', async () => {
      const { repo, service } = setup();
      repo.beforeCommit = (r) => {
        r.documentStatus = 'ARCHIVED';
      };

      await service.process(VERSION_ID);

      const rows = repo.chunksByVersion.get(VERSION_ID)!;
      expect(rows.every((r) => r.isActive === false)).toBe(true);
    });

    it('cambio de áreas mientras se procesa: los fragmentos toman las áreas nuevas', async () => {
      const { repo, service } = setup();
      // Cambian las áreas después de que el worker lee la versión, pero antes del commit.
      repo.afterFind = (r) => {
        r.areaIds = [DOC_AREA_LOGISTICA];
      };
      repo.beforeCommit = (r) => {
        r.areaIds = [DOC_AREA_VENTAS, DOC_AREA_LOGISTICA];
      };

      await service.process(VERSION_ID);

      const rows = repo.chunksByVersion.get(VERSION_ID)!;
      expect(rows.every((r) => r.areaIds.join() === [DOC_AREA_VENTAS, DOC_AREA_LOGISTICA].join())).toBe(true);
    });

    it('versión borrada antes del commit: descarta sin error y no guarda fragmentos', async () => {
      const { repo, service } = setup();
      repo.beforeCommit = (r) => {
        r.versions.delete(VERSION_ID);
      };

      const outcome = await service.process(VERSION_ID);

      expect(outcome).toBe('discarded');
      expect(repo.chunksByVersion.has(VERSION_ID)).toBe(false);
    });
  });

  describe('orden de operaciones', () => {
    it('calcula los embeddings antes de tomar el lock', async () => {
      const repo = new FakeProcessingRepository();
      repo.versions.set(VERSION_ID, {
        id: VERSION_ID,
        documentId: 'doc-1',
        storageKey: KEY,
        mimeType: 'text/markdown',
        processingStatus: 'PENDING',
        status: 'CURRENT',
      });
      const lockDuringEmbedding: boolean[] = [];
      const embeddings = new FakeEmbeddings(EMBEDDING_DIMENSIONS, () =>
        lockDuringEmbedding.push(repo.isLockHeld()),
      );
      const reader = new FakeBytesReader(new Map([[KEY, Buffer.from('Texto.', 'utf8')]]));
      const service = new ProcessingService(repo, reader, embeddings);

      await service.process(VERSION_ID);

      expect(lockDuringEmbedding).toEqual([false]);
    });

    it('no abre la transacción si el archivo no tiene texto', async () => {
      const { repo, service } = setup('   \n\n  ');
      const commit = jest.spyOn(repo, 'commitLocked');

      await expect(service.process(VERSION_ID)).rejects.toBeInstanceOf(EmptyDocumentError);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe('validación de embeddings', () => {
    it('falla si la cantidad de embeddings no coincide con la de fragmentos', async () => {
      const repo = new FakeProcessingRepository();
      repo.versions.set(VERSION_ID, {
        id: VERSION_ID,
        documentId: 'doc-1',
        storageKey: KEY,
        mimeType: 'text/markdown',
        processingStatus: 'PENDING',
        status: 'CURRENT',
      });
      const broken = new FakeEmbeddings();
      broken.embedMany = async () => [];
      const reader = new FakeBytesReader(new Map([[KEY, Buffer.from('Texto.', 'utf8')]]));
      const service = new ProcessingService(repo, reader, broken);

      await expect(service.process(VERSION_ID)).rejects.toThrow('embeddings');
    });

    it('falla si un embedding no tiene 768 dimensiones, para no romper la columna vector(768)', async () => {
      const repo = new FakeProcessingRepository();
      repo.versions.set(VERSION_ID, {
        id: VERSION_ID,
        documentId: 'doc-1',
        storageKey: KEY,
        mimeType: 'text/markdown',
        processingStatus: 'PENDING',
        status: 'CURRENT',
      });
      const wrongSize = new FakeEmbeddings(3072);
      const reader = new FakeBytesReader(new Map([[KEY, Buffer.from('Texto.', 'utf8')]]));
      const service = new ProcessingService(repo, reader, wrongSize);

      await expect(service.process(VERSION_ID)).rejects.toThrow('768');
      expect(repo.chunksByVersion.has(VERSION_ID)).toBe(false);
    });
  });
});

describe('isActiveFor', () => {
  it('es true solo si el documento está ACTIVE y la versión CURRENT', () => {
    expect(isActiveFor({ documentStatus: 'ACTIVE', areaIds: [], version: { status: 'CURRENT' } })).toBe(true);
    expect(isActiveFor({ documentStatus: 'ARCHIVED', areaIds: [], version: { status: 'CURRENT' } })).toBe(false);
    expect(isActiveFor({ documentStatus: 'ACTIVE', areaIds: [], version: { status: 'REPLACED' } })).toBe(false);
    expect(isActiveFor({ documentStatus: 'ACTIVE', areaIds: [], version: null })).toBe(false);
  });
});