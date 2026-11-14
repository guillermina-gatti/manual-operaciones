'use client';

// "Vencen pronto" and "Vencidos", under the six tiles of "Documentos": each document with its area,
// when it is due ("vence el 20 nov 2026", "venció hace 5 días") and a link to its page. The five
// most urgent show; "Ver todos (N)" opens the rest in place. Each list has its own empty, loading
// and error state.
//
// The documents come from GET /documents/pending-review (spec 005), read only: an ADMIN gets every
// active document due soon or overdue; anyone else only the ones they are responsible for, so for
// them the lists say so (the tiles count every document of their areas). The area of the panel is
// applied here, by the areas of each document; the dates of the panel do not apply: it is today's
// state, as the tiles.
import Link from 'next/link';
import { useId, useState } from 'react';
import { AreaChips, BUTTON_SECONDARY, TEXT_LINK } from '@/components/documents/design';
import { TABLE_FRAME, ROW_LINE } from '@/components/executions/activity-design';
import type { ApiResource, DocumentSummary } from '@/lib/api';
import { formatCount } from '@/lib/metrics/format';
import { reviewDateText, reviewDocumentLists } from '@/lib/metrics/review-documents';
import { CheckIcon } from './icons';

// The five most urgent; the rest behind "Ver todos (N)".
export const SHOWN_FIRST = 5;

interface ReviewDocumentsListsProps {
  state: ApiResource<DocumentSummary[]>;
  areaId: string | null;
  today: string;
  // Not ADMIN: the API sends only the documents they are responsible for.
  onlyOwn: boolean;
}

export function ReviewDocumentsLists({ state, areaId, today, onlyOwn }: ReviewDocumentsListsProps) {
  const lists = state.status === 'success' ? reviewDocumentLists(state.data, areaId) : null;
  return (
    <div className="mt-2 flex flex-col gap-3">
      {onlyOwn && (
        <p className="text-sm text-texto-suave">
          En estas listas están solo los documentos de los que sos responsable.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <ReviewList
          title="Vencidos"
          tone="overdue"
          documents={lists?.overdue ?? null}
          state={state}
          today={today}
        />
        <ReviewList
          title="Vencen pronto"
          tone="dueSoon"
          documents={lists?.dueSoon ?? null}
          state={state}
          today={today}
        />
      </div>
    </div>
  );
}

// The words of the date carry the state; the color only goes with them: vencido in peligro, por
// vencer in the alert color of the team (both ≥ 4,5:1 on white).
const TONE = {
  overdue: { dot: 'bg-peligro', text: 'text-peligro' },
  dueSoon: { dot: 'bg-durazno-texto', text: 'text-durazno-texto' },
} as const;

function ReviewList({
  title,
  tone,
  documents,
  state,
  today,
}: {
  title: string;
  tone: keyof typeof TONE;
  documents: DocumentSummary[] | null;
  state: ApiResource<DocumentSummary[]>;
  today: string;
}) {
  const headingId = useId();
  const restId = useId();
  const [all, setAll] = useState(false);
  const first = documents?.slice(0, SHOWN_FIRST) ?? [];
  const rest = documents?.slice(SHOWN_FIRST) ?? [];

  return (
    <section aria-labelledby={headingId} className={`${TABLE_FRAME} flex min-w-0 flex-col`}>
      <h3 id={headingId} className="px-5 pt-5 pb-3 text-lg font-bold text-texto sm:px-6">
        {title}
        {documents && <span className="font-normal text-texto-suave"> ({formatCount(documents.length)})</span>}
      </h3>

      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-3 px-5 pb-5 sm:px-6">
          <p className="text-texto">No pudimos cargar esta lista.</p>
          <button type="button" onClick={state.reload} className={BUTTON_SECONDARY}>
            Reintentar
          </button>
        </div>
      ) : !documents ? (
        <div role="status" aria-label={`Cargando ${title.toLowerCase()}…`} className="px-5 pb-5 sm:px-6">
          <div aria-hidden="true" className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none">
            <div className="h-12 rounded-xl bg-borde" />
            <div className="h-12 rounded-xl bg-borde" />
          </div>
        </div>
      ) : documents.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-texto sm:px-6">
          <CheckIcon className="size-5 shrink-0 text-exito" />
          Ninguno por ahora
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {first.map((document) => (
              <ReviewItem key={document.id} document={document} tone={tone} today={today} />
            ))}
          </ul>
          {rest.length > 0 && (
            <>
              <ul id={restId} hidden={!all} className="flex flex-col">
                {rest.map((document) => (
                  <ReviewItem key={document.id} document={document} tone={tone} today={today} />
                ))}
              </ul>
              <div className={`border-t ${ROW_LINE} px-5 py-4 sm:px-6`}>
                <button
                  type="button"
                  aria-expanded={all}
                  aria-controls={restId}
                  onClick={() => setAll((open) => !open)}
                  className={BUTTON_SECONDARY}
                >
                  {all
                    ? `Ver solo los ${SHOWN_FIRST} más urgentes`
                    : `Ver todos (${formatCount(documents.length)})`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ReviewItem({
  document,
  tone,
  today,
}: {
  document: DocumentSummary;
  tone: keyof typeof TONE;
  today: string;
}) {
  return (
    <li className={`flex flex-col gap-1.5 border-t ${ROW_LINE} px-5 py-3.5 sm:px-6`}>
      <Link href={`/documentos/${encodeURIComponent(document.id)}`} className={`${TEXT_LINK} break-words`}>
        {document.title}
      </Link>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <AreaChips areas={document.areas} />
        <span className={`inline-flex items-center gap-1.5 font-semibold ${TONE[tone].text}`}>
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TONE[tone].dot}`} />
          <time dateTime={document.reviewDate}>{reviewDateText(document.reviewDate, today)}</time>
        </span>
      </span>
    </li>
  );
}
