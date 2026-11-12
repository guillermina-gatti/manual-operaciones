import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompareVersions } from '@/components/procedures/CompareVersions';
import { ApiError } from '@/lib/api';
import { PROCEDURE_ID } from '../../support/procedures';
import { V1, V2, V3, published, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({ compareVersions: vi.fn() }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  compareVersions: mocks.compareVersions,
}));

const comparison = {
  from: { id: V1, versionNumber: 1, status: 'SUPERSEDED' },
  to: { id: V3, versionNumber: 3, status: 'DRAFT' },
  added: [{ id: 's9', order: 1, title: 'Guardar el arqueo', description: '' }],
  removed: [],
  modified: [],
  unchanged: 2,
};

// Versions 3 (draft), 2 (published) and 1 (superseded), newest first.
const versions = [
  versionItem({ id: V3, versionNumber: 3 }),
  published({ id: V2, versionNumber: 2 }),
  published({ id: V1, versionNumber: 1, status: 'SUPERSEDED' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compareVersions.mockResolvedValue(comparison);
});

const setup = (list = versions) => render(<CompareVersions procedureId={PROCEDURE_ID} versions={list} />);
const from = () => screen.getByRole('combobox', { name: 'Desde' });
const to = () => screen.getByRole('combobox', { name: 'Hasta' });
const compareButton = () => screen.getByRole('button', { name: 'Comparar' });

describe('CompareVersions (spec 015, R10)', () => {
  test('is a section with a selector for each version, naming each one by its number and state', () => {
    setup();

    expect(screen.getByRole('heading', { level: 3, name: 'Comparar versiones' })).toBeInTheDocument();
    expect(within(from()).getByRole('option', { name: 'Versión 2 · publicada' })).toBeInTheDocument();
    expect(within(from()).getAllByRole('option')).toHaveLength(3);
    expect(within(to()).getAllByRole('option')).toHaveLength(3);
  });

  test('starts with the version before the newest on the left and the newest on the right', () => {
    setup();

    expect(from()).toHaveValue(V2);
    expect(to()).toHaveValue(V3);
  });

  test('asks the API for the two chosen versions and shows the result', async () => {
    setup();
    await userEvent.selectOptions(from(), V1);

    await userEvent.click(compareButton());

    expect(mocks.compareVersions).toHaveBeenCalledWith(PROCEDURE_ID, V1, V3);
    expect(await screen.findByText('Guardar el arqueo')).toBeInTheDocument();
  });

  test('the same version on both sides cannot be compared: it says why and does not ask', async () => {
    setup();

    await userEvent.selectOptions(from(), V3);

    expect(compareButton()).toBeDisabled();
    expect(screen.getByText('Elegí dos versiones distintas.')).toBeInTheDocument();
    expect(mocks.compareVersions).not.toHaveBeenCalled();
  });

  test('an error says what happened and nothing is shown as a result', async () => {
    mocks.compareVersions.mockRejectedValue(new ApiError(503));
    setup();

    await userEvent.click(compareButton());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Guardar el arqueo')).not.toBeInTheDocument();
  });

  test('choosing other versions clears the old result', async () => {
    setup();
    await userEvent.click(compareButton());
    await screen.findByText('Guardar el arqueo');

    await userEvent.selectOptions(from(), V1);

    expect(screen.queryByText('Guardar el arqueo')).not.toBeInTheDocument();
  });

  test('with only one version there is nothing to compare and the section is not shown', () => {
    setup([versionItem()]);

    expect(screen.queryByRole('heading', { name: 'Comparar versiones' })).not.toBeInTheDocument();
  });
});
