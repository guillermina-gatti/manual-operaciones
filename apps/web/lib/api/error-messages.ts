// Traduce los errores de la API a mensajes para el usuario (F3, F9; plan 002, sección 5.1).
// Los textos de la API nunca se muestran: están en inglés o nombran campos internos.
import { ApiError } from './api-error';

export type ErrorContext = 'list' | 'detail' | 'download' | 'upload';

export type UploadField =
  | 'file'
  | 'title'
  | 'areaIds'
  | 'ownerId'
  | 'reviewDate'
  | 'description';

export interface ErrorDescription {
  // Aviso general, arriba del formulario o en el estado de error de la pantalla.
  message: string;
  // Solo en la carga: el error que se muestra junto a cada campo.
  fieldErrors: Partial<Record<UploadField, string>>;
  // Solo en el 409: el documento que ya tiene ese archivo, para el enlace.
  existingDocumentId?: string;
  // Si tiene sentido ofrecer "Reintentar".
  canRetry: boolean;
}

export const MESSAGES = {
  checkMarkedFields: 'Revisá los datos marcados en el formulario.',
  checkForm: 'Revisá los datos del formulario.',
  sessionInvalid: 'Tu sesión no es válida. Volvé a ingresar.',
  noUploadPermission: 'No tenés permiso para cargar documentos.',
  noPermission: 'No tenés permiso para ver esta información.',
  documentNotFound: 'No se encontró el documento.',
  duplicate: 'Ya existe un documento con este mismo archivo.',
  checkFile: 'Revisá el archivo elegido.',
  unavailable: 'El servicio no está disponible. Probá de nuevo en unos minutos.',
  unexpected: 'Ocurrió un error inesperado. Probá de nuevo.',
  noConnection:
    'No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.',
} as const;

export const FIELD_MESSAGES: Record<UploadField, string> = {
  file: 'Elegí un archivo PDF, .txt o .md de hasta 10 MB que no esté vacío.',
  title: 'El título tiene que tener entre 1 y 200 caracteres.',
  areaIds: 'Elegí al menos un área de la lista.',
  ownerId:
    'El responsable tiene que pertenecer a alguna de las áreas elegidas, o ser administrador.',
  reviewDate: 'La fecha de revisión tiene que ser a partir de mañana.',
  description: 'La descripción puede tener hasta 1000 caracteres.',
};

export const FILE_TOO_LARGE = 'El archivo pesa más de 10 MB.';
export const FILE_NOT_SUPPORTED = 'El archivo no es un PDF, .txt o .md válido.';

const UPLOAD_FIELDS = Object.keys(FIELD_MESSAGES) as UploadField[];

export function describeApiError(
  error: unknown,
  context: ErrorContext,
): ErrorDescription {
  if (!(error instanceof ApiError)) return general(MESSAGES.unexpected, true);

  switch (error.status) {
    case 0:
      return general(MESSAGES.noConnection, true);
    case 400:
      // En el detalle y la descarga, un 400 es un id que no es UUID: para el usuario, no existe (F9).
      if (context === 'detail' || context === 'download') {
        return general(MESSAGES.documentNotFound, false);
      }
      if (context === 'upload') return describeUploadBadRequest(error.messages);
      return general(MESSAGES.unexpected, true);
    case 401:
      return general(MESSAGES.sessionInvalid, false);
    case 403:
      return general(
        context === 'upload' ? MESSAGES.noUploadPermission : MESSAGES.noPermission,
        false,
      );
    case 404:
      return general(MESSAGES.documentNotFound, false);
    case 409:
      return {
        ...general(MESSAGES.duplicate, false),
        existingDocumentId: error.existingDocumentId,
      };
    case 413:
      return { ...general(MESSAGES.checkFile, false), fieldErrors: { file: FILE_TOO_LARGE } };
    case 415:
      return {
        ...general(MESSAGES.checkFile, false),
        fieldErrors: { file: FILE_NOT_SUPPORTED },
      };
    case 503:
      return general(MESSAGES.unavailable, true);
    default:
      return general(MESSAGES.unexpected, true);
  }
}

function general(message: string, canRetry: boolean): ErrorDescription {
  return { message, fieldErrors: {}, canRetry };
}

// Cada texto de la API empieza con el nombre del campo ("title must…", "ownerId: …").
// La excepción conocida es "Falta el archivo o está vacío", que nombra el archivo sin el campo.
function describeUploadBadRequest(apiMessages: string[]): ErrorDescription {
  const fieldErrors: ErrorDescription['fieldErrors'] = {};
  for (const text of apiMessages) {
    const field = fieldOf(text);
    if (field) fieldErrors[field] = FIELD_MESSAGES[field];
  }

  const hasFields = Object.keys(fieldErrors).length > 0;
  return {
    message: hasFields ? MESSAGES.checkMarkedFields : MESSAGES.checkForm,
    fieldErrors,
    canRetry: false,
  };
}

function fieldOf(text: string): UploadField | undefined {
  const field = UPLOAD_FIELDS.find((name) =>
    new RegExp(`^${name}\\b`).test(text),
  );
  if (field) return field;
  return /archivo/i.test(text) ? 'file' : undefined;
}
