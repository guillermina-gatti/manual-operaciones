import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { AssistantMetricsCard } from '@/components/metrics/AssistantMetricsCard';
import { ApiError } from '@/lib/api';
import type { ApiResource } from '@/lib/api';
import type { AssistantMetrics } from '@/lib/metrics';
import type { PanelFilters } from '@/lib/metrics/filters';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const FILTERS: PanelFilters = { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' };
// Same shape as the API's AssistantMetricsResponse: if a web type drifts, this stops compiling.
const ASSISTANT: AssistantMetrics = {
  filters: { areaId: VENTAS, from: '2026-10-01', to: '2026-10-27' },
  totals: {
    questions: 1250,
    answered: 1100,
    noInfo: 120,
    conflict: 10,
    aiUnavailable: 20,
    smallTalk: 75,
    latencyP50Ms: 2400,
    latencyP95Ms: 850,
    inputTokens: 1_234_567,
    outputTokens: 98_765,
    feedback: { useful: 40, notUseful: 6 },
  },
};

const success = (data: AssistantMetrics): ApiResource<AssistantMetrics> => ({
  status: 'success',
  data,
  error: null,
  reload: vi.fn(),
});
const failure = (error: unknown, reload = vi.fn()): ApiResource<AssistantMetrics> => ({
  status: 'error',
  data: undefined,
  error,
  reload,
});

const card = () => screen.getByRole('region', { name: 'Asistente' });
const group = (name: string) => within(card()).getByRole('region', { name });
const terms = (name: string) =>
  within(group(name))
    .getAllByRole('term')
    .map((term) => term.textContent);
const totals = (values: Partial<AssistantMetrics['totals']>): AssistantMetrics => ({
  ...ASSISTANT,
  totals: { ...ASSISTANT.totals, ...values },
});
const headline = () => within(group('Consultas')).getByRole('heading').nextElementSibling;
const segments = () =>
  [...screen.getByTestId('outcome-bar').children].map((part) => part.getAttribute('data-part'));
const value = (label: string) => within(card()).getByText(label, { selector: 'dt' }).nextSibling;

describe('AssistantMetricsCard', () => {
  test('shows the loading state while the metrics arrive', () => {
    render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={{ status: 'loading', data: undefined, error: null, reload: vi.fn() }}
      />,
    );

    expect(screen.getByText('Cargando las métricas del asistente…')).toBeInTheDocument();
  });

  test('the panel: the period, three data and the four results in the legend', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(within(group('Consultas')).getByRole('heading')).toHaveTextContent(
      'Consultas · 1 oct – 27 oct',
    );
    expect(group('Consultas')).toHaveClass('bg-bosque');
    expect(terms('Consultas')).toEqual(['Preguntas', 'Respondidas', 'IA no disponible']);
    expect(value('Preguntas')).toHaveTextContent('1.250');
    expect(value('Respondidas')).toHaveTextContent('1.100');
    expect(value('IA no disponible')).toHaveTextContent('20');
    expect(
      within(screen.getByRole('list', { name: 'Preguntas por resultado' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1.100 respondidas', '120 sin información', '10 con contradicción', '20 IA no disponible']);
  });

  test('the bar: one part per result, of its share of the questions; a 0 is not drawn', () => {
    const { unmount } = render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);
    expect(segments()).toEqual(['answered', 'noInfo', 'conflict', 'aiUnavailable']);
    expect(screen.getByTestId('outcome-bar')).toHaveAttribute('aria-hidden', 'true');
    const widths = [...screen.getByTestId('outcome-bar').children].map(
      (part) => (part as HTMLElement).style.width,
    );
    expect(widths).toEqual(['88%', '9.6%', '0.8%', '1.6%']);
    unmount();

    render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 5, answered: 5, noInfo: 0, conflict: 0, aiUnavailable: 0 }))}
      />,
    );
    expect(segments()).toEqual(['answered']);
  });

  test('the headline: some answered, and the AI not available in some', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(headline()).toHaveTextContent(
      'El asistente respondió 1.100 de 1.250 preguntas, y la IA no estuvo disponible en 20',
    );
  });

  test('the headline: some answered, the AI always available', () => {
    render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 12, answered: 8, noInfo: 4, conflict: 0, aiUnavailable: 0 }))}
      />,
    );

    expect(headline()).toHaveTextContent(/^El asistente respondió 8 de 12 preguntas$/);
  });

  test('the headline: every question answered, plural and singular', () => {
    const { unmount } = render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 12, answered: 12, noInfo: 0, conflict: 0, aiUnavailable: 0 }))}
      />,
    );
    expect(headline()).toHaveTextContent('El asistente respondió las 12 preguntas');
    unmount();

    render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 1, answered: 1, noInfo: 0, conflict: 0, aiUnavailable: 0 }))}
      />,
    );
    expect(headline()).toHaveTextContent('El asistente respondió la única pregunta');
  });

  test('the headline: the AI was never available, plural and singular', () => {
    const { unmount } = render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 3, answered: 0, noInfo: 0, conflict: 0, aiUnavailable: 3 }))}
      />,
    );
    expect(headline()).toHaveTextContent('3 preguntas, y la IA no estuvo disponible para ninguna');
    unmount();

    render(
      <AssistantMetricsCard
        filters={FILTERS}
        state={success(totals({ questions: 1, answered: 0, noInfo: 0, conflict: 0, aiUnavailable: 1 }))}
      />,
    );
    expect(headline()).toHaveTextContent(/^1 pregunta, y la IA no estuvo disponible$/);
  });

  test('small talk goes apart and says it is left out of the other numbers', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(terms('Charla social')).toEqual(['Saludos y ayuda']);
    expect(value('Saludos y ayuda')).toHaveTextContent('75');
    expect(
      within(card()).getByText('No cuentan en las preguntas ni en los demás números.'),
    ).toBeInTheDocument();
  });

  test('latency, tokens and feedback', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(value('Mediana (p50)')).toHaveTextContent('2,4 s');
    expect(value('p95')).toHaveTextContent('850 ms');
    expect(value('De entrada')).toHaveTextContent('1.234.567');
    expect(value('De salida')).toHaveTextContent('98.765');
    expect(value('Útiles')).toHaveTextContent('40');
    expect(value('No útiles')).toHaveTextContent('6');
    // Useful in green, not useful in the alert tone; each one with its word.
    expect(within(value('Útiles') as HTMLElement).getByText('40')).toHaveClass('text-chip-area-texto');
    expect(within(value('No útiles') as HTMLElement).getByText('6')).toHaveClass('text-durazno-texto');
    expect(within(card()).queryByText('—')).not.toBeInTheDocument();
  });

  test('four cards under the panel', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    for (const name of ['Charla social', 'Latencia', 'Tokens', 'Valoraciones']) {
      expect(group(name)).toBeInTheDocument();
    }
  });

  test('without timed questions the latencies are "—"; zeros are 0', () => {
    const empty: AssistantMetrics = {
      ...ASSISTANT,
      totals: {
        questions: 0,
        answered: 0,
        noInfo: 0,
        conflict: 0,
        aiUnavailable: 0,
        smallTalk: 0,
        latencyP50Ms: null,
        latencyP95Ms: null,
        inputTokens: 0,
        outputTokens: 0,
        feedback: { useful: 0, notUseful: 0 },
      },
    };
    render(<AssistantMetricsCard filters={FILTERS} state={success(empty)} />);

    expect(value('Mediana (p50)')).toHaveTextContent('—');
    expect(value('p95')).toHaveTextContent('—');
    expect(within(value('p95') as HTMLElement).getByText('—')).toHaveClass('text-texto-suave');
    expect(within(card()).getByText('Sin respuestas medibles todavía')).toBeInTheDocument();
    expect(value('De entrada')).toHaveTextContent('0');
    // Without questions, the empty state: no bar and no data in the panel.
    expect(
      within(group('Consultas')).getByText('Nadie le preguntó al asistente en este período.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('outcome-bar')).not.toBeInTheDocument();
    expect(within(group('Consultas')).queryAllByRole('term')).toHaveLength(0);
  });

  test('says the area filter uses the current areas of who asked, and shows no cost', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(
      within(card()).getByText('El filtro por área usa las áreas actuales de quien preguntó.'),
    ).toBeInTheDocument();
    expect(card().textContent).not.toMatch(/costo|US\$|USD/i);
  });

  test('a plain card, without the dashed border of something still to come', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(card().className).not.toContain('border-dashed');
  });

  describe('errors, like the procedures ones', () => {
    test('403: only admins and supervisors, without retry', () => {
      render(<AssistantMetricsCard filters={FILTERS} state={failure(new ApiError(403))} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(
        'Solo los administradores y los supervisores pueden ver las métricas.',
      );
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });

    test('404: an area of someone else offers to see all of theirs', () => {
      render(<AssistantMetricsCard filters={FILTERS} state={failure(new ApiError(404))} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(
        'No tenés acceso a las métricas de esa área.',
      );
      expect(screen.getByRole('link', { name: 'Ver todas mis áreas' })).toHaveAttribute(
        'href',
        '/metricas?desde=2026-10-01&hasta=2026-10-27',
      );
    });

    test('503: the service is down, and retrying asks again', async () => {
      const user = userEvent.setup();
      const reload = vi.fn();
      render(<AssistantMetricsCard filters={FILTERS} state={failure(new ApiError(503), reload)} />);

      expect(within(card()).getByRole('alert')).toHaveTextContent(/El servicio no está disponible/);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
