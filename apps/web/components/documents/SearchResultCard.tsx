// Un resultado de búsqueda (spec 004, F4): la misma tarjeta del listado, más el fragmento con las
// palabras resaltadas y su página, si la coincidencia está en el contenido (R8).
import type { DocumentSearchResult } from '@/lib/api';
import { DocumentCard } from './DocumentCard';
import { MatchFragment } from './MatchFragment';

interface SearchResultCardProps {
  result: DocumentSearchResult;
  isAdmin: boolean;
}

export function SearchResultCard({ result, isAdmin }: SearchResultCardProps) {
  return (
    <DocumentCard document={result} isAdmin={isAdmin}>
      {result.fragment && <MatchFragment fragment={result.fragment} />}
    </DocumentCard>
  );
}
