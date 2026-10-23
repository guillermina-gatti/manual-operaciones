import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DownloadButton } from '@/components/documents/DownloadButton';
import { ApiError } from '@/lib/api';

const mocks = vi.hoisted(() => ({ getDownloadUrl: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDownloadUrl: mocks.getDownloadUrl,
}));

const ID = '11111111-1111-4111-8111-111111111111';
const link = (n: number) => ({
  url: `https://manual-docs.s3.amazonaws.com/documents/x.pdf?firma=${n}`,
  expiresAt: '2026-10-23T15:05:00.000Z',
});

// Un pedido que el test resuelve cuando quiere.
function pendingLink() {
  let resolve!: (value: ReturnType<typeof link>) => void;
  const promise = new Promise<ReturnType<typeof link>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const button = () => screen.getByRole('button', { name: /Descargar|Preparando/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F8: el enlace se pide en cada clic y nunca se guarda', () => {
  test('al mostrarse no pide nada', () => {
    render(<DownloadButton documentId={ID} openUrl={vi.fn()} />);

    expect(mocks.getDownloadUrl).not.toHaveBeenCalled();
  });

  test('E11: el clic pide el enlace a la API y lo abre', async () => {
    const user = userEvent.setup();
    const openUrl = vi.fn();
    mocks.getDownloadUrl.mockResolvedValue(link(1));
    render(<DownloadButton documentId={ID} openUrl={openUrl} />);

    await user.click(button());

    expect(mocks.getDownloadUrl).toHaveBeenCalledWith(ID, expect.any(AbortSignal));
    expect(openUrl).toHaveBeenCalledWith(link(1).url);
  });

  test('dos clics hacen dos pedidos y abren cada enlace nuevo', async () => {
    const user = userEvent.setup();
    const openUrl = vi.fn();
    mocks.getDownloadUrl.mockResolvedValueOnce(link(1)).mockResolvedValueOnce(link(2));
    render(<DownloadButton documentId={ID} openUrl={openUrl} />);

    await user.click(button());
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());

    expect(mocks.getDownloadUrl).toHaveBeenCalledTimes(2);
    expect(openUrl.mock.calls).toEqual([[link(1).url], [link(2).url]]);
  });
});

describe('mientras espera', () => {
  test('el botón queda deshabilitado con "Preparando…"', async () => {
    const user = userEvent.setup();
    const pending = pendingLink();
    mocks.getDownloadUrl.mockReturnValue(pending.promise);
    render(<DownloadButton documentId={ID} openUrl={vi.fn()} />);

    await user.click(button());

    expect(button()).toBeDisabled();
    expect(button()).toHaveTextContent('Preparando…');
    expect(button()).toHaveAttribute('aria-busy', 'true');

    pending.resolve(link(1));
    await waitFor(() => expect(button()).toHaveTextContent('Descargar'));
    expect(button()).toBeEnabled();
  });

  test('dos clics que llegan antes de que React vuelva a dibujar hacen un solo pedido', () => {
    mocks.getDownloadUrl.mockReturnValue(pendingLink().promise);
    render(<DownloadButton documentId={ID} openUrl={vi.fn()} />);
    const element = button();

    // Dentro de un mismo act, React no dibuja entre los dos clics: el botón todavía no está deshabilitado.
    act(() => {
      element.click();
      element.click();
    });

    expect(mocks.getDownloadUrl).toHaveBeenCalledTimes(1);
  });

  test('si la pantalla se cierra antes de la respuesta, no abre nada y cancela el pedido', async () => {
    const user = userEvent.setup();
    const openUrl = vi.fn();
    const pending = pendingLink();
    mocks.getDownloadUrl.mockReturnValue(pending.promise);
    const { unmount } = render(<DownloadButton documentId={ID} openUrl={openUrl} />);

    await user.click(button());
    const signal: AbortSignal = mocks.getDownloadUrl.mock.calls[0][1];
    unmount();
    pending.resolve(link(1));
    await pending.promise;

    expect(signal.aborted).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('errores, debajo del botón', () => {
  test('404: "No se encontró el documento."', async () => {
    const user = userEvent.setup();
    const openUrl = vi.fn();
    mocks.getDownloadUrl.mockRejectedValue(new ApiError(404, ['Not Found']));
    render(<DownloadButton documentId={ID} openUrl={openUrl} />);

    await user.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el documento.');
    expect(openUrl).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  test('503: "Probá de nuevo en unos minutos"', async () => {
    const user = userEvent.setup();
    mocks.getDownloadUrl.mockRejectedValue(new ApiError(503));
    render(<DownloadButton documentId={ID} openUrl={vi.fn()} />);

    await user.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );
  });

  test('un clic nuevo borra el error anterior', async () => {
    const user = userEvent.setup();
    mocks.getDownloadUrl.mockRejectedValueOnce(new ApiError(503)).mockResolvedValueOnce(link(1));
    render(<DownloadButton documentId={ID} openUrl={vi.fn()} />);

    await user.click(button());
    await screen.findByRole('alert');
    await user.click(button());

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test.each(['javascript:alert(1)', 'memory://documents/x.pdf', 'no es una url'])(
    'un enlace %s no se abre: error inesperado',
    async (url) => {
      const user = userEvent.setup();
      const openUrl = vi.fn();
      mocks.getDownloadUrl.mockResolvedValue({ url, expiresAt: '2026-10-23T15:05:00.000Z' });
      render(<DownloadButton documentId={ID} openUrl={openUrl} />);

      await user.click(button());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ocurrió un error inesperado. Probá de nuevo.',
      );
      expect(openUrl).not.toHaveBeenCalled();
    },
  );
});
