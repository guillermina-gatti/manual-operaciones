import {
  StorageUnavailableError,
  StoredFileNotFoundError,
} from './file-storage';
import { InMemoryFileStorage } from './in-memory-file-storage';

const KEY = 'documents/doc-1/version-1.pdf';
const CHECKSUM =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('InMemoryFileStorage', () => {
  let storage: InMemoryFileStorage;

  beforeEach(() => {
    storage = new InMemoryFileStorage();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('put guarda el objeto con la clave que recibe', async () => {
    await storage.put(
      KEY,
      Buffer.from('%PDF-1.7'),
      'application/pdf',
      CHECKSUM,
    );

    expect(storage.has(KEY)).toBe(true);
  });

  it('delete quita el objeto', async () => {
    await storage.put(
      KEY,
      Buffer.from('%PDF-1.7'),
      'application/pdf',
      CHECKSUM,
    );

    await storage.delete(KEY);

    expect(storage.has(KEY)).toBe(false);
  });

  it('get devuelve el contenido guardado', async () => {
    await storage.put(
      KEY,
      Buffer.from('%PDF-1.7'),
      'application/pdf',
      CHECKSUM,
    );

    await expect(storage.get(KEY)).resolves.toEqual(Buffer.from('%PDF-1.7'));
  });

  it('get con una clave inexistente lanza StoredFileNotFoundError', async () => {
    await expect(storage.get(KEY)).rejects.toThrow(StoredFileNotFoundError);
  });

  it('getDownloadUrl vence a los 300 s y queda registrado', async () => {
    const now = new Date('2026-10-22T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const link = await storage.getDownloadUrl(KEY, 'manual.pdf');

    expect(link.expiresAt).toEqual(new Date('2026-10-22T12:05:00.000Z'));
    expect(storage.generatedLinks).toEqual([
      { key: KEY, fileName: 'manual.pdf', ...link },
    ]);
  });

  it.each(['put', 'get', 'delete', 'getDownloadUrl'] as const)(
    'configurada para fallar en %s, lanza StorageUnavailableError',
    async (method) => {
      storage.failOn(method);

      const call = {
        put: () => storage.put(KEY, Buffer.from('x'), 'text/plain', CHECKSUM),
        get: () => storage.get(KEY),
        delete: () => storage.delete(KEY),
        getDownloadUrl: () => storage.getDownloadUrl(KEY, 'manual.pdf'),
      }[method];

      await expect(call()).rejects.toThrow(StorageUnavailableError);
    },
  );

  it('si falla put, no guarda nada', async () => {
    storage.failOn('put');

    await expect(
      storage.put(KEY, Buffer.from('x'), 'text/plain', CHECKSUM),
    ).rejects.toThrow(StorageUnavailableError);
    expect(storage.has(KEY)).toBe(false);
  });
});
