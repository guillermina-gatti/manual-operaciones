// Aviso general de un error de la API en el formulario de carga (F3; plan 002, sección 5.1).
// role="alert": el lector de pantalla lo anuncia apenas aparece.
import Link from 'next/link';
import { ERROR_BOX } from './design';

interface FormErrorBannerProps {
  message: string;
  // Solo en el 409: el documento que ya tiene ese archivo (E6).
  existingDocumentId?: string;
}

export function FormErrorBanner({ message, existingDocumentId }: FormErrorBannerProps) {
  return (
    <div role="alert" className={`${ERROR_BOX} flex flex-col gap-1`}>
      <p>{message}</p>
      {existingDocumentId && (
        <Link
          href={`/documentos/${existingDocumentId}`}
          className="font-semibold underline underline-offset-4"
        >
          Ver el documento existente
        </Link>
      )}
    </div>
  );
}
