// Spec 011 (T13; F8): "Marcar la alerta como resuelta", con una nota opcional.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ResolveAlertDialog } from '@/components/documents/ResolveAlertDialog';
import { ApiError } from '@/lib/api';

const mocks = vi.hoisted(() => ({ resolveConflictAlert: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  resolveConflictAlert: mocks.resolveConflictAlert,
}));

const ID = '0c000000-0000-4000-8000-000000000001';
const RESOLVED = { id: ID, status: 'RESOLVED' };

// jsdom no implementa showModal() ni close(): lo mínimo que hace el navegador, como en ArchiveDialog.
const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveConflictAlert.mockResolvedValue(RESOLVED);
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

afterEach(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});

function renderDialog() {
  const props = { onClose: vi.fn(), onResolved: vi.fn(), onConflict: vi.fn() };
  render(<ResolveAlertDialog alertId={ID} open {...props} />);
  return props;
}

const note = () => screen.getByRole('textbox', { name: 'Nota (opcional)' });
const confirm = () => screen.getByRole('button', { name: 'Marcar como resuelta' });

describe('ResolveAlertDialog (F8)', () => {
  test('el título, la explicación, la nota con su contador y los dos botones', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Marcar la alerta como resuelta' })).toBeInTheDocument();
    expect(
      screen.getByText('Hacelo cuando hayas corregido los documentos o decidido que no se contradicen.'),
    ).toBeInTheDocument();
    expect(note()).toHaveAttribute('maxLength', '500');
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  test('E13: con nota, la manda y avisa con la alerta resuelta', async () => {
    const props = renderDialog();
    const user = userEvent.setup();

    await user.type(note(), 'Corregida en la v2');
    expect(screen.getByText('18/500')).toBeInTheDocument();
    await user.click(confirm());

    await waitFor(() => expect(props.onResolved).toHaveBeenCalledWith(RESOLVED));
    expect(mocks.resolveConflictAlert).toHaveBeenCalledWith(ID, 'Corregida en la v2');
  });

  test('sin nota, la resuelve sin nota', async () => {
    const props = renderDialog();

    await userEvent.setup().click(confirm());

    await waitFor(() => expect(props.onResolved).toHaveBeenCalled());
    expect(mocks.resolveConflictAlert).toHaveBeenCalledWith(ID, undefined);
  });

  test('E14: un 409 avisa que otra persona se adelantó', async () => {
    mocks.resolveConflictAlert.mockRejectedValue(new ApiError(409, ['La alerta ya está resuelta']));
    const props = renderDialog();

    await userEvent.setup().click(confirm());

    await waitFor(() => expect(props.onConflict).toHaveBeenCalledWith('Otra persona ya la marcó como resuelta.'));
    expect(props.onResolved).not.toHaveBeenCalled();
  });

  test('otro error queda adentro del diálogo, sin el texto de la API', async () => {
    mocks.resolveConflictAlert.mockRejectedValue(new ApiError(503, ['Service Unavailable']));
    renderDialog();

    await userEvent.setup().click(confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );
    expect(screen.queryByText('Service Unavailable')).not.toBeInTheDocument();
  });

  test('Cancelar cierra sin pedir nada', async () => {
    const props = renderDialog();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onClose).toHaveBeenCalled();
    expect(mocks.resolveConflictAlert).not.toHaveBeenCalled();
  });
});
