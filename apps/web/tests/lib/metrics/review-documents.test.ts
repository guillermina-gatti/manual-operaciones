import { describe, expect, test } from 'vitest';
import type { DocumentSummary } from '@/lib/api';
import { daysUntil, reviewDateText, reviewDocumentLists } from '@/lib/metrics/review-documents';
import { reviewDocument } from '../../support/review-documents';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';

describe('reviewDateText', () => {
  const TODAY = '2026-11-13';

  test('still to come: the day it is due', () => {
    expect(reviewDateText('2026-11-20', TODAY)).toBe('vence el 20 nov 2026');
    expect(reviewDateText('2027-01-02', TODAY)).toBe('vence el 2 ene 2027');
  });

  test('today, yesterday and N days ago', () => {
    expect(reviewDateText('2026-11-13', TODAY)).toBe('vence hoy');
    expect(reviewDateText('2026-11-12', TODAY)).toBe('venció ayer');
    expect(reviewDateText('2026-11-08', TODAY)).toBe('venció hace 5 días');
  });

  test('across months and years, by calendar days', () => {
    expect(reviewDateText('2026-10-30', TODAY)).toBe('venció hace 14 días');
    expect(daysUntil('2025-12-31', '2026-01-02')).toBe(-2);
    // 2028 is a leap year: 28 Feb to 1 Mar is two days.
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2);
  });

  test('a date that cannot be read', () => {
    expect(reviewDateText('20/11/2026', TODAY)).toBe('—');
  });
});

describe('reviewDocumentLists', () => {
  const DOCUMENTS: DocumentSummary[] = [
    reviewDocument(1, 'Manual de caja', [VENTAS], '2026-11-08', 'OVERDUE'),
    reviewDocument(2, 'Política de devoluciones', [VENTAS], '2026-10-30', 'OVERDUE'),
    reviewDocument(3, 'Plan de evacuación', [OPERACIONES], '2026-11-12', 'OVERDUE'),
    reviewDocument(4, 'Protocolo de recepción', [OPERACIONES], '2026-11-20', 'DUE_SOON'),
    reviewDocument(5, 'Apertura del local', [VENTAS, OPERACIONES], '2026-11-18', 'DUE_SOON'),
    reviewDocument(6, 'Al día', [VENTAS], '2027-03-01', 'UP_TO_DATE'),
  ];
  const titles = (documents: DocumentSummary[]) => documents.map((document) => document.title);

  test('split by the state of the API, the most urgent first', () => {
    const { overdue, dueSoon } = reviewDocumentLists(DOCUMENTS, null);
    expect(titles(overdue)).toEqual([
      'Política de devoluciones',
      'Manual de caja',
      'Plan de evacuación',
    ]);
    expect(titles(dueSoon)).toEqual(['Apertura del local', 'Protocolo de recepción']);
  });

  test('only the area of the panel; a document with two areas is in both', () => {
    const { overdue, dueSoon } = reviewDocumentLists(DOCUMENTS, OPERACIONES);
    expect(titles(overdue)).toEqual(['Plan de evacuación']);
    expect(titles(dueSoon)).toEqual(['Apertura del local', 'Protocolo de recepción']);
  });

  test('without a review state (not theirs) or archived: not listed', () => {
    const noReview = { ...reviewDocument(7, 'Sin estado', [VENTAS], '2026-11-01', 'OVERDUE'), review: undefined };
    const archived = { ...reviewDocument(8, 'Archivado', [VENTAS], '2026-11-01', 'OVERDUE'), status: 'ARCHIVED' as const };
    expect(reviewDocumentLists([noReview, archived], null)).toEqual({ overdue: [], dueSoon: [] });
  });
});
