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

// 4. Puerto (Contrato / Clase abstracta): Define qué métodos obligatorios debe tener
// cualquier sistema de almacenamiento que conectemos.
export abstract class FileStorage {
  // Método para guardar/subir un archivo binario
  abstract put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void>;

  // Método para eliminar un archivo usando su clave o ruta única
  abstract delete(key: string): Promise<void>;

  // Método para generar un enlace temporal seguro de descarga
  abstract getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl>;
}
