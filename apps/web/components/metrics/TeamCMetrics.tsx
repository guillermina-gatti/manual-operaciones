'use client';

// The assistant and documents metrics, behind the teamCMetrics port: both come from the API, with
// the filters of the panel. Under the document tiles, the lists of the ones due soon and overdue,
// from the "Por revisar" list of the API (read only).
import { listPendingReview, metricsQuery, useApiResource } from '@/lib/api';
import type { DocumentSummary } from '@/lib/api';
import { teamCMetrics } from '@/lib/metrics';
import { todayInCompany } from '@/lib/metrics/filters';
import type { PanelFilters } from '@/lib/metrics/filters';
import { AssistantMetricsCard } from './AssistantMetricsCard';
import { DocumentMetricsCard } from './DocumentMetricsCard';
import { ReviewDocumentsLists } from './ReviewDocumentsLists';

// The API gives at most 100 per page; ten pages are far more than a company has to review.
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export async function allPendingReview(signal: AbortSignal): Promise<DocumentSummary[]> {
  const documents: DocumentSummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await listPendingReview(page, PAGE_LIMIT, signal);
    documents.push(...answer.data);
    if (answer.data.length === 0 || documents.length >= answer.total) break;
  }
  return documents;
}

interface TeamCMetricsProps {
  filters: PanelFilters;
  // Without a session nothing is asked for. Part of the key: switching users asks again.
  userId: string | null;
  // What the page adds to "Ver todas mis áreas" (the tab of /metricas).
  keepParams?: (href: string) => string;
  // An ADMIN gets every document to review; anyone else, only the ones they are responsible for.
  isAdmin?: boolean;
}

export function TeamCMetrics({ filters, userId, keepParams, isAdmin = false }: TeamCMetricsProps) {
  const query = metricsQuery(filters);
  const assistant = useApiResource(
    userId ? `team-c-assistant:${userId}${query}` : null,
    (signal) => teamCMetrics.getAssistant(filters, signal),
  );
  const documents = useApiResource(
    userId ? `team-c-documents:${userId}${query}` : null,
    (signal) => teamCMetrics.getDocuments(filters, signal),
  );
  // Today's state, whatever the dates: the area is applied by the lists.
  const toReview = useApiResource(userId ? `metrics-review:${userId}` : null, allPendingReview);

  // The tab "Documentos y asistente" names the panel: each part carries its own title.
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <DocumentMetricsCard filters={filters} state={documents} keepParams={keepParams}>
        <ReviewDocumentsLists
          state={toReview}
          areaId={filters.areaId}
          today={todayInCompany()}
          onlyOwn={!isAdmin}
        />
      </DocumentMetricsCard>
      <AssistantMetricsCard filters={filters} state={assistant} keepParams={keepParams} />
    </div>
  );
}
