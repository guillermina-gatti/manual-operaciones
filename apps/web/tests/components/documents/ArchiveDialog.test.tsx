import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ArchiveDialog } from '@/components/documents/ArchiveDialog';
import { ApiError } from '@/lib/api';

const mocks = vi.hoisted(() => ({ archiveDocument: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  archiveDocument: mocks.archiveDocument,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVED = { id: ID, status: 'ARCHIVED', archivedAt: '2026-10-23T18:00:00.000Z' };
const R14 =
  '¿Seguro que querés archivar este documento? Va a dejar de verse para los demás usuarios y no se puede deshacer.';

// jsdom no implementa showModal() ni close(): se simulan con lo mínimo que hace el navegador
// (el atributo open y el evento close). El comportamiento real lo comprueba Playwright (T26).
const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.archiveDocument.mockResolvedValue(ARCHIVED);
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

// Hace de detalle: abre el diálogo con un botón y lo cierra cuando el diálogo avisa.
function Harness({ onArchived = vi.fn() }: { onArchived?: (doc: unknown) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Archivar
      </button>
      <ArchiveDialog
        documentId={ID}
        open={open}
        onClose={() => setOpen(false)}
        onArchived={(doc) => {
          setOpen(false);
          onArchived(doc);
        }}
      />
    </>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, onArchived = vi.fn()) {
  render(<Harness onArchived={onArchived} />);
  await user.click(screen.getByRole('button', { name: 'Archivar' }));
  return screen.getByRole('dialog', { name: 'Archivar documento' });
}

describe('ArchiveDialog (spec 003, R10, R14; plan 003, 6.4)', () => {
  test('cerrado no muestra nada ni llama a showModal', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  test('abre como modal, con el texto exacto de R14', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent(R14);
  });

  test('el foco empieza en "Cancelar"', async () => {
    const user = userEvent.setup();
    await openDialog(user);

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  test('E11: "Cancelar" cierra sin ningún pedido a la API', async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.archiveDocument).not.toHaveBeenCalled();
  });

  test('E7: "Archivar" llama a archiveDocument y avisa al detalle con el documento', async () => {
    const user = userEvent.setup();
    const onArchived = vi.fn();
    const dialog = await openDialog(user, onArchived);

    await user.click(withinDialog(dialog, 'Archivar'));

    await waitFor(() => expect(onArchived).toHaveBeenCalledWith(ARCHIVED));
    expect(mocks.archiveDocument).toHaveBeenCalledWith(ID);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('mientras espera: deshabilitado con "Archivando…", y Cancelar también', async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.archiveDocument.mockReturnValue(new Promise((done) => (resolve = done)));
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.dblClick(withinDialog(dialog, 'Archivar'));

    const pending = withinDialog(dialog, 'Archivando…');
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(mocks.archiveDocument).toHaveBeenCalledTimes(1);
    resolve(ARCHIVED);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test.each([
    [
      '409',
      new ApiError(409, ['El documento está archivado'], undefined, 'ARCHIVED'),
      'El documento fue archivado. Ya no se puede modificar.',
    ],
    [
      '503',
      new ApiError(503, ['Service Unavailable']),
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    ],
  ])('%s: el mensaje dentro del diálogo, que sigue abierto', async (_code, error, message) => {
    mocks.archiveDocument.mockRejectedValue(error);
    const user = userEvent.setup();
    const onArchived = vi.fn();
    const dialog = await openDialog(user, onArchived);

    await user.click(withinDialog(dialog, 'Archivar'));

    const alert = await screen.findByRole('alert');
    expect(dialog).toContainElement(alert);
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(withinDialog(dialog, 'Archivar')).toBeEnabled();
    expect(onArchived).not.toHaveBeenCalled();
  });
});

// El botón del diálogo, no el que lo abre.
function withinDialog(dialog: HTMLElement, name: string) {
  const button = Array.from(dialog.querySelectorAll('button')).find(
    (element) => element.textContent === name,
  );
  if (!button) throw new Error(`No está el botón "${name}" en el diálogo`);
  return button;
}
