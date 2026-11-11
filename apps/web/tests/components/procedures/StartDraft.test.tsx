import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { StartDraft } from '@/components/procedures/StartDraft';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { PROCEDURE_ID, procedureResponse } from '../../support/procedures';
import { V2, versionDetail, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({ createVersionDraft: vi.fn(), getVersion: vi.fn() }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  createVersionDraft: mocks.createVersionDraft,
  getVersion: mocks.getVersion,
}));

const onStarted = vi.fn();
const draftDetail = versionDetail({ id: V2, versionNumber: 2, status: 'DRAFT' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createVersionDraft.mockResolvedValue(procedureResponse().versions[0] && { ...procedureResponse().versions[0], id: V2, versionNumber: 2 });
  mocks.getVersion.mockResolvedValue(draftDetail);
});

describe('StartDraft without a draft (spec 006, R4 and spec 015, R7)', () => {
  const setup = () => render(<StartDraft procedureId={PROCEDURE_ID} onStarted={onStarted} />);
  const button = () => screen.getByRole('button', { name: 'Crear nueva versión' });

  test('creates the draft, reads its steps (the copy of the published ones) and tells the screen', async () => {
    setup();

    await userEvent.click(button());

    expect(mocks.createVersionDraft).toHaveBeenCalledWith(PROCEDURE_ID);
    expect(mocks.getVersion).toHaveBeenCalledWith(PROCEDURE_ID, V2);
    expect(onStarted).toHaveBeenCalledWith(draftDetail);
  });

  test('a double click creates only one draft, and the button waits meanwhile', async () => {
    mocks.createVersionDraft.mockReturnValue(new Promise(() => {}));
    setup();

    await userEvent.dblClick(button());

    expect(mocks.createVersionDraft).toHaveBeenCalledTimes(1);
    expect(button()).toBeDisabled();
  });

  test('409 DRAFT_ALREADY_EXISTS says so and tells nothing started', async () => {
    mocks.createVersionDraft.mockRejectedValue(new ApiError(409, [], undefined, 'DRAFT_ALREADY_EXISTS'));
    setup();

    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent(PROCEDURE_MESSAGES.draftAlreadyExists);
    expect(onStarted).not.toHaveBeenCalled();
  });

  test('if the steps cannot be read after creating it, it says so and can try again', async () => {
    mocks.getVersion.mockRejectedValueOnce(new ApiError(503));
    setup();

    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe('StartDraft with a draft that the screen does not have yet', () => {
  const setup = () =>
    render(<StartDraft procedureId={PROCEDURE_ID} draft={versionItem({ id: V2 })} onStarted={onStarted} />);

  test('offers to edit that draft, without creating another one', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Editar el borrador' }));

    expect(mocks.createVersionDraft).not.toHaveBeenCalled();
    expect(mocks.getVersion).toHaveBeenCalledWith(PROCEDURE_ID, V2);
    expect(onStarted).toHaveBeenCalledWith(draftDetail);
  });
});
