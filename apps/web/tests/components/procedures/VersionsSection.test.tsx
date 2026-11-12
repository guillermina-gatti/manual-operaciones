import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VersionsSection } from '@/components/procedures/VersionsSection';
import type { ApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/api/procedure-versions';
import { published, versionItem } from '../../support/versions';

const reload = vi.fn();

const resource = (state: Partial<ApiResource<VersionHistoryItem[]>>) =>
  ({ status: 'success', data: [], error: null, reload, ...state }) as ApiResource<VersionHistoryItem[]>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VersionsSection (spec 015, R8)', () => {
  test('is a section named "Versiones" with the timeline inside', () => {
    render(<VersionsSection versions={resource({ data: [published(), versionItem()] })} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Versiones' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Versiones' })).toBeInTheDocument();
  });

  test('while it loads it says so for screen readers', () => {
    render(<VersionsSection versions={resource({ status: 'loading', data: undefined })} />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando las versiones…');
    expect(screen.queryByRole('list', { name: 'Versiones' })).not.toBeInTheDocument();
  });

  test('on an error it says what happened and lets try again', async () => {
    render(<VersionsSection versions={resource({ status: 'error', data: undefined, error: new Error('x') })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las versiones.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('gives the loaded versions to what goes inside, and only when they are loaded', () => {
    const inside = vi.fn(() => <p>Acciones</p>);

    const { rerender } = render(
      <VersionsSection versions={resource({ status: 'loading', data: undefined })}>{inside}</VersionsSection>,
    );
    expect(inside).not.toHaveBeenCalled();

    rerender(<VersionsSection versions={resource({ data: [published()] })}>{inside}</VersionsSection>);
    expect(inside).toHaveBeenCalledWith([published()]);
    expect(screen.getByText('Acciones')).toBeInTheDocument();
  });

  test('a procedure with no versions says so', () => {
    render(<VersionsSection versions={resource({ data: [] })} />);

    expect(screen.getByText('Todavía no hay versiones.')).toBeInTheDocument();
  });
});
