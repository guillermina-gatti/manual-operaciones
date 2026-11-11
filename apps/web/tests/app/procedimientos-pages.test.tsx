import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ProcedimientoPage from '@/app/procedimientos/[id]/page';
import ProcedimientosPage from '@/app/procedimientos/page';
import { ANA } from '../support/procedures';
import { ELENA, SUSANA } from '../support/procedure-view';

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/procedimientos',
  useSearchParams: () => new URLSearchParams(),
}));

// What each screen does is tested on its own; here, only who gets which one (spec 006, W2, W3, W5, W6).
vi.mock('@/components/procedures/ProcedureList', () => ({
  ProcedureList: () => <p>Lista de procedimientos</p>,
}));
vi.mock('@/components/procedures/ProcedureEditor', () => ({
  ProcedureEditor: () => <p>Editor del procedimiento</p>,
}));
vi.mock('@/components/procedures/ProcedureReadView', () => ({
  ProcedureReadView: () => <p>Ficha de solo lectura</p>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ['ADMIN', ANA],
  ['SUPERVISOR', SUSANA],
  ['EMPLOYEE', ELENA],
])('/procedimientos for a %s', (_role, session) => {
  test('has the title and the list', () => {
    mocks.useSession.mockReturnValue(session);

    render(<ProcedimientosPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Procedimientos' })).toBeInTheDocument();
    expect(screen.getByText('Lista de procedimientos')).toBeInTheDocument();
  });
});

describe('/procedimientos/[id]', () => {
  test('an ADMIN gets the editor', () => {
    mocks.useSession.mockReturnValue(ANA);

    render(<ProcedimientoPage />);

    expect(screen.getByText('Editor del procedimiento')).toBeInTheDocument();
    expect(screen.queryByText('Ficha de solo lectura')).not.toBeInTheDocument();
  });

  test.each([
    ['SUPERVISOR', SUSANA],
    ['EMPLOYEE', ELENA],
  ])('a %s gets the read-only sheet and never the editor', (_role, session) => {
    mocks.useSession.mockReturnValue(session);

    render(<ProcedimientoPage />);

    expect(screen.getByText('Ficha de solo lectura')).toBeInTheDocument();
    expect(screen.queryByText('Editor del procedimiento')).not.toBeInTheDocument();
  });
});
