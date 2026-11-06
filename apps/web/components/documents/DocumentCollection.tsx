'use client';

// Documentos o resultados de búsqueda en la vista pedida (Lista o Tarjetas). La usan el listado y la
// búsqueda; el orden es el de la API (acá no se reordena).
//
// "Ahora" se toma una sola vez, al montar: todas las filas calculan "hace X" con el mismo momento.
// Este componente solo se dibuja cuando ya llegaron los datos, y los datos se piden en un efecto
// (useApiResource): nunca forma parte del HTML del servidor, así que "hace X" no puede desentonar con
// lo que hidrata el navegador. Se recalcula cuando la lista se vuelve a pedir (se desmonta mientras
// carga).
import { useState } from 'react';
import type { DocumentSearchResult, DocumentSummary } from '@/lib/api';
import type { DocumentsView } from '@/lib/documents/view';
import { DocumentRow, DocumentRowHeader } from './DocumentRow';
import { DocumentTile } from './DocumentTile';
import { MatchFragment } from './MatchFragment';
import { ROW_PANEL } from './list-design';

interface DocumentCollectionProps {
  documents: (DocumentSummary | DocumentSearchResult)[];
  view: DocumentsView;
  isAdmin: boolean;
}

// El fragmento de un resultado (spec 004, R8), o nada si es un documento del listado o no lo trae.
function fragmentOf(document: DocumentSummary | DocumentSearchResult) {
  if (!('fragment' in document) || !document.fragment) return null;
  return <MatchFragment fragment={document.fragment} />;
}

export function DocumentCollection({ documents, view, isAdmin }: DocumentCollectionProps) {
  const [now] = useState(() => new Date());

  if (view === 'tarjetas') {
    return (
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((document) => (
          <li key={document.id} className="min-w-0">
            <DocumentTile document={document} isAdmin={isAdmin} now={now}>
              {fragmentOf(document)}
            </DocumentTile>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={ROW_PANEL}>
      <DocumentRowHeader />
      <ul className="divide-y divide-borde">
        {documents.map((document) => (
          <li key={document.id} className="min-w-0">
            <DocumentRow document={document} isAdmin={isAdmin} now={now}>
              {fragmentOf(document)}
            </DocumentRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
