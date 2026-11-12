// Límites de la carga: los mismos que aplica la API (F2; plan 002, sección 5.3).
// Si cambian allá, cambian acá:
//   - tamaño: MAX_FILE_SIZE_BYTES en apps/api/src/documents/documents.controller.ts
//   - extensiones: apps/api/src/documents/file-inspector.ts
//   - título y descripción: apps/api/src/documents/dto/create-document.dto.ts

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md'] as const;

// Para el atributo accept del <input type="file">: el selector del sistema ya filtra estos tipos.
export const FILE_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export const TITLE_MAX = 200;

export const DESCRIPTION_MAX = 1000;
