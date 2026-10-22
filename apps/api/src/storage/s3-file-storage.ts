/*esta clase se conecta al servicio de almacenamiento en la nube de Amazon (AWS S3) o a un servicio compatible.
Se encarga de subir, borrar y generar enlaces de descarga firmados temporalmente para los archivos reales,
manejando de forma segura la integridad de los datos y traduciendo cualquier error de red o de AWS al error estándar del sistema */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  DownloadUrl,
  FileStorage,
  StorageUnavailableError,
} from './file-storage';

// 1. Opciones de configuración necesarias para conectar con S3 (Bucket, región, etc.)
export interface S3FileStorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

// 2. Implementación real de almacenamiento usando AWS S3
export class S3FileStorage extends FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3FileStorageOptions) {
    super();
    this.bucket = options.bucket;
    // (Nota: Las credenciales no se pasan aquí, el SDK las toma automáticamente del entorno local o del rol de EC2)
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    });
  }

  // Sube un archivo físicamente a S3
  async put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void> {
    await this.send('put', key, () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
          // S3 recalcula el SHA-256 internamente y rechaza el archivo si llegó alterado o dañado
          ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
        }),
      ),
    );
  }

  // Elimina un archivo de S3 usando su clave única (key)
  async delete(key: string): Promise<void> {
    await this.send('delete', key, () =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      ),
    );
  }

  // Genera un enlace temporal firmado (presigned URL) para descargar el archivo de forma segura
  async getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl> {
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    const url = await this.send('getDownloadUrl', key, () =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          // Configura la cabecera para que el navegador descargue el archivo con su nombre original
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS }, // El enlace expira según el TTL definido (5 minutos)
      ),
    );
    return { url, expiresAt };
  }

  // Función envoltorio (wrapper): Atrapa cualquier error técnico de AWS y lo traduce
  // al error del puerto (StorageUnavailableError), que el servicio convertirá en un HTTP 503 (Regla R8).
  private async send<T>(
    operation: string,
    key: string,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      throw new StorageUnavailableError(`S3 ${operation} falló para ${key}`, {
        cause: error,
      });
    }
  }
}
