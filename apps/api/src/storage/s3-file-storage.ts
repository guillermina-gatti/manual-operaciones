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

export interface S3FileStorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

// Las credenciales no pasan por acá: el SDK las toma del entorno local o del rol de EC2 (plan 6).
export class S3FileStorage extends FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3FileStorageOptions) {
    super();
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
    });
  }

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
          // S3 recalcula el SHA-256 y rechaza el archivo si llegó dañado.
          ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
        }),
      ),
    );
  }

  async delete(key: string): Promise<void> {
    await this.send('delete', key, () =>
      this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      ),
    );
  }

  async getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl> {
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    const url = await this.send('getDownloadUrl', key, () =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
      ),
    );
    return { url, expiresAt };
  }

  // Traduce cualquier error del SDK al error del puerto, que el servicio convierte en 503 (R8).
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
