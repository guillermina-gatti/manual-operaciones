// Un resultado de búsqueda (spec 004, F4): la misma tarjeta del listado, más el fragmento con las
// palabras resaltadas y su página, si la coincidencia está en el contenido (R8).
import type { DocumentSearchResult } from '@/lib/api';
import { DocumentCard } from './DocumentCard';
import { MatchFragment } from './MatchFragment';

interface SearchResultCardProps {
  result: DocumentSearchResult;
  areaNames: Record<string, string>;
  ownerName?: string;
  isAdmin: boolean;
}

export function SearchResultCard({ result, areaNames, ownerName, isAdmin }: SearchResultCardProps) {
  return (
    <DocumentCard document={result} areaNames={areaNames} ownerName={ownerName} isAdmin={isAdmin}>
      {result.fragment && <MatchFragment fragment={result.fragment} />}
    </DocumentCard>
  );
}
