import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { VersionTimeline } from '@/components/procedures/VersionTimeline';
import { V1, V2, V3, published, versionItem } from '../../support/versions';

const items = () => within(screen.getByRole('list', { name: 'Versiones' })).getAllByRole('listitem');

describe('VersionTimeline (spec 015, R8)', () => {
  test('has one item per version, the newest first', () => {
    render(
      <VersionTimeline
        versions={[
          published({ id: V1, versionNumber: 1, status: 'SUPERSEDED' }),
          versionItem({ id: V3, versionNumber: 3 }),
          published({ id: V2, versionNumber: 2 }),
        ]}
      />,
    );

    expect(items().map((item) => within(item).getByText(/^Versión \d$/).textContent)).toEqual([
      'Versión 3',
      'Versión 2',
      'Versión 1',
    ]);
  });

  test.each([
    ['DRAFT', 'Borrador'],
    ['PUBLISHED', 'Publicada'],
    ['SUPERSEDED', 'Reemplazada'],
  ] as const)('says the state %s with the word "%s", not only with a color', (status, word) => {
    render(<VersionTimeline versions={[published({ status })]} />);

    expect(within(items()[0]).getByText(word)).toBeInTheDocument();
  });

  test('a published version says when, in the time of Buenos Aires, and by whom', () => {
    render(<VersionTimeline versions={[published()]} />);

    expect(within(items()[0]).getByText('Publicada el 10/11/2026, 09:00 por Ana Administradora')).toBeInTheDocument();
  });

  test('if the directory does not know who published it, it only says when', () => {
    render(<VersionTimeline versions={[published({ publishedBy: { id: 'x', name: null } })]} />);

    expect(within(items()[0]).getByText('Publicada el 10/11/2026, 09:00')).toBeInTheDocument();
  });

  test('a draft says when it was created and has nobody who published it', () => {
    render(<VersionTimeline versions={[versionItem()]} />);

    expect(within(items()[0]).getByText('Creada el 05/11/2026, 09:00')).toBeInTheDocument();
    expect(within(items()[0]).queryByText(/por /)).not.toBeInTheDocument();
  });

  test('only a critical change has the chip "Cambio crítico", with its summary', () => {
    render(
      <VersionTimeline
        versions={[
          published({ id: V2, versionNumber: 2, isCritical: true, changeSummary: 'Cambia el límite de caja' }),
          published({ id: V1, versionNumber: 1, status: 'SUPERSEDED' }),
        ]}
      />,
    );

    expect(within(items()[0]).getByText('Cambio crítico')).toBeInTheDocument();
    expect(within(items()[0]).getByText('Cambia el límite de caja')).toBeInTheDocument();
    expect(within(items()[1]).queryByText('Cambio crítico')).not.toBeInTheDocument();
  });

  test('says how many steps each version has', () => {
    render(<VersionTimeline versions={[versionItem({ stepCount: 1 }), published({ stepCount: 3 })]} />);

    expect(within(items()[0]).getByText('1 paso')).toBeInTheDocument();
    expect(within(items()[1]).getByText('3 pasos')).toBeInTheDocument();
  });
});
