// "Hace X" de la versión vigente, con la fecha completa en title. `now` llega de quien dibuja la
// lista (DocumentCollection), que lo toma una sola vez y solo existe en el navegador, cuando ya hay
// datos: este texto nunca forma parte del HTML del servidor, así que no hay nada que hidratar distinto.
import type { DocumentSummary } from '@/lib/api';
import { formatCreatedAt } from '@/lib/documents/format';
import { formatRelative } from '@/lib/documents/relative-time';

// Cuándo se subió la versión vigente. Sin el dato (datos de prueba anteriores), la carga del documento.
export function updatedAtOf(document: DocumentSummary): string {
  return document.currentVersion.createdAt ?? document.createdAt;
}

export function UpdatedAt({ value, now }: { value: string; now: Date }) {
  const relative = formatRelative(value, now);
  if (!relative) return <>—</>;
  return (
    // La fecha completa usa la zona de la empresa: igual en cualquier navegador y en el servidor.
    <time dateTime={value} title={formatCreatedAt(value)}>
      {relative}
    </time>
  );
}
