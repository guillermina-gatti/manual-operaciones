/* Puerto de lectura del archivo. Provisorio: cuando Matías agregue get(key) a FileStorage,
   se reemplaza por ese método (una línea en el módulo). */
export abstract class DocumentBytesReader {
    abstract read(storageKey: string): Promise<Buffer>;
}