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

const card = () => screen.getByRole('article', { name: 'Asistente' });
const group = (name: string) => within(card()).getByRole('region', { name });
const terms = (name: string) =>
  within(group(name))
    .getAllByRole('term')
    .map((term) => term.textContent);
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

  test('the questions and the four results, each apart', () => {
    render(<AssistantMetricsCard filters={FILTERS} state={success(ASSISTANT)} />);

    expect(terms('Consultas')).toEqual([
      'Preguntas',
      'Respondidas',
      'Sin información',
      'Con contradicción',
      'IA no disponible',
    ]);
    expect(value('Preguntas')).toHaveTextContent('1.250');
    expect(value('Respondidas')).toHaveTextContent('1.100');
    expect(value('Sin información')).toHaveTextContent('120');
    expect(value('Con contradicción')).toHaveTextContent('10');
    expect(value('IA no disponible')).toHaveTextContent('20');
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
    expect(value('Preguntas')).toHaveTextContent('0');
    expect(value('De entrada')).toHaveTextContent('0');
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
