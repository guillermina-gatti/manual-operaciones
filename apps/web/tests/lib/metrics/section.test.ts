import { describe, expect, test } from 'vitest';
import {
  keepMetricsSection,
  parseMetricsSection,
  withMetricsSection,
} from '@/lib/metrics/section';

describe('parseMetricsSection', () => {
  test('"documentos" opens the second tab; anything else, the first', () => {
    expect(parseMetricsSection('documentos')).toBe('documentos');
    expect(parseMetricsSection('procedimientos')).toBe('procedimientos');
    expect(parseMetricsSection(null)).toBe('procedimientos');
    expect(parseMetricsSection('otra')).toBe('procedimientos');
  });
});

describe('withMetricsSection', () => {
  test('adds the tab after the other parameters, before a #fragment', () => {
    expect(withMetricsSection('/metricas', 'documentos')).toBe('/metricas?seccion=documentos');
    expect(withMetricsSection('/metricas?desde=2026-11-01#x', 'procedimientos')).toBe(
      '/metricas?desde=2026-11-01&seccion=procedimientos#x',
    );
  });
});

describe('keepMetricsSection', () => {
  test('without the parameter, writes nothing', () => {
    expect(keepMetricsSection(null)('/metricas?desde=2026-11-01')).toBe('/metricas?desde=2026-11-01');
  });

  test('with it, keeps the tab; an unknown value becomes "procedimientos"', () => {
    expect(keepMetricsSection('documentos')('/metricas')).toBe('/metricas?seccion=documentos');
    expect(keepMetricsSection('otra')('/metricas')).toBe('/metricas?seccion=procedimientos');
  });
});
