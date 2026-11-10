import { describe, expect, test } from 'vitest';
import { CHANGE_SUMMARY_MAX, validateChangeSummary } from '@/lib/procedures/change-summary';

describe('validateChangeSummary (spec 015, R5)', () => {
  test('a summary of 1 to 300 characters is valid', () => {
    expect(validateChangeSummary('Cambia el límite de caja')).toBeNull();
    expect(validateChangeSummary('a'.repeat(CHANGE_SUMMARY_MAX))).toBeNull();
  });

  test.each([
    ['empty', ''],
    ['only spaces', '    '],
  ])('%s asks for the summary', (_case, text) => {
    expect(validateChangeSummary(text)).toBe('Escribí un resumen del cambio.');
  });

  test('the spaces around the text are not counted', () => {
    expect(validateChangeSummary(`  ${'a'.repeat(CHANGE_SUMMARY_MAX)}  `)).toBeNull();
  });

  test('more than 300 characters says the limit', () => {
    expect(validateChangeSummary('a'.repeat(CHANGE_SUMMARY_MAX + 1))).toBe(
      'El resumen puede tener hasta 300 caracteres.',
    );
  });

  test('the limit is the one of the API', () => {
    expect(CHANGE_SUMMARY_MAX).toBe(300);
  });
});
