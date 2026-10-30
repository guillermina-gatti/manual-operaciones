import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DocumentCard } from '@/components/documents/DocumentCard';
import type { DocumentSummary, ReviewStatus } from '@/lib/api';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';

const DOCUMENT: DocumentSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Manual de caja',
  description: null,
  status: 'ACTIVE',
  areaIds: [VENTAS, OPERACIONES],
  ownerId: '0b000000-0000-4000-8000-000000000002',
  reviewDate: '2027-03-01',
  createdById: '0b000000-0000-4000-8000-000000000001',
  createdAt: '2026-10-23T15:00:00.000Z',
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    originalFileName: 'manual-de-caja.pdf',
    mimeType: 'application/pdf',
    processingStatus: 'PENDING',
  },
};

const AREA_NAMES = { [VENTAS]: 'Ventas', [OPERACIONES]: 'Operaciones' };

function renderCard(props: Partial<Parameters<typeof DocumentCard>[0]> = {}) {
  return render(
    <DocumentCard
      document={DOCUMENT}
      areaNames={AREA_NAMES}
      ownerName="Sergio Supervisor de Ventas"
      isAdmin={false}
      {...props}
    />,
  );
}

// El valor (dd) que acompaña a una etiqueta (dt) de la tarjeta.
function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.nextElementSibling as HTMLElement;
}

describe('datos de la tarjeta (F7)', () => {
  test('el título es un enlace al detalle', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Manual de caja' })).toHaveAttribute(
      'href',
      `/documentos/${DOCUMENT.id}`,
    );
  });

  test('muestra áreas, responsable, fecha de revisión y fecha de carga', () => {
    renderCard();

    expect(valueOf('Áreas')).toHaveTextContent('Ventas, Operaciones');
    expect(valueOf('Responsable')).toHaveTextContent('Sergio Supervisor de Ventas');
    expect(valueOf('Revisión')).toHaveTextContent('01/03/2027');
    expect(valueOf('Cargado')).toHaveTextContent('23/10/2026, 12:00');
  });

  test('muestra el nombre del archivo', () => {
    renderCard();

    expect(screen.getByText('manual-de-caja.pdf')).toBeInTheDocument();
  });

  test('sin el nombre del responsable muestra "—"', () => {
    renderCard({ ownerName: undefined });

    expect(valueOf('Responsable')).toHaveTextContent('—');
  });

  test('un área sin nombre se muestra como "—"', () => {
    renderCard({ areaNames: { [VENTAS]: 'Ventas' } });

    expect(valueOf('Áreas')).toHaveTextContent('Ventas, —');
  });
});

describe('textos largos o con tildes (caso borde)', () => {
  const longTitle =
    'Instrucción de operación para la recepción, verificación y almacenamiento de mercadería en depósito';
  const longFileName =
    'instrucción-de-operación-para-la-recepción-verificación-y-almacenamiento-versión-definitiva.pdf';

  test('el título se recorta y conserva el texto completo, con las tildes, en title', () => {
    renderCard({ document: { ...DOCUMENT, title: longTitle } });

    const link = screen.getByRole('link', { name: longTitle });
    expect(link).toHaveClass('truncate');
    expect(link).toHaveAttribute('title', longTitle);
  });

  test('el nombre del archivo se recorta y conserva el texto completo en title', () => {
    renderCard({
      document: {
        ...DOCUMENT,
        currentVersion: { ...DOCUMENT.currentVersion, originalFileName: longFileName },
      },
    });

    const fileName = screen.getByText(longFileName);
    expect(fileName).toHaveClass('truncate');
    expect(fileName).toHaveAttribute('title', longFileName);
  });
});

describe('etiqueta "Archivado"', () => {
  const archived: DocumentSummary = { ...DOCUMENT, status: 'ARCHIVED' };

  test('el ADMIN la ve en un documento archivado', () => {
    renderCard({ document: archived, isAdmin: true });

    expect(within(screen.getByRole('article')).getByText('Archivado')).toBeInTheDocument();
  });

  test('otro rol no la ve', () => {
    renderCard({ document: archived, isAdmin: false });

    expect(screen.queryByText('Archivado')).not.toBeInTheDocument();
  });

  test('en un documento activo no aparece', () => {
    renderCard({ isAdmin: true });

    expect(screen.queryByText('Archivado')).not.toBeInTheDocument();
  });
});

// Spec 005 (T16, F1): la etiqueta del estado de revisión, junto al título.
describe('etiqueta del estado de revisión (F1)', () => {
  const withReview = (status: ReviewStatus | null): DocumentSummary => ({
    ...DOCUMENT,
    review: { status, lastReviewedAt: null, lastReviewedById: null },
  });

  test('E1: por vencer → "Vence pronto", en la cabecera junto al título', () => {
    renderCard({ document: withReview('DUE_SOON') });

    const badge = screen.getByText('Vence pronto');
    expect(badge.closest('div')).toContainElement(
      screen.getByRole('link', { name: 'Manual de caja' }),
    );
  });

  test('E2: vencido → "Vencido"', () => {
    renderCard({ document: withReview('OVERDUE') });

    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  test('E3: al día → sin etiqueta', () => {
    renderCard({ document: withReview('UP_TO_DATE') });

    expect(screen.queryByText(/Vencido|Vence pronto/)).not.toBeInTheDocument();
  });

  test('E5: sin review (no es ADMIN ni responsable) → sin etiqueta', () => {
    renderCard({ document: { ...DOCUMENT, reviewDate: '2020-01-01' } });

    expect(screen.queryByText(/Vencido|Vence pronto/)).not.toBeInTheDocument();
  });

  test('un archivado para el ADMIN: "Archivado" y ninguna etiqueta de revisión', () => {
    renderCard({ document: { ...withReview(null), status: 'ARCHIVED' }, isAdmin: true });

    expect(screen.getByText('Archivado')).toBeInTheDocument();
    expect(screen.queryByText(/Vencido|Vence pronto/)).not.toBeInTheDocument();
  });
});
