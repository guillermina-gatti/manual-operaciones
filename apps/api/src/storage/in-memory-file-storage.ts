/*Está pensado principalmente para pruebas (tests automatizados) y para poder desarrollar de manera local sin necesidad de conectarse
a un servicio real en la nube como AWS S3.
En lugar de guardar los archivos en un servidor externo, los guarda temporalmente en la memoria RAM (usando un Map de JavaScript).
Además, incluye una herramienta muy útil para pruebas: permite "simular" caídas o fallos en los métodos. */

import { Injectable } from '@nestjs/common';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  DownloadUrl,
  FileStorage,
  StorageUnavailableError,
} from './file-storage';

// Tipos de métodos que podemos simular que fallan
type StorageMethod = 'put' | 'delete' | 'getDownloadUrl';

// Estructura interna para guardar los archivos simulados en memoria
interface StoredObject {
  buffer: Buffer;
  contentType: string;
  checksum: string;
}

// Extensión del enlace de descarga para llevar un registro en memoria de lo generado
export interface GeneratedLink extends DownloadUrl {
  key: string;
  fileName: string;
}

// Implementación en memoria que hereda del contrato FileStorage (Ideal para tests y desarrollo local sin AWS)
@Injectable()
export class InMemoryFileStorage extends FileStorage {
  // Registros públicos para auditar los enlaces generados en los tests
  readonly generatedLinks: GeneratedLink[] = [];

  // Almacén en memoria RAM usando un mapa (Clave -> Objeto guardado)
  private readonly objects = new Map<string, StoredObject>();

  // Lista de métodos que configuramos para que fallen a propósito (para pruebas de errores)
  private readonly failingMethods = new Set<StorageMethod>();

  // Método auxiliar para configurar qué acciones fallarán durante las pruebas
  failOn(...methods: StorageMethod[]): void {
    methods.forEach((method) => this.failingMethods.add(method));
  }

  // Método auxiliar para comprobar rápidamente si un archivo existe en memoria
  has(key: string): boolean {
    return this.objects.has(key);
  }

  // Simula guardar un archivo en memoria
  async put(
    key: string,
    buffer: Buffer,
    contentType: string,
    checksum: string,
  ): Promise<void> {
    await this.failIfConfigured('put'); // Comprueba si simulamos un fallo aquí
    this.objects.set(key, { buffer, contentType, checksum });
  }

  // Simula eliminar un archivo de la memoria
  async delete(key: string): Promise<void> {
    await this.failIfConfigured('delete'); // Comprueba si simulamos un fallo aquí
    this.objects.delete(key);
  }

  // Simula la creación de un enlace temporal de descarga (con el TTL de 5 minutos)
  async getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl> {
    await this.failIfConfigured('getDownloadUrl'); // Comprueba si simulamos un fallo aquí
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    const url = `memory://${key}?filename=${encodeURIComponent(fileName)}`;

    // Guardamos el enlace en el historial para revisarlo en los tests
    this.generatedLinks.push({ key, fileName, url, expiresAt });
    return { url, expiresAt };
  }

  // Simula un fallo de red o caída del servicio (como si S3 no respondiera) devolviendo una promesa rechazada
  private failIfConfigured(method: StorageMethod): Promise<void> {
    if (!this.failingMethods.has(method)) return Promise.resolve();
    return Promise.reject(
      new StorageUnavailableError(
        `InMemoryFileStorage configurada para fallar en ${method}`,
      ),
    );
  }
}
