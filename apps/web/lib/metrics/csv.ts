// "Exportar CSV" of /metricas (HU38): what the open tab shows, with the filters applied, as a file
// Excel in Spanish opens right. Pure: the panel builds it and the browser downloads it.
//
// The format: ";" between cells, a decimal comma, UTF-8 with BOM, CRLF line ends, double quotes
// around a cell that needs them (doubled inside). The durations go twice: in seconds, as numbers,
// in a column "…_segundos", and as the screen writes them. A text that starts with =, +, -, @, a tab
// or a carriage return gets an apostrophe first, so a spreadsheet never runs it as a formula.
import type { ProceduresMetricsResponse } from '@/lib/api';
import { formatDuration } from '@/lib/executions/format';
import { COMPANY_TIME_ZONE } from '@/lib/documents/format';
import type { AssistantMetrics, DocumentMetrics } from './team-c-metrics';
import { formatLatency } from './format';
import { metricsProcedureName } from './procedure-name';
import { procedureTimeRows } from './procedure-time';
import type { MetricsSection } from './section';

export type CsvValue = string | number | null;

const BOM = '﻿';
const SEPARATOR = ';';
const LINE_END = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

// A number with a decimal comma and without thousands separator, so Excel reads it as a number:
// 1234.5 → "1234,5". Not a finite number: empty.
function numberCell(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

export function csvCell(value: CsvValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return numberCell(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(rows: readonly (readonly CsvValue[])[]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(SEPARATOR)).join(LINE_END) + LINE_END;
}

// Whole seconds, as numbers; null without a time.
export const seconds = (ms: number | null): number | null =>
  ms === null || !Number.isFinite(ms) ? null : Math.round(ms / 1000);

// One decimal at most: 0.8333 → 83.3 (written "83,3").
const percent = (rate: number | null): number | null =>
  rate === null || !Number.isFinite(rate) ? null : Math.round(rate * 1000) / 10;

export interface CsvContext {
  // "Todas las áreas", "Todas mis áreas" or the name of the area.
  area: string;
  from: string;
  to: string;
  exportedAt: Date;
}

const exportedFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: COMPANY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "2026-11-13 15:04", in Argentina.
export function exportedAtText(date: Date): string {
  return exportedFormat.format(date).replace(', ', ' ');
}

// The first rows: what was exported, then an empty row before the data.
function contextRows({ area, from, to, exportedAt }: CsvContext): CsvValue[][] {
  return [
    ['Área', area],
    ['Desde', from],
    ['Hasta', to],
    ['Exportado', exportedAtText(exportedAt)],
    [],
  ];
}

export const PROCEDURES_HEADER = [
  'procedimiento',
  'area',
  'ejecuciones',
  'completadas',
  'en_curso',
  'abandonadas',
  'tiempo_medio_segundos',
  'tiempo_medio',
  'mas_rapida_segundos',
  'mas_rapida',
  'mas_lenta_segundos',
  'mas_lenta',
  'paso_que_mas_tarda',
  'paso_que_mas_tarda_segundos',
  'paso_que_mas_tarda_tiempo',
] as const;

const readable = (ms: number | null) => (ms === null ? null : formatDuration(ms));

// One row per procedure, in the order of "Tiempo por procedimiento" (slowest average first). The
// areas by name, the ones the directory does not know by their id.
export function proceduresCsv(
  metrics: ProceduresMetricsResponse,
  areaNames: ReadonlyMap<string, string>,
  context: CsvContext,
): string {
  const byId = new Map(metrics.procedures.map((procedure) => [procedure.procedureId, procedure]));
  const rows = procedureTimeRows(metrics.procedures).map((row): CsvValue[] => {
    const procedure = byId.get(row.procedureId)!;
    return [
      metricsProcedureName(row.procedureId, row.title),
      row.areaIds.map((id) => areaNames.get(id) ?? id).join(', '),
      procedure.started,
      procedure.completed,
      procedure.inProgress,
      procedure.abandoned,
      seconds(row.avgCompletionMs),
      readable(row.avgCompletionMs),
      seconds(row.minCompletionMs),
      readable(row.minCompletionMs),
      seconds(row.maxCompletionMs),
      readable(row.maxCompletionMs),
      row.slowestStep?.title ?? null,
      seconds(row.slowestStep?.avgDurationMs ?? null),
      readable(row.slowestStep?.avgDurationMs ?? null),
    ];
  });
  return buildCsv([...contextRows(context), [...PROCEDURES_HEADER], ...rows]);
}

export const DOCUMENTS_HEADER = ['seccion', 'dato', 'valor', 'valor_legible'] as const;

// The state of the documents and the numbers of the assistant, one per row. A part that did not
// come is left out.
export function documentsAndAssistantCsv(
  documents: DocumentMetrics | null,
  assistant: AssistantMetrics | null,
  context: CsvContext,
): string {
  const rows: CsvValue[][] = [];
  if (documents) {
    const { totals } = documents;
    rows.push(
      ['Documentos', 'Activos', totals.active, null],
      ['Documentos', 'Al día', totals.upToDate, null],
      ['Documentos', 'Vencen pronto', totals.dueSoon, null],
      ['Documentos', 'Vencidos', totals.overdue, null],
      ['Documentos', 'Con error de procesamiento', totals.processingFailed, null],
      ['Documentos', 'Cargados en el período', totals.uploaded, null],
    );
  }
  if (assistant) {
    const { totals } = assistant;
    const latencySeconds = (ms: number | null) =>
      ms === null || !Number.isFinite(ms) ? null : Math.round(ms / 100) / 10;
    rows.push(
      ['Asistente', 'Preguntas', totals.questions, null],
      ['Asistente', 'Respondidas', totals.answered, null],
      ['Asistente', 'Sin información', totals.noInfo, null],
      ['Asistente', 'Con contradicción', totals.conflict, null],
      ['Asistente', 'IA no disponible', totals.aiUnavailable, null],
      [
        'Asistente',
        'Respondidas (%)',
        percent(totals.questions === 0 ? null : totals.answered / totals.questions),
        null,
      ],
      ['Asistente', 'Charla social', totals.smallTalk, null],
      [
        'Asistente',
        'Latencia mediana (p50)_segundos',
        latencySeconds(totals.latencyP50Ms),
        totals.latencyP50Ms === null ? null : formatLatency(totals.latencyP50Ms),
      ],
      [
        'Asistente',
        'Latencia p95_segundos',
        latencySeconds(totals.latencyP95Ms),
        totals.latencyP95Ms === null ? null : formatLatency(totals.latencyP95Ms),
      ],
      ['Asistente', 'Tokens de entrada', totals.inputTokens, null],
      ['Asistente', 'Tokens de salida', totals.outputTokens, null],
      ['Asistente', 'Valoraciones útiles', totals.feedback.useful, null],
      ['Asistente', 'Valoraciones no útiles', totals.feedback.notUseful, null],
    );
  }
  return buildCsv([...contextRows(context), [...DOCUMENTS_HEADER], ...rows]);
}

const FILE_SECTION: Record<MetricsSection, string> = {
  procedimientos: 'procedimientos',
  documentos: 'documentos-y-asistente',
};

// metricas-procedimientos_2026-11-01_2026-11-13.csv
export function csvFileName(section: MetricsSection, from: string, to: string): string {
  return `metricas-${FILE_SECTION[section]}_${from}_${to}.csv`;
}
