import { InMemoryFileStorage } from '../../storage/in-memory-file-storage';
import {
  StorageUnavailableError,
  StoredFileNotFoundError,
} from '../../storage/file-storage';
import { FileStorageBytesReader } from './file-storage-bytes-reader';

describe('FileStorageBytesReader', () => {
  it('devuelve los bytes guardados bajo la clave', async () => {
    const storage = new InMemoryFileStorage();
    await storage.put('documents/d/v.md', Buffer.from('Hola', 'utf8'), 'text/markdown', 'abc');
    const reader = new FileStorageBytesReader(storage);

    const bytes = await reader.read('documents/d/v.md');

    expect(bytes.toString('utf8')).toBe('Hola');
  });

  it('propaga StoredFileNotFoundError si la clave no existe', async () => {
    const reader = new FileStorageBytesReader(new InMemoryFileStorage());

    await expect(reader.read('no-existe')).rejects.toBeInstanceOf(StoredFileNotFoundError);
  });

  it('propaga StorageUnavailableError si el almacenamiento no responde', async () => {
    const storage = new InMemoryFileStorage();
    storage.failOn('get');
    const reader = new FileStorageBytesReader(storage);

    await expect(reader.read('cualquiera')).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});