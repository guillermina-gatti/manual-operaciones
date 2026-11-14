import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ExportCsvButton } from '@/components/metrics/ExportCsvButton';

const button = () => screen.getByRole('button', { name: 'Exportar CSV' });

describe('Exportar CSV', () => {
  test('ready: a secondary 44 px button that downloads the file with its name', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(
      <ExportCsvButton
        state={{ status: 'ready', fileName: 'metricas-procedimientos_2026-11-01_2026-11-13.csv', build: () => 'csv' }}
        download={download}
      />,
    );

    expect(button()).toHaveClass('min-h-11', 'border-bosque', 'text-bosque');
    expect(button()).not.toHaveAttribute('aria-disabled');
    await user.click(button());
    expect(download).toHaveBeenCalledWith('csv', 'metricas-procedimientos_2026-11-01_2026-11-13.csv');
    // Said politely, not as an alert.
    const notice = screen.getByText('Archivo descargado');
    expect(notice.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  test('without data: aria-disabled with the reason tied to it, and the click does nothing', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    render(
      <ExportCsvButton
        state={{ status: 'unavailable', reason: 'Esperá a que carguen los datos.' }}
        download={download}
      />,
    );

    expect(button()).toHaveAttribute('aria-disabled', 'true');
    expect(button()).toHaveAccessibleDescription('Esperá a que carguen los datos.');
    expect(button()).toHaveAttribute('title', 'Esperá a que carguen los datos.');
    // Still reachable with the keyboard, so the reason can be heard.
    button().focus();
    expect(button()).toHaveFocus();
    await user.click(button());
    expect(download).not.toHaveBeenCalled();
    expect(screen.queryByText('Archivo descargado')).not.toBeInTheDocument();
  });

  test('if the browser fails, a clear error', async () => {
    const user = userEvent.setup();
    render(
      <ExportCsvButton
        state={{ status: 'ready', fileName: 'a.csv', build: () => 'csv' }}
        download={() => {
          throw new Error('blocked');
        }}
      />,
    );

    await user.click(button());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo descargar el archivo. Probá de nuevo o con otro navegador.',
    );
    expect(screen.queryByText('Archivo descargado')).not.toBeInTheDocument();
  });

  test('the real download: a Blob of CSV and a temporary link that goes away', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:metricas';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <ExportCsvButton state={{ status: 'ready', fileName: 'm.csv', build: () => '﻿a;1\r\n' }} />,
    );

    await user.click(button());
    expect(click).toHaveBeenCalled();
    expect(created[0].type).toBe('text/csv;charset=utf-8');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:metricas');
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
