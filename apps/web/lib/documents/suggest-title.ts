// Título sugerido a partir del nombre del archivo, para la carga: "manual-de-caja.pdf" → "Manual de caja".
// Es solo una sugerencia editable; el formulario la pone únicamente si el título está vacío o sigue
// siendo la sugerencia anterior (nunca pisa lo que escribió el usuario).
import { TITLE_MAX } from './upload-rules';

export function suggestTitle(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  // Sin la extensión (".pdf"); un nombre que empieza con punto no tiene extensión.
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const words = base.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (words === '') return '';
  const title = words.charAt(0).toLocaleUpperCase('es-AR') + words.slice(1);
  return title.slice(0, TITLE_MAX).trim();
}
