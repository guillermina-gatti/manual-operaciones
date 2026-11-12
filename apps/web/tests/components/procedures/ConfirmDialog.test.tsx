import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfirmDialog } from '@/components/procedures/ConfirmDialog';
import { simulateDialogs } from '../../support/dialog';

simulateDialogs();

const onConfirm = vi.fn();
const onCancel = vi.fn();

beforeEach(() => vi.clearAllMocks());

function setup(props: { busy?: boolean } = {}) {
  render(
    <ConfirmDialog
      title="¿Borrar el paso «Contar las cajas»?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    >
      Se quita del borrador y los demás pasos se vuelven a numerar. No se puede deshacer.
    </ConfirmDialog>,
  );
}

describe('ConfirmDialog (spec 015, D25)', () => {
  test('opens as a modal dialog named by its title and described by its text', () => {
    setup();

    const dialog = screen.getByRole('dialog', { name: '¿Borrar el paso «Contar las cajas»?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/Se quita del borrador/);
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  test('has the red "!" mark hidden from screen readers and the two buttons', () => {
    setup();

    expect(screen.getByText('!')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, borrar' })).toBeInTheDocument();
  });

  test('"Cancelar" has the focus at the start, so a hasty Enter does not delete', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  test('"Sí, borrar" confirms and does not cancel', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('"Cancelar" cancels without confirming', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('Escape (the cancel event of the dialog) cancels', () => {
    setup();

    fireEvent(screen.getByRole('dialog'), new Event('close'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('while it works, both buttons wait and Escape does not close it', () => {
    setup({ busy: true });

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Borrando…' })).toBeDisabled();
    const cancel = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog').dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
  });
});
