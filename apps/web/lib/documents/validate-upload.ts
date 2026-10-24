// Validación del formulario de carga antes de enviarlo (F2; plan 002, sección 5.3).
// Revisa lo mismo que la API, salvo el contenido del archivo (que un .pdf sea un PDF), que solo ve la API (415).
import type { UploadDocumentValues, UploadField } from '@/lib/api';
import { COMPANY_TIME_ZONE } from './format';
import { tomorrowIn } from './review-date';
import {
  ALLOWED_EXTENSIONS,
  DESCRIPTION_MAX,
  MAX_FILE_SIZE_BYTES,
  TITLE_MAX,
} from './upload-rules';

// Lo que tiene el formulario: el archivo puede no estar elegido todavía.
export type UploadFormValues = Omit<UploadDocumentValues, 'file'> & { file: File | null };

export type UploadErrors = Partial<Record<UploadField, string>>;

// Igual que extname de Node, que usa la API: "manual.PDF" → "pdf"; ".pdf" y "manual." no tienen extensión.
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

// El archivo solo: se usa apenas se elige, sin esperar a enviar (E5).
export function validateFile(file: File | null): string | undefined {
  if (!file) return 'Elegí un archivo.';
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return 'El archivo tiene que ser PDF, .txt o .md.';
  }
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'El archivo pesa más de 10 MB.';
  return undefined;
}

// YYYY-MM-DD y una fecha que existe (no el 30/02).
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// La usa también la versión nueva, donde la fecha es opcional y se valida solo si se completó (spec 003).
export function validateReviewDate(value: string, now: Date = new Date()): string | undefined {
  if (value === '') return 'Elegí la fecha de revisión.';
  if (!isRealDate(value)) return 'La fecha de revisión no es válida.';
  // Las fechas YYYY-MM-DD se pueden comparar como texto.
  if (value < tomorrowIn(COMPANY_TIME_ZONE, now)) {
    return 'La fecha de revisión tiene que ser a partir de mañana.';
  }
  return undefined;
}

// Devuelve el error de cada campo que falla; vacío si se puede enviar.
export function validateUpload(values: UploadFormValues, now: Date = new Date()): UploadErrors {
  const title = values.title.trim();

  const errors: UploadErrors = {
    file: validateFile(values.file),
    title:
      title === ''
        ? 'Escribí un título.'
        : title.length > TITLE_MAX
          ? `El título puede tener hasta ${TITLE_MAX} caracteres.`
          : undefined,
    areaIds: values.areaIds.length === 0 ? 'Elegí al menos un área.' : undefined,
    ownerId: values.ownerId === '' ? 'Elegí un responsable.' : undefined,
    reviewDate: validateReviewDate(values.reviewDate, now),
    description:
      values.description.length > DESCRIPTION_MAX
        ? `La descripción puede tener hasta ${DESCRIPTION_MAX} caracteres.`
        : undefined,
  };

  // Solo los campos con error.
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as UploadErrors;
}
