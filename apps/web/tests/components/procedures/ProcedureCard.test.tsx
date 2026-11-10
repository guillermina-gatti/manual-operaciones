import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ProcedureCard } from '@/components/procedures/ProcedureCard';
import { stored } from '../../support/procedures';

const setup = (overrides: Parameters<typeof stored>[0]) =>
  render(<ProcedureCard procedure={stored(overrides)} onRemove={vi.fn()} />);

describe('the state of the version in the card (spec 015)', () => {
  test('a copy without a state is a draft, as the procedures of before', () => {
    setup({ versionNumber: 1 });

    expect(screen.getByText('Versión 1 · borrador')).toBeInTheDocument();
  });

  test.each([
    ['DRAFT', 'Versión 2 · borrador'],
    ['PUBLISHED', 'Versión 2 · publicada'],
    ['SUPERSEDED', 'Versión 2 · reemplazada'],
  ] as const)('a %s version says "%s", the same text as the editor', (status, text) => {
    setup({ versionNumber: 2, status });

    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
