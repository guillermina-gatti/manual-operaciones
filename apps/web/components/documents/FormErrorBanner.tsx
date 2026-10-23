// Aviso general de un error de la API en el formulario de carga (F3; plan 002, sección 5.1).
// role="alert": el lector de pantalla lo anuncia apenas aparece.
import Link from 'next/link';

interface FormErrorBannerProps {
  message: string;
  // Solo en el 409: el documento que ya tiene ese archivo (E6).
  existingDocumentId?: string;
}

export function FormErrorBanner({ message, existingDocumentId }: FormErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <p>{message}</p>
      {existingDocumentId && (
        <Link href={`/documentos/${existingDocumentId}`} className="font-medium underline">
          Ver el documento existente
        </Link>
      )}
    </div>
  );
}
