import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/FieldError';
import { ScreenState } from '@/components/ui/ScreenState';

describe('ScreenState', () => {
  test('cargando: aviso con aria-busy y el esqueleto de la pantalla', () => {
    render(
      <ScreenState kind="loading" label="Cargando documentos…">
        <div data-testid="esqueleto" />
      </ScreenState>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Cargando documentos…');
    expect(screen.getByTestId('esqueleto')).toBeInTheDocument();
  });

  test('cargando sin esqueleto: el texto aparece una sola vez', () => {
    render(<ScreenState kind="loading" />);

    expect(screen.getAllByText('Cargando…')).toHaveLength(1);
  });

  test('vacío: el mensaje y la acción que pasa la pantalla', () => {
    render(
      <ScreenState
        kind="empty"
        message="Todavía no hay documentos en tus áreas"
        action={<Link href="/documentos/nuevo">Cargar el primer documento</Link>}
      />,
    );

    expect(screen.getByText('Todavía no hay documentos en tus áreas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cargar el primer documento' })).toBeInTheDocument();
  });

  test('vacío sin acción: solo el mensaje', () => {
    render(<ScreenState kind="empty" message="Todavía no hay documentos en tus áreas" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('error: el mensaje con role="alert" y "Reintentar" llama a onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ScreenState
        kind="error"
        message="El servicio no está disponible. Probá de nuevo en unos minutos."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'El servicio no está disponible. Probá de nuevo en unos minutos.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('error sin onRetry: no muestra "Reintentar"', () => {
    render(<ScreenState kind="error" message="No se encontró el documento." />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se encontró el documento.');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});

describe('FieldError', () => {
  test('queda asociado al campo con aria-describedby', () => {
    render(
      <>
        <label htmlFor="title">Título</label>
        <input id="title" aria-describedby="title-error" aria-invalid="true" />
        <FieldError id="title-error" message="El título tiene que tener entre 1 y 200 caracteres." />
      </>,
    );

    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveAccessibleDescription(
      'El título tiene que tener entre 1 y 200 caracteres.',
    );
  });

  test('sin mensaje no renderiza nada', () => {
    const { container } = render(<FieldError id="title-error" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('Button', () => {
  test('deshabilitado no dispara onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Cargar documento
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Cargar documento' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  test('habilitado dispara onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Reintentar</Button>);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('por defecto es type="button": dentro de un formulario no lo envía', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Elegir otro archivo</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Elegir otro archivo' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('con type="submit" sí envía el formulario', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Cargar documento</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Cargar documento' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('mide al menos 44 px de alto (F10): tiene la clase min-h-11', () => {
    render(<Button variant="secondary">Reintentar</Button>);

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveClass('min-h-11');
  });
});
