import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@/lib/api/api-error';
import { AreasManagementView } from '@/components/admin/AreasManagementView';
import { CreateAreaModal } from '@/components/admin/CreateAreaModal';
import { EditAreaModal } from '@/components/admin/EditAreaModal';

const mocks = vi.hoisted(() => ({
  listApiAreas: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  listApiAreas: mocks.listApiAreas,
  createArea: mocks.createArea,
  updateArea: mocks.updateArea,
  notifyAreasChanged: vi.fn(),
  AREAS_CHANGED_EVENT: 'areas:changed',
}));

const sampleAreas = [
  { id: 'area-1', name: 'Ventas', isActive: true },
  { id: 'area-2', name: 'Operaciones', isActive: true },
  { id: 'area-3', name: 'Legales', isActive: false },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listApiAreas.mockResolvedValue(sampleAreas);
});

describe('CreateAreaModal component', () => {
  test('no renderiza nada si isOpen es false', () => {
    const { container } = render(
      <CreateAreaModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renderiza modal de creación y valida nombre', async () => {
    const userActor = userEvent.setup();
    render(<CreateAreaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Crear nueva área' })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: 'Crear área' });
    await userActor.click(submitBtn);

    expect(screen.getByRole('alert')).toHaveTextContent('El nombre del área es obligatorio.');
  });

  test('permite crear un área exitosamente', async () => {
    const userActor = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    mocks.createArea.mockResolvedValueOnce({
      id: 'area-4',
      name: 'Recursos Humanos',
      isActive: true,
    });

    render(<CreateAreaModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const input = screen.getByLabelText(/nombre del área/i);
    await userActor.type(input, 'Recursos Humanos');
    await userActor.click(screen.getByRole('button', { name: 'Crear área' }));

    await waitFor(() => {
      expect(mocks.createArea).toHaveBeenCalledWith({ name: 'Recursos Humanos' });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('muestra error si el nombre del área ya existe', async () => {
    const userActor = userEvent.setup();
    mocks.createArea.mockRejectedValueOnce(
      new ApiError(409, ['Ya existe un área con ese nombre']),
    );

    render(<CreateAreaModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const input = screen.getByLabelText(/nombre del área/i);
    await userActor.type(input, 'Ventas');
    await userActor.click(screen.getByRole('button', { name: 'Crear área' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un área con ese nombre');
    });
  });
});

describe('EditAreaModal component', () => {
  const targetArea = { id: 'area-1', name: 'Ventas', isActive: true };

  test('no renderiza nada si isOpen es false o area es null', () => {
    const { container } = render(
      <EditAreaModal area={targetArea} isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('permite renombrar y desactivar el área', async () => {
    const userActor = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    mocks.updateArea.mockResolvedValueOnce({
      id: 'area-1',
      name: 'Comercial y Ventas',
      isActive: false,
    });

    render(
      <EditAreaModal
        area={targetArea}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const nameInput = screen.getByLabelText(/nombre del área/i);
    await userActor.clear(nameInput);
    await userActor.type(nameInput, 'Comercial y Ventas');

    const statusSwitch = screen.getByRole('switch', { name: 'Estado activo del área' });
    await userActor.click(statusSwitch);

    await userActor.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(mocks.updateArea).toHaveBeenCalledWith('area-1', {
        name: 'Comercial y Ventas',
        isActive: false,
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('AreasManagementView component', () => {
  test('renderiza catálogo de áreas con sus estados y filtros', async () => {
    render(<AreasManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
      expect(screen.getByText('Operaciones')).toBeInTheDocument();
      expect(screen.getByText('Legales')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Todas (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activas (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inactivas (1)' })).toBeInTheDocument();
  });

  test('permite filtrar por búsqueda', async () => {
    const userActor = userEvent.setup();
    render(<AreasManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('textbox', { name: 'Buscar áreas' });
    await userActor.type(searchInput, 'Legales');

    expect(screen.getByText('Legales')).toBeInTheDocument();
    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
    expect(screen.queryByText('Operaciones')).not.toBeInTheDocument();
  });

  test('al hacer clic en Editar abre el modal de edición de área', async () => {
    const userActor = userEvent.setup();
    render(<AreasManagementView />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-area-area-1')).toBeInTheDocument();
    });

    await userActor.click(screen.getByTestId('edit-area-area-1'));

    expect(screen.getByRole('heading', { level: 2, name: 'Editar área' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ventas')).toBeInTheDocument();
  });
});
