import { describe, expect, test } from 'vitest';
import {
  DOCUMENTS_HEADER,
  PROCEDURES_HEADER,
  buildCsv,
  csvCell,
  csvFileName,
  documentsAndAssistantCsv,
  exportedAtText,
  proceduresCsv,
} from '@/lib/metrics/csv';
import { CIERRE_DE_CAJA, OPERACIONES, VENTAS, metricsResponse } from '../../support/metrics';

const CONTEXT = {
  area: 'Todas las áreas',
  from: '2026-11-01',
  to: '2026-11-13',
  // 13/11/2026 15:04 in Buenos Aires.
  exportedAt: new Date('2026-11-13T18:04:00.000Z'),
};
const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n');

describe('csvCell', () => {
  test('numbers with a decimal comma and no thousands separator', () => {
    expect(csvCell(1234.5)).toBe('1234,5');
    expect(csvCell(12000)).toBe('12000');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(Number.NaN)).toBe('');
  });

  test('null is an empty cell', () => {
    expect(csvCell(null)).toBe('');
  });

  test('quotes only when needed, doubled inside', () => {
    expect(csvCell('Cierre de caja')).toBe('Cierre de caja');
    expect(csvCell('Caja; turno noche')).toBe('"Caja; turno noche"');
    expect(csvCell('El "manual"')).toBe('"El ""manual"""');
    expect(csvCell('dos\nlíneas')).toBe('"dos\nlíneas"');
  });

  test('a text that a spreadsheet would run as a formula gets an apostrophe', () => {
    expect(csvCell('=SUMA(A1:A2)')).toBe("'=SUMA(A1:A2)");
    expect(csvCell('+54 11')).toBe("'+54 11");
    expect(csvCell('-caja')).toBe("'-caja");
    expect(csvCell('@usuario')).toBe("'@usuario");
    expect(csvCell('\tcon tab')).toBe("'\tcon tab");
    // And still quoted when it needs it.
    expect(csvCell('=HYPERLINK("x";"y")')).toBe('"\'=HYPERLINK(""x"";""y"")"');
  });
});

describe('buildCsv', () => {
  test('UTF-8 BOM, ";" between cells and CRLF at the end of every line', () => {
    const csv = buildCsv([
      ['a', 1.5],
      ['b', null],
    ]);
    expect(csv).toBe('﻿a;1,5\r\nb;\r\n');
  });
});

describe('proceduresCsv', () => {
  const metrics = metricsResponse();
  const names = new Map([
    [VENTAS, 'Ventas'],
    [OPERACIONES, 'Operaciones'],
  ]);

  test('the context first, then an empty row and the header', () => {
    const [area, from, to, exported, empty, header] = lines(proceduresCsv(metrics, names, CONTEXT));
    expect([area, from, to, exported, empty]).toEqual([
      'Área;Todas las áreas',
      'Desde;2026-11-01',
      'Hasta;2026-11-13',
      'Exportado;2026-11-13 15:04',
      '',
    ]);
    expect(header).toBe(PROCEDURES_HEADER.join(';'));
    expect(header).toContain('tiempo_medio_segundos;tiempo_medio');
  });

  test('one row per procedure: the counts, the times in seconds and readable', () => {
    const csv = proceduresCsv(metrics, names, CONTEXT);
    const procedure = metrics.procedures.find((p) => p.procedureId === CIERRE_DE_CAJA)!;
    const row = lines(csv).find((line) => line.startsWith('Cierre de caja;'))!.split(';');
    const cell = (name: (typeof PROCEDURES_HEADER)[number]) => row[PROCEDURES_HEADER.indexOf(name)];
    expect(cell('area')).toBe('Ventas');
    expect(cell('ejecuciones')).toBe(String(procedure.started));
    expect(cell('completadas')).toBe(String(procedure.completed));
    expect(cell('en_curso')).toBe(String(procedure.inProgress));
    expect(cell('abandonadas')).toBe(String(procedure.abandoned));
    expect(cell('tiempo_medio_segundos')).toBe(String(Math.round(procedure.avgCompletionMs! / 1000)));
    expect(cell('tiempo_medio')).toMatch(/min|s|h/);
    expect(lines(csv)).toHaveLength(6 + metrics.procedures.length + 1);
  });

  test('a procedure without completed executions: empty cells, never "—" or 0', () => {
    const [base] = metrics.procedures;
    const none = {
      ...base,
      procedureId: '1a000000-0000-4000-8000-000000000099',
      title: 'Sin completadas',
      completed: 0,
      avgCompletionMs: null,
      minCompletionMs: null,
      maxCompletionMs: null,
      versions: [],
    };
    const csv = proceduresCsv({ ...metrics, procedures: [none] }, names, CONTEXT);
    const row = lines(csv)[6].split(';');
    expect(row.slice(6)).toEqual(['', '', '', '', '', '', '', '', '']);
  });

  test('an area the directory does not know goes by its id', () => {
    const csv = proceduresCsv(metrics, new Map(), CONTEXT);
    expect(lines(csv)[6]).toContain(VENTAS);
  });
});

describe('documentsAndAssistantCsv', () => {
  const documents = {
    filters: { areaId: null, from: '2026-11-01', to: '2026-11-13' },
    totals: { active: 42, upToDate: 33, dueSoon: 6, overdue: 3, processingFailed: 2, uploaded: 7 },
  };
  const assistant = {
    filters: { areaId: null, from: '2026-11-01', to: '2026-11-13' },
    totals: {
      questions: 128,
      answered: 104,
      noInfo: 14,
      conflict: 4,
      aiUnavailable: 6,
      smallTalk: 23,
      latencyP50Ms: 2400,
      latencyP95Ms: null,
      inputTokens: 184_000,
      outputTokens: 41_500,
      feedback: { useful: 37, notUseful: 5 },
    },
  };

  test('the counts of the documents and the numbers of the assistant', () => {
    const rows = lines(documentsAndAssistantCsv(documents, assistant, CONTEXT));
    expect(rows[5]).toBe(DOCUMENTS_HEADER.join(';'));
    expect(rows).toContain('Documentos;Vencidos;3;');
    expect(rows).toContain('Asistente;Preguntas;128;');
    // 104 / 128 = 81,25 % → one decimal.
    expect(rows).toContain('Asistente;Respondidas (%);81,3;');
    expect(rows).toContain('Asistente;Latencia mediana (p50)_segundos;2,4;2,4 s');
    // Nothing measured: empty, not "—".
    expect(rows).toContain('Asistente;Latencia p95_segundos;;');
    expect(rows).toContain('Asistente;Tokens de entrada;184000;');
  });

  test('a part that did not come is left out', () => {
    const csv = documentsAndAssistantCsv(null, assistant, CONTEXT);
    expect(csv).not.toContain('Documentos;');
    expect(csv).toContain('Asistente;Preguntas;128;');
  });
});

describe('the file name and the time of the export', () => {
  test('with the tab and the dates of the filter', () => {
    expect(csvFileName('procedimientos', '2026-11-01', '2026-11-13')).toBe(
      'metricas-procedimientos_2026-11-01_2026-11-13.csv',
    );
    expect(csvFileName('documentos', '2026-11-01', '2026-11-13')).toBe(
      'metricas-documentos-y-asistente_2026-11-01_2026-11-13.csv',
    );
  });

  test('the time in Argentina, whatever the zone of the browser', () => {
    expect(exportedAtText(new Date('2026-11-14T02:30:00.000Z'))).toBe('2026-11-13 23:30');
  });
});
