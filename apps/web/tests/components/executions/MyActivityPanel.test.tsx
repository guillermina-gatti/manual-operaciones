import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MyActivityPanel } from '@/components/executions/MyActivityPanel';
import { ApiError } from '@/lib/api';
import type { SessionState } from '@/lib/session';
import {
  CURRENT_EXECUTION,
  EMPTY_MY_METRICS,
  OPERACIONES,
  STALE_EXECUTION,
  VENTAS,
  myMetricsResponse,
} from '../../support/my-metrics';

// A whole mount (filters, tiles, lists) looked up by role is slow in jsdom; as in MetricsPanel.
vi.setConfig({ testTimeout: 15_000 });

const mocks = vi.hoisted(() => ({
  getMyMetrics: vi.fn(),
  useSession: vi.fn(),
  listAreas: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getMyMetrics: mocks.getMyMetrics,
}));

vi.mock('@/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session')>()),
  useSession: mocks.useSession,
}));

vi.mock('@/lib/directory', () => ({
  areasDirectory: { listAreas: mocks.listAreas },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => '/ejecuciones/mi-actividad',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const ELENA: SessionState = {
  user: {
    id: '0b000000-0000-4000-8000-000000000003',
    name: 'Elena Empleada de Ventas',
    role: 'EMPLOYEE',
  },
  status: 'ready',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked: "today" is 27/10/2026 in Buenos Aires, and timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T15:00:00.000Z'));
  mocks.searchParams = new URLSearchParams();
  mocks.useSession.mockReturnValue(ELENA);
  mocks.getMyMetrics.mockResolvedValue(myMetricsResponse());
  mocks.listAreas.mockResolvedValue([
    { id: VENTAS, name: 'Ventas' },
    { id: OPERACIONES, name: 'Operaciones' },
    { id: '0a000000-0000-4000-8000-000000000003', name: 'Compras' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

const summary = () => screen.getByRole('region', { name: 'Tu resumen' });
// The answer arrived: the tiles are there.
const loaded = () => screen.findByText('Empezadas', { selector: 'dt' });
// A datum of the summary: the value (dd) next to its label (dt).
const datum = (label: RegExp) =>
  within(summary())
    .getAllByRole('term')
    .find((term) => label.test(term.textContent ?? ''))!.nextElementSibling!.textContent;
// Opens the area selector and reads the name of each option (without its hint).
async function areaOptionTexts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Área/ }));
  return within(screen.getByRole('listbox', { name: 'Área' }))
    .getAllByRole('option')
    .map((option) => option.querySelector('span:not([class*="text-sm"])')?.textContent);
}

describe('filters', () => {
  test('without filters in the address asks for this month of all their areas', async () => {
    render(<MyActivityPanel />);

    await loaded();
    expect(mocks.getMyMetrics).toHaveBeenCalledWith(
      { areaId: null, from: '2026-10-01', to: '2026-10-27' },
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
  });

  test('the filters of the address are the ones asked for', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-10&hasta=2026-10-20`);
    render(<MyActivityPanel />);

    await loaded();
    expect(mocks.getMyMetrics).toHaveBeenCalledWith(
      { areaId: VENTAS, from: '2026-10-10', to: '2026-10-20' },
      expect.any(AbortSignal),
    );
  });

  test('the area selector offers only their areas, and applying stays on this page', async () => {
    const user = userEvent.setup();
    render(<MyActivityPanel />);
    await loaded();

    expect(await areaOptionTexts(user)).toEqual(['Todas mis áreas', 'Ventas', 'Operaciones']);

    await user.click(screen.getByRole('option', { name: /^Ventas/ }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/ejecuciones/mi-actividad?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );
  });
});

describe('session', () => {
  test('never asks for the activity without a session', () => {
    mocks.useSession.mockReturnValue({ user: null, status: 'ready' });
    render(<MyActivityPanel />);

    expect(mocks.getMyMetrics).not.toHaveBeenCalled();
  });

  test('switching the test user asks again, for the new one', async () => {
    const { rerender } = render(<MyActivityPanel />);
    await loaded();

    mocks.useSession.mockReturnValue({
      user: { id: '0b000000-0000-4000-8000-000000000099', name: 'Otra Empleada', role: 'EMPLOYEE' },
      status: 'ready',
    });
    rerender(<MyActivityPanel />);

    await waitFor(() => expect(mocks.getMyMetrics).toHaveBeenCalledTimes(2));
  });
});

describe('summary', () => {
  test('the hero: the ring, the headline, the legend and their data', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(within(summary()).getByRole('img', { name: '60,0 % completadas' })).toBeInTheDocument();
    expect(
      within(summary()).getByText('Terminaste 3 de los 5 recorridos que empezaste'),
    ).toBeInTheDocument();
    expect(within(summary()).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Tu resumen · 1 oct – 27 oct',
    );
    expect(datum(/^Empezadas$/)).toBe('5');
    expect(datum(/^En curso$/)).toBe('1');
    expect(datum(/^Tiempo medio/)).toBe('10 min');
    // The note stays under the panel.
    expect(screen.getByText(/^En curso: con avance en las últimas 24 h\./)).toBeInTheDocument();
  });

  test('says "Sin avanzar hace más de 24 h", never "abandonadas"', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(datum(/Sin avanzar hace más de 24 h/)).toBe('1');
    expect(screen.queryByText(/abandonad/i)).not.toBeInTheDocument();
  });

  test('nor in what a screen reader says: labels, descriptions, titles', async () => {
    const { container } = render(<MyActivityPanel />);
    await loaded();
    // The three sections are on screen, with an execution without progress for 24 h.
    screen.getByRole('region', { name: 'Para retomar' });
    screen.getByRole('table', { name: 'Tus procedimientos recientes' });

    const said = [...container.querySelectorAll('*')].flatMap((element) =>
      ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'alt']
        .map((name) => element.getAttribute(name))
        .filter((value): value is string => value !== null),
    );
    expect(said.join(' ')).not.toMatch(/abandon/i);
    // Text hidden from sight but read aloud (sr-only) is in textContent too.
    expect(container.textContent).not.toMatch(/abandon/i);
  });

  test('a period without executions says so', async () => {
    mocks.getMyMetrics.mockResolvedValue(EMPTY_MY_METRICS);
    render(<MyActivityPanel />);

    expect(
      await screen.findByText('No empezaste procedimientos en este período.'),
    ).toBeInTheDocument();
  });

  test('shows the loading state while the answer arrives', () => {
    mocks.getMyMetrics.mockReturnValue(new Promise(() => {}));
    render(<MyActivityPanel />);

    expect(screen.getAllByText('Cargando tu actividad…').length).toBeGreaterThan(0);
  });
});

describe('errors', () => {
  test('an area that is not theirs offers to see all of them', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    mocks.getMyMetrics.mockImplementation(async (filters: { areaId?: string | null }) => {
      if (filters.areaId) throw new ApiError(404, ['No se encontró el área']);
      return myMetricsResponse();
    });
    render(<MyActivityPanel />);

    expect(await screen.findByText('No encontramos esa área entre las tuyas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas mis áreas' })).toHaveAttribute(
      'href',
      '/ejecuciones/mi-actividad?desde=2026-10-01&hasta=2026-10-27',
    );
    expect(screen.queryByText('No se encontró el área')).not.toBeInTheDocument();
  });

  test.each([
    [400, 'Revisá las fechas y el área elegidas.'],
    [401, 'Tu sesión no es válida. Volvé a ingresar.'],
    [403, 'Solo los empleados pueden ver su actividad.'],
  ])('%i says why, without retry', async (status, message) => {
    mocks.getMyMetrics.mockRejectedValue(new ApiError(status));
    render(<MyActivityPanel />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  test('with an error, neither the list to resume nor the table', async () => {
    mocks.getMyMetrics.mockRejectedValue(new ApiError(503));
    render(<MyActivityPanel />);

    await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.queryByRole('region', { name: 'Para retomar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('without the area names the selector still offers "Todas mis áreas"', async () => {
    const user = userEvent.setup();
    mocks.listAreas.mockRejectedValue(new Error('down'));
    render(<MyActivityPanel />);

    await loaded();
    await waitFor(() => expect(mocks.listAreas).toHaveBeenCalled());
    expect(await areaOptionTexts(user)).toEqual(['Todas mis áreas']);
  });

  test('the service down can be retried', async () => {
    const user = userEvent.setup();
    mocks.getMyMetrics.mockRejectedValueOnce(new ApiError(503));
    render(<MyActivityPanel />);

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await loaded()).toBeInTheDocument();
    expect(mocks.getMyMetrics).toHaveBeenCalledTimes(2);
  });
});

describe('to resume', () => {
  const resume = () => screen.getByRole('region', { name: 'Para retomar' });
  const card = (name: string) =>
    within(resume()).getByRole('heading', { name }).closest('li')!;

  test('each execution in progress with its step, its last move and a link to resume it', async () => {
    render(<MyActivityPanel />);
    await loaded();

    const cierre = card('Cierre de caja');
    expect(cierre).toHaveTextContent('Paso 2 de 4: Comparar con el reporte');
    // How long ago, with the date and time in the tooltip.
    expect(cierre).toHaveTextContent('Último avance: hace 1 h 55 min');
    expect(within(cierre).getByText('hace 1 h 55 min')).toHaveAttribute(
      'title',
      '27 oct 2026, 10:05',
    );
    expect(within(cierre).getByText('En curso')).toBeInTheDocument();
    expect(within(cierre).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      `/ejecuciones/${CURRENT_EXECUTION}`,
    );
  });

  test('a title from the API names the card and the row, instead of the sample name', async () => {
    const answer = myMetricsResponse();
    mocks.getMyMetrics.mockResolvedValue({
      ...answer,
      resume: answer.resume.map((item, i) => (i === 0 ? { ...item, procedureTitle: 'Arqueo de caja' } : item)),
      procedures: answer.procedures.map((p, i) => (i === 0 ? { ...p, title: 'Arqueo de caja' } : p)),
    });
    render(<MyActivityPanel />);
    await loaded();

    expect(within(resume()).getByRole('heading', { name: 'Arqueo de caja' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: 'Tus procedimientos recientes' })).getAllByRole(
        'rowheader',
      )[0],
    ).toHaveTextContent('Arqueo de caja');
  });

  test('the most recently moved first', async () => {
    render(<MyActivityPanel />);
    await loaded();

    const names = within(resume())
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(['Cierre de caja', 'Recepción de mercadería']);
  });

  test('one without progress for more than 24 h says so with its text', async () => {
    render(<MyActivityPanel />);
    await loaded();

    const recepcion = card('Recepción de mercadería');
    expect(within(recepcion).getByText('Sin avanzar hace más de 24 h')).toBeInTheDocument();
    expect(within(recepcion).getByRole('link', { name: 'Continuar' })).toHaveAttribute(
      'href',
      `/ejecuciones/${STALE_EXECUTION}`,
    );
  });

  test('the section is "para-retomar", named by its heading, for the link of /ejecuciones', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(resume()).toHaveAttribute('id', 'para-retomar');
    expect(resume()).toHaveClass('scroll-mt-6');
  });

  test('entering with #para-retomar goes down to it once the list arrives', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, '', '/ejecuciones/mi-actividad#para-retomar');
    try {
      render(<MyActivityPanel />);
      await loaded();

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
      expect(scrollIntoView.mock.contexts[0]).toBe(resume());
    } finally {
      window.history.replaceState(null, '', '/');
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  test('without the hash it stays at the top', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<MyActivityPanel />);
      await loaded();

      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  test('the link says which procedure it opens', async () => {
    render(<MyActivityPanel />);
    await loaded();

    const links = within(resume()).getAllByRole('link', { name: 'Continuar' });
    expect(links[0]).toHaveAccessibleDescription('Cierre de caja');
    expect(links[1]).toHaveAccessibleDescription('Recepción de mercadería');
  });

  test('shown even when the period has no executions: it does not depend on the dates', async () => {
    mocks.getMyMetrics.mockResolvedValue({ ...EMPTY_MY_METRICS, resume: myMetricsResponse().resume });
    render(<MyActivityPanel />);

    await screen.findByText('No empezaste procedimientos en este período.');
    expect(within(resume()).getAllByRole('listitem')).toHaveLength(2);
  });

  test('without executions to resume, says so', async () => {
    mocks.getMyMetrics.mockResolvedValue(EMPTY_MY_METRICS);
    render(<MyActivityPanel />);

    expect(await screen.findByText('No tenés ejecuciones sin terminar.')).toBeInTheDocument();
  });
});

describe('to resume: the two views (?vista=), as the picker', () => {
  const resume = () => screen.getByRole('region', { name: 'Para retomar' });
  const viewButton = (name: 'Lista' | 'Tarjetas') =>
    within(within(resume()).getByRole('group', { name: 'Vista' })).getByRole('button', {
      name: `Ver como ${name}`,
    });
  const items = () => [...resume().querySelectorAll('li')];

  beforeEach(() => {
    mocks.listAreas.mockResolvedValue([
      { id: VENTAS, name: 'Ventas', isActive: true },
      { id: OPERACIONES, name: 'Operaciones', isActive: true },
    ]);
  });

  test('Tarjetas by default: areas and steps, the state on the right, step, time and "Continuar" at the foot', async () => {
    render(<MyActivityPanel />);
    await loaded();
    await within(resume()).findAllByText('Ventas');

    expect(viewButton('Tarjetas')).toHaveAttribute('aria-pressed', 'true');
    const [cierre, recepcion] = items();
    const [meta, title, body, link] = [...cierre.children];
    expect(meta).toHaveClass('min-h-7');
    expect(meta.firstElementChild).toHaveTextContent('Áreas: Ventas4 pasos');
    expect(meta.lastElementChild).toHaveTextContent('En curso');
    expect(title).toHaveTextContent('Cierre de caja');
    expect(body).toHaveTextContent('Paso 2 de 4: Comparar con el reporte');
    expect(body).toHaveTextContent('Último avance: hace 1 h 55 min');
    expect(link).toHaveAccessibleName('Continuar');
    expect(link).toHaveClass('mt-auto');
    // The stale one: the same places, with its own state.
    expect(recepcion.firstElementChild!.firstElementChild).toHaveTextContent('Áreas: Operaciones');
    expect(recepcion.firstElementChild!.lastElementChild).toHaveTextContent(
      'Sin avanzar hace más de 24 h',
    );
    expect(cierre.parentElement).toHaveClass('md:auto-rows-fr');
  });

  test('choosing Lista keeps the filters of the address', async () => {
    mocks.searchParams = new URLSearchParams('desde=2026-10-01&hasta=2026-10-27');
    render(<MyActivityPanel />);
    await loaded();

    await userEvent.click(viewButton('Lista'));

    expect(mocks.replace).toHaveBeenCalledWith(
      '/ejecuciones/mi-actividad?desde=2026-10-01&hasta=2026-10-27&vista=lista',
      { scroll: false },
    );
  });

  test('a filter applied in Lista keeps vista=lista', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('vista=lista');
    render(<MyActivityPanel />);
    await loaded();

    await areaOptionTexts(user);
    await user.click(screen.getByRole('option', { name: /^Ventas/ }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      `/ejecuciones/mi-actividad?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27&vista=lista`,
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/ejecuciones/mi-actividad?vista=lista');
  });

  test('without ?vista=, a filter writes no view', async () => {
    const user = userEvent.setup();
    render(<MyActivityPanel />);
    await loaded();

    await areaOptionTexts(user);
    await user.click(screen.getByRole('option', { name: /^Ventas/ }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      `/ejecuciones/mi-actividad?area=${VENTAS}&desde=2026-10-01&hasta=2026-10-27`,
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/ejecuciones/mi-actividad');
  });

  test('Lista: the header and four columns per row, with the state and the time together', async () => {
    mocks.searchParams = new URLSearchParams('vista=lista');
    render(<MyActivityPanel />);
    await loaded();
    await within(resume()).findAllByText('Ventas');

    expect(viewButton('Lista')).toHaveAttribute('aria-pressed', 'true');
    const header = resume().querySelector('[aria-hidden="true"].md\\:grid')!;
    expect([...header.children].map((cell) => cell.textContent)).toEqual([
      'Procedimiento',
      'Área y pasos',
      'Estado',
      '',
    ]);
    const [cierre] = items();
    expect(cierre.children).toHaveLength(4);
    expect(cierre.children[0]).toHaveTextContent('Cierre de cajaPaso 2 de 4: Comparar con el reporte');
    expect(cierre.children[1]).toHaveTextContent('Áreas: Ventas4 pasos');
    expect(cierre.children[2]).toHaveTextContent('En cursoÚltimo avance: hace 1 h 55 min');
    expect(cierre.children[3]).toHaveAccessibleName('Continuar');
    expect(cierre.children[3]).toHaveAttribute('href', `/ejecuciones/${CURRENT_EXECUTION}`);
  });

  test('the anchor still works in Lista', async () => {
    mocks.searchParams = new URLSearchParams('vista=lista');
    render(<MyActivityPanel />);
    await loaded();

    expect(resume()).toHaveAttribute('id', 'para-retomar');
  });

  test('a procedure the period does not have: no chip, only its steps', async () => {
    const answer = myMetricsResponse();
    mocks.getMyMetrics.mockResolvedValue({ ...answer, procedures: [] });
    render(<MyActivityPanel />);
    await loaded();

    const meta = items()[0].firstElementChild!;
    expect(meta.firstElementChild).toHaveTextContent(/^4 pasos$/);
  });

  test('without executions to resume, no switch', async () => {
    mocks.getMyMetrics.mockResolvedValue({ ...myMetricsResponse(), resume: [] });
    render(<MyActivityPanel />);
    await loaded();

    expect(within(resume()).queryByRole('group', { name: 'Vista' })).not.toBeInTheDocument();
  });
});

describe('recent procedures', () => {
  const table = () => screen.getByRole('table', { name: 'Tus procedimientos recientes' });
  const rowOf = (name: string) =>
    within(table()).getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;
  const cells = (name: string) =>
    within(rowOf(name))
      .getAllByRole('cell')
      .map((cell) => cell.textContent);

  test('the most recently started first, with its area chips', async () => {
    render(<MyActivityPanel />);
    await loaded();
    await within(table()).findByText('Ventas');

    const names = within(table())
      .getAllByRole('rowheader')
      .map((header) => header.textContent);
    expect(names).toEqual(['Cierre de cajaVentas', 'Recepción de mercaderíaOperaciones']);
  });

  test('their counts, their average time, their slowest step and the last start', async () => {
    render(<MyActivityPanel />);
    await loaded();

    // The words the card adds on the phone ("completadas", "Tiempo medio"…) are in the DOM too.
    expect(cells('Cierre de caja')).toEqual([
      '4',
      '3 de 4 completadas',
      'Sin avanzar +24 hSin avanzar hace más de 24 horas0',
      'Tiempo medio10 min',
      'Se traba en: Paso 2: Comparar con el reporte4 min',
      'Última vez: 27 oct 2026, 09:50',
    ]);
  });

  test('without completed ones or finished steps, a dash', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(cells('Recepción de mercadería')).toEqual([
      '1',
      '0 de 1 completadas',
      'Sin avanzar +24 hSin avanzar hace más de 24 horas1',
      'Tiempo medio—',
      'Se traba en: —',
      'Última vez: 25 oct 2026, 11:00',
    ]);
  });

  test('the column says "Sin avanzar hace más de 24 horas", never "abandonadas"', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(
      within(table()).getByRole('columnheader', { name: 'Sin avanzar hace más de 24 horas' }),
    ).toBeInTheDocument();
  });

  test('without procedures in the period, no table', async () => {
    mocks.getMyMetrics.mockResolvedValue(EMPTY_MY_METRICS);
    render(<MyActivityPanel />);

    await screen.findByText('No empezaste procedimientos en este período.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('the order and "Para retomar" without filters', () => {
  test('to resume first, then the filters, the summary and the procedures', async () => {
    render(<MyActivityPanel />);
    await loaded();

    const blocks = [
      screen.getByRole('region', { name: 'Para retomar' }),
      screen.getByRole('form', { name: 'Filtros' }),
      summary(),
      screen.getByRole('table', { name: 'Tus procedimientos recientes' }),
    ];
    for (let i = 1; i < blocks.length; i++) {
      expect(
        blocks[i - 1].compareDocumentPosition(blocks[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  test('says it shows every execution in progress, whatever the period', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(
      within(screen.getByRole('region', { name: 'Para retomar' })).getByText(
        'Todas tus ejecuciones en curso, sin importar el período.',
      ),
    ).toBeInTheDocument();
  });

  test('without an area, one request serves both', async () => {
    render(<MyActivityPanel />);
    await loaded();

    expect(mocks.getMyMetrics).toHaveBeenCalledTimes(1);
  });

  test('with an area, "Para retomar" comes from an answer without it', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}&desde=2026-10-10&hasta=2026-10-20`);
    // Only Ventas: the filtered answer leaves out the execution of Operaciones.
    mocks.getMyMetrics.mockImplementation(async (filters: { areaId?: string | null }) =>
      filters.areaId
        ? myMetricsResponse({ resume: myMetricsResponse().resume.slice(0, 1) })
        : myMetricsResponse(),
    );
    render(<MyActivityPanel />);
    await loaded();

    expect(mocks.getMyMetrics).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    const resume = screen.getByRole('region', { name: 'Para retomar' });
    await within(resume).findByRole('heading', { name: 'Recepción de mercadería' });
    expect(within(resume).getByRole('heading', { name: 'Cierre de caja' })).toBeInTheDocument();
  });

  test('with an area, "Para retomar" stays even if the area is not theirs', async () => {
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    mocks.getMyMetrics.mockImplementation(async (filters: { areaId?: string | null }) => {
      if (filters.areaId) throw new ApiError(404, ['No se encontró el área']);
      return myMetricsResponse();
    });
    render(<MyActivityPanel />);

    const resume = await screen.findByRole('region', { name: 'Para retomar' });
    expect(await within(resume).findAllByRole('link', { name: /Continuar/ })).toHaveLength(2);
  });

  test('with an area, if the executions in progress cannot be read, the section says so', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(`area=${VENTAS}`);
    mocks.getMyMetrics.mockImplementation(async (filters: { areaId?: string | null }) => {
      if (!filters.areaId) throw new ApiError(503);
      return myMetricsResponse();
    });
    render(<MyActivityPanel />);
    await loaded();

    const resume = screen.getByRole('region', { name: 'Para retomar' });
    await user.click(await within(resume).findByRole('button', { name: 'Reintentar' }));
    expect(
      mocks.getMyMetrics.mock.calls.filter(([filters]) => !(filters as { areaId?: string }).areaId),
    ).toHaveLength(2);
  });

  test('while they arrive, the section is there with its skeleton', () => {
    mocks.getMyMetrics.mockReturnValue(new Promise(() => {}));
    render(<MyActivityPanel />);

    expect(
      within(screen.getByRole('region', { name: 'Para retomar' })).getByText(
        'Cargando tus ejecuciones en curso…',
      ),
    ).toBeInTheDocument();
  });
});
