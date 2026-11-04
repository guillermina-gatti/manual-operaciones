/* Lee el archivo de una versión desde el almacenamiento del proyecto (S3 en producción,
   memoria en desarrollo y tests). Los errores del almacenamiento llegan tal cual:
   StoredFileNotFoundError (no reintentar) y StorageUnavailableError (reintentar). */
import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../storage/file-storage';
import { DocumentBytesReader } from '../ports/document-bytes-reader';

@Injectable()
export class FileStorageBytesReader extends DocumentBytesReader {
  constructor(private readonly storage: FileStorage) {
    super();
  }

  read(storageKey: string): Promise<Buffer> {
    return this.storage.get(storageKey);
  }
}