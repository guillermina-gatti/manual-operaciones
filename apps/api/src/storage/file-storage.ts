/*Este código define las reglas de configuración, errores personalizados y contratos (puertos)
para manejar el almacenamiento de archivos en el sistema */

// 1. Constante de tiempo: Los enlaces temporales de descarga caducan a los 5 minutos (300 segundos).
export const DOWNLOAD_URL_TTL_SECONDS = 300;

// 2. Estructura de datos que devuelve un enlace de descarga temporal con su fecha de expiración.
export interface DownloadUrl {
  url: string;
  expiresAt: Date;
}

// 3. Error personalizado: Si el servicio de almacenamiento falla (ej. S3 se cae),
// cada adaptador traduce su error técnico a este, para que luego el servicio lo convierta en un error HTTP 503.
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

// 4. Error personalizado: La clave pedida no existe en el almacenamiento.
// Cada adaptador traduce su "no encontrado" a este error (ej. NoSuchKey de S3).
export class StoredFileNotFoundError extends Error {
  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`No existe un archivo guardado con la clave ${key}`, options);
    this.name = 'StoredFileNotFoundError';
  }
}

// 5. Puerto (Contrato / Clase abstracta): Define qué métodos obligatorios debe tener
// cualquier sistema de almacenamiento que conectemos.
export abstract class FileStorage {
  // Método para guardar/subir un archivo binario
  abstract put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void>;

  // Método para leer el contenido de un archivo guardado (lo usa el worker de procesamiento)
  abstract get(key: string): Promise<Buffer>;

  // Método para eliminar un archivo usando su clave o ruta única
  abstract delete(key: string): Promise<void>;

  // Método para generar un enlace temporal seguro de descarga
  abstract getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl>;
}
