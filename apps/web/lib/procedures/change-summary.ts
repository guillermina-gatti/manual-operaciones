// The summary of a critical change (spec 015, R5): 1 to 300 characters, without the spaces around it.
// The API checks it too; this gives the error next to the field, before sending anything.
export const CHANGE_SUMMARY_MAX = 300;

// The message to show, or null if the summary is valid.
export function validateChangeSummary(text: string): string | null {
  const length = text.trim().length;
  if (length === 0) return 'Escribí un resumen del cambio.';
  if (length > CHANGE_SUMMARY_MAX) {
    return `El resumen puede tener hasta ${CHANGE_SUMMARY_MAX} caracteres.`;
  }
  return null;
}
