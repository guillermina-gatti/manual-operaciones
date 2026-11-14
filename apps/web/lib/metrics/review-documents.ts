// "Vencen pronto" and "Vencidos" of the documents metrics (HU38): the documents the API already
// marks as due soon or overdue (GET /documents/pending-review, spec 005), split, filtered by the
// area of the panel and in order of urgency. Pure: the dates are days ("YYYY-MM-DD") and today is
// the day in Argentina (todayInCompany), so "hace N días" never moves with the browser's zone.
import type { DocumentSummary } from '@/lib/api';
import { formatDay } from './format';

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(day: string): number | null {
  const match = CALENDAR_DATE.exec(day);
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / DAY_MS);
}

// Days from today to the review date: 0 today, negative when it passed.
export function daysUntil(reviewDate: string, today: string): number | null {
  const review = dayNumber(reviewDate);
  const now = dayNumber(today);
  return review === null || now === null ? null : review - now;
}

// "vence el 20 nov 2026", "vence hoy", "venció ayer", "venció hace 5 días". A date that cannot be
// read: "—".
export function reviewDateText(reviewDate: string, today: string): string {
  const days = daysUntil(reviewDate, today);
  if (days === null) return '—';
  if (days > 0) return `vence el ${formatDay(reviewDate)}`;
  if (days === 0) return 'vence hoy';
  if (days === -1) return 'venció ayer';
  return `venció hace ${-days} días`;
}

export interface ReviewDocumentLists {
  dueSoon: DocumentSummary[];
  overdue: DocumentSummary[];
}

// By the state the API sends (the web never works it out, D16 of spec 005), only the ones of the
// area of the panel when there is one, the most urgent first: the overdue that passed longest ago,
// the due soon that are closest; a tie by title.
export function reviewDocumentLists(
  documents: DocumentSummary[],
  areaId: string | null,
): ReviewDocumentLists {
  const inArea = documents.filter(
    (document) => document.status === 'ACTIVE' && (!areaId || document.areaIds.includes(areaId)),
  );
  const byDate = (a: DocumentSummary, b: DocumentSummary) =>
    a.reviewDate.localeCompare(b.reviewDate) || a.title.localeCompare(b.title, 'es');
  return {
    dueSoon: inArea.filter((document) => document.review?.status === 'DUE_SOON').sort(byDate),
    overdue: inArea.filter((document) => document.review?.status === 'OVERDUE').sort(byDate),
  };
}
