import { Injectable } from '@nestjs/common';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  DownloadUrl,
  FileStorage,
  StorageUnavailableError,
} from './file-storage';

type StorageMethod = 'put' | 'delete' | 'getDownloadUrl';

interface StoredObject {
  buffer: Buffer;
  contentType: string;
  checksum: string;
}

export interface GeneratedLink extends DownloadUrl {
  key: string;
  fileName: string;
}

// Para los tests y para desarrollar sin AWS (plan 5.5).
@Injectable()
export class InMemoryFileStorage extends FileStorage {
  readonly generatedLinks: GeneratedLink[] = [];
  private readonly objects = new Map<string, StoredObject>();
  private readonly failingMethods = new Set<StorageMethod>();

  failOn(...methods: StorageMethod[]): void {
    methods.forEach((method) => this.failingMethods.add(method));
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  async put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void> {
    await this.failIfConfigured('put');
    this.objects.set(key, { buffer, contentType, checksum });
  }

  async delete(key: string): Promise<void> {
    await this.failIfConfigured('delete');
    this.objects.delete(key);
  }

  async getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl> {
    await this.failIfConfigured('getDownloadUrl');
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    const url = `memory://${key}?filename=${encodeURIComponent(fileName)}`;
    this.generatedLinks.push({ key, fileName, url, expiresAt });
    return { url, expiresAt };
  }

  // Rechaza como lo haría S3 al no responder, en vez de lanzar en el momento.
  private failIfConfigured(method: StorageMethod): Promise<void> {
    if (!this.failingMethods.has(method)) return Promise.resolve();
    return Promise.reject(
      new StorageUnavailableError(
        `InMemoryFileStorage configurada para fallar en ${method}`,
      ),
    );
  }
}
