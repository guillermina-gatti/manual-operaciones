// Vista previa en vivo de la carga: cómo se va a ver el documento en Documentos (vista Tarjetas), con
// las mismas piezas que DocumentTile. No usa DocumentTile porque esa tarjeta es un enlace al detalle de
// un documento que todavía no existe. Sin datos, textos de ejemplo apagados.
import { useId } from 'react';
import type { Area } from '@/lib/directory';
import { displayAreaName } from '@/lib/directory/areas-directory';
import { CARD, HINT } from './design';
import { FileTypeIcon, META_LABEL, VERSION_CHIP } from './list-design';

interface UploadPreviewProps {
  fileName: string | null;
  title: string;
  // Las áreas elegidas, en el orden del formulario.
  areas: Area[];
  ownerName: string | null;
}

// La primera área y cuántas más: "Ventas +1", como en la tarjeta.
function areaSummary(areas: Area[]): string | null {
  const [first, ...rest] = areas;
  if (!first) return null;
  const name = displayAreaName(first);
  return rest.length > 0 ? `${name} +${rest.length}` : name;
}

export function UploadPreview({ fileName, title, areas, ownerName }: UploadPreviewProps) {
  const labelId = useId();
  const trimmed = title.trim();
  const area = areaSummary(areas);

  return (
    <aside aria-labelledby={labelId} className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6">
      <span id={labelId} className={META_LABEL}>
        Vista previa
      </span>
      <div className={`${CARD} flex min-w-0 flex-col gap-4 p-5`}>
        <div className="flex items-start justify-between gap-3">
          <FileTypeIcon fileName={fileName ?? ''} size="lg" />
          <span className={VERSION_CHIP}>v1</span>
        </div>
        <p
          className={`line-clamp-2 text-lg leading-snug font-bold break-words ${
            trimmed ? 'text-bosque' : 'text-texto-suave'
          }`}
        >
          {trimmed || 'Sin título'}
        </p>
        <div className="flex min-w-0 flex-col gap-1 text-sm text-texto-suave">
          <p className="min-w-0 truncate">
            Actualizado recién · {area ?? <span className="italic">Sin áreas</span>}
          </p>
          <p className="min-w-0 truncate">
            Responsable: {ownerName ?? <span className="italic">Sin responsable</span>}
          </p>
        </div>
      </div>
      <p className={HINT}>Así se va a ver en Documentos.</p>
    </aside>
  );
}
