import type { CatalogGroup } from '../chat-catalog';

// Documentos vigentes agrupados por área, para el listado del asistente. areaIds null = todas las áreas
// (ADMIN); si no, solo esas áreas.
export abstract class ChatDocumentsCatalog {
    abstract listByArea(areaIds: string[] | null): Promise<CatalogGroup[]>;
}