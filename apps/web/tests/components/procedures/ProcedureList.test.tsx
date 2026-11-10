import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcedureList } from '@/components/procedures/ProcedureList';
import { loadProcedures, saveProcedure } from '@/lib/procedures/session-list';
import {
  ADMIN_ID,
  ANA,
  PROCEDURE_ID,
  STEP_A,
  STEP_B,
  VENTAS,
  procedureResponse,
  stored,
} from '../../support/procedures';

const mocks = vi.hoisted(() => ({
  createProcedure: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/lib/procedures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/procedures')>()),
  createProcedure: mocks.createProcedure,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

const OTHER_PROCEDURE = '1a000000-0000-4000-8000-000000000002';
const OTHER_USER = '0b000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.useSession.mockReturnValue(ANA);
  mocks.createProcedure.mockResolvedValue(procedureResponse());
});

const card = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement;

describe('the notice', () => {
  test('says the list only has what was created in this session, and why', () => {
    render(<ProcedureList />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'Todavía no hay un listado completo de procedimientos; por ahora se ven los que creaste en esta sesión del navegador.',
    );
  });
});

describe('the list', () => {
  test('without procedures it says so', () => {
    render(<ProcedureList />);

    expect(screen.getByText('Todavía no creaste procedimientos en esta sesión.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('shows each procedure with its version, steps and areas', () => {
    saveProcedure(
      ADMIN_ID,
      stored({
        description: 'Al final del día',
        areaIds: [VENTAS],
        steps: [
          { id: STEP_A, order: 1, title: 'A', description: '' },
          { id: STEP_B, order: 2, title: 'B', description: '' },
        ],
      }),
    );
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE, title: 'Recepción de mercadería' }));
    render(<ProcedureList />);

    const first = within(card('Cierre de caja'));
    expect(first.getByText('Versión 1 · borrador')).toBeInTheDocument();
    expect(first.getByText('Al final del día')).toBeInTheDocument();
    expect(first.getByText('2 pasos · 1 área')).toBeInTheDocument();
    expect(within(card('Recepción de mercadería')).getByText('sin pasos · sin áreas')).toBeInTheDocument();
  });

  test('the newest goes first', () => {
    saveProcedure(ADMIN_ID, stored());
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE, title: 'Recepción de mercadería' }));
    render(<ProcedureList />);

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Recepción de mercadería', 'Cierre de caja']);
  });

  test('the title of each one links to its editor, and it is the only link of the card', () => {
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureList />);

    const links = within(card('Cierre de caja')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Cierre de caja');
    expect(links[0]).toHaveAttribute('href', `/procedimientos/${PROCEDURE_ID}`);
  });

  test('has no "Abrir" button: the card is the way in', () => {
    saveProcedure(ADMIN_ID, stored());
    render(<ProcedureList />);

    expect(screen.queryByRole('link', { name: 'Abrir' })).not.toBeInTheDocument();
  });

  test('does not show what another user created', () => {
    saveProcedure(OTHER_USER, stored({ title: 'De otra persona' }));
    render(<ProcedureList />);

    expect(screen.queryByText('De otra persona')).not.toBeInTheDocument();
  });

  test('"Quitar de la lista" removes only that one, and does not call the API', async () => {
    saveProcedure(ADMIN_ID, stored());
    saveProcedure(ADMIN_ID, stored({ id: OTHER_PROCEDURE, title: 'Recepción de mercadería' }));
    render(<ProcedureList />);

    await userEvent.click(
      within(card('Cierre de caja')).getByRole('button', { name: 'Quitar de la lista' }),
    );

    expect(screen.queryByRole('heading', { level: 3, name: 'Cierre de caja' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Recepción de mercadería' })).toBeInTheDocument();
    expect(loadProcedures(ADMIN_ID).map((p) => p.id)).toEqual([OTHER_PROCEDURE]);
    expect(mocks.createProcedure).not.toHaveBeenCalled();
  });
});

describe('creating a procedure', () => {
  test('has the form, and the new procedure shows up in the list', async () => {
    render(<ProcedureList />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), 'Cierre de caja');
    await userEvent.click(screen.getByRole('button', { name: 'Crear procedimiento' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Cierre de caja' })).toBeInTheDocument();
    expect(screen.queryByText('Todavía no creaste procedimientos en esta sesión.')).not.toBeInTheDocument();
  });
});
