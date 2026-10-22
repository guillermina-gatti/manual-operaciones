// Los enlaces de descarga vencen a los 5 minutos (R12).
export const DOWNLOAD_URL_TTL_SECONDS = 300;

export interface DownloadUrl {
  url: string;
  expiresAt: Date;
}

// Cada implementación traduce sus errores técnicos a este error, que el servicio convierte en 503 (R8).
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

// Puerto (plan 5.5): también funciona como token de inyección.
export abstract class FileStorage {
  abstract put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void>;

  abstract delete(key: string): Promise<void>;

  abstract getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl>;
}
