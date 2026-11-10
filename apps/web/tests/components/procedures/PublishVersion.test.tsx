import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PublishVersion } from '@/components/procedures/PublishVersion';
import { ApiError } from '@/lib/api';
import { PROCEDURE_MESSAGES } from '@/lib/procedures';
import { PROCEDURE_ID } from '../../support/procedures';
import { V2, published, versionItem } from '../../support/versions';

const mocks = vi.hoisted(() => ({ publishVersion: vi.fn() }));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  publishVersion: mocks.publishVersion,
}));

const onPublished = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publishVersion.mockResolvedValue(published({ id: V2, versionNumber: 2 }));
});

// By default there is a published version that this one replaces.
const setup = (replacesPublished = true) =>
  render(
    <PublishVersion
      procedureId={PROCEDURE_ID}
      version={versionItem()}
      replacesPublished={replacesPublished}
      onPublished={onPublished}
    />,
  );
const publishButton = () => screen.getByRole('button', { name: 'Publicar' });
const confirmButton = () => screen.getByRole('button', { name: 'Sí, publicar' });

describe('PublishVersion (spec 015, R2)', () => {
  test('starts with only the button "Publicar": nothing is published yet', () => {
    setup();

    expect(publishButton()).toBeEnabled();
    expect(screen.queryByRole('group', { name: 'Confirmar publicación' })).not.toBeInTheDocument();
    expect(mocks.publishVersion).not.toHaveBeenCalled();
  });

  test('asks to confirm, and says that the current version is replaced', async () => {
    setup();

    await userEvent.click(publishButton());

    const confirmation = screen.getByRole('group', { name: 'Confirmar publicación' });
    expect(confirmation).toHaveTextContent('¿Publicar la versión 2? La versión vigente pasa a reemplazada.');
    expect(mocks.publishVersion).not.toHaveBeenCalled();
  });

  test('the first publication does not say that anything is replaced, because there is nothing', async () => {
    setup(false);

    await userEvent.click(publishButton());

    const confirmation = screen.getByRole('group', { name: 'Confirmar publicación' });
    expect(confirmation).toHaveTextContent('¿Publicar la versión 2? Va a ser la versión vigente.');
    expect(confirmation).not.toHaveTextContent('reemplazada');
  });

  test('"Cancelar" goes back without publishing', async () => {
    setup();
    await userEvent.click(publishButton());

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(publishButton()).toBeInTheDocument();
    expect(mocks.publishVersion).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  test('confirming publishes this version of this procedure and tells the screen', async () => {
    setup();
    await userEvent.click(publishButton());

    await userEvent.click(confirmButton());

    expect(mocks.publishVersion).toHaveBeenCalledWith(PROCEDURE_ID, V2);
    expect(onPublished).toHaveBeenCalledTimes(1);
  });

  test('a double click publishes only once, and the button waits meanwhile', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.publishVersion.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup();
    await userEvent.click(publishButton());

    await userEvent.dblClick(confirmButton());

    expect(mocks.publishVersion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Publicando…' })).toBeDisabled();
    finish(published());
  });

  test.each([
    ['NO_STEPS', PROCEDURE_MESSAGES.noSteps],
    ['NO_AREAS', PROCEDURE_MESSAGES.noAreas],
    ['VERSION_NOT_DRAFT', PROCEDURE_MESSAGES.versionNotDraft],
  ])('409 %s says what to do, and nothing is reported as published', async (reason, message) => {
    mocks.publishVersion.mockRejectedValue(new ApiError(409, [], undefined, reason));
    setup();
    await userEvent.click(publishButton());

    await userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onPublished).not.toHaveBeenCalled();
    expect(publishButton()).toBeEnabled();
  });

  test('after an error it can be tried again', async () => {
    mocks.publishVersion.mockRejectedValueOnce(new ApiError(503));
    setup();
    await userEvent.click(publishButton());
    await userEvent.click(confirmButton());
    await screen.findByRole('alert');

    await userEvent.click(publishButton());
    await userEvent.click(confirmButton());

    expect(mocks.publishVersion).toHaveBeenCalledTimes(2);
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
