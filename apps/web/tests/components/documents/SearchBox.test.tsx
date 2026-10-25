import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SearchBox } from '@/components/documents/SearchBox';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const box = () => screen.getByRole('searchbox', { name: 'Buscar documentos' });
const searchButton = () => screen.getByRole('button', { name: 'Buscar' });

describe('SearchBox (spec 004, F1, F2, F6)', () => {
  test('está dentro de un formulario de búsqueda, con el límite de 100 caracteres', () => {
    render(<SearchBox query={null} />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(box()).toHaveAttribute('maxLength', '100');
  });

  test('E9: "ca" + Enter muestra el aviso y no busca', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), 'ca{Enter}');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Escribí al menos 3 caracteres para buscar.');
    expect(box()).toHaveAttribute('aria-describedby', alert.id);
    expect(box()).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('una búsqueda vacía también avisa y no busca', async () => {
    render(<SearchBox query={null} />);

    await userEvent.click(searchButton());

    expect(screen.getByRole('alert')).toHaveTextContent('al menos 3 caracteres');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('"caja" + "Buscar" lleva a /documentos?q=caja', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), 'caja');
    await userEvent.click(searchButton());

    expect(mocks.push).toHaveBeenCalledWith('/documentos?q=caja');
  });

  test('Enter también busca', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), 'caja{Enter}');

    expect(mocks.push).toHaveBeenCalledWith('/documentos?q=caja');
  });

  test('F1: escribir sin enviar no busca', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), 'cierre de caja');

    expect(mocks.push).not.toHaveBeenCalled();
  });

  test('codifica el texto y le quita los espacios de los extremos', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), '  cierre & caja  {Enter}');

    expect(mocks.push).toHaveBeenCalledWith('/documentos?q=cierre%20%26%20caja');
  });

  test('el aviso desaparece al seguir escribiendo', async () => {
    render(<SearchBox query={null} />);

    await userEvent.type(box(), 'ca{Enter}');
    await userEvent.type(box(), 'j');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('arranca con el texto de la búsqueda activa', () => {
    render(<SearchBox query="caja" />);

    expect(box()).toHaveValue('caja');
  });

  test('F2: un q inválido en la dirección se muestra con el aviso', () => {
    render(<SearchBox query="ca" />);

    expect(box()).toHaveValue('ca');
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 3 caracteres');
  });

  test('F6: "Borrar búsqueda" aparece solo con una búsqueda y lleva a /documentos', async () => {
    const { rerender } = render(<SearchBox query={null} />);
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).not.toBeInTheDocument();

    rerender(<SearchBox query="caja" />);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));

    expect(mocks.push).toHaveBeenCalledWith('/documentos');
  });
});
