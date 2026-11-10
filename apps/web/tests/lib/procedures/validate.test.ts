import { describe, expect, test } from 'vitest';
import { LIMITS, validateProcedure, validateStep } from '@/lib/procedures/validate';

describe('validateProcedure', () => {
  test('a title and no description is valid', () => {
    expect(validateProcedure({ title: 'Cierre de caja', description: '' })).toEqual({});
  });

  test.each(['', '   '])('a title that is empty or only spaces is not valid (%j)', (title) => {
    expect(validateProcedure({ title, description: '' })).toEqual({ title: 'Escribí un título.' });
  });

  test('the title can have 200 characters, not 201, without counting the spaces around', () => {
    expect(validateProcedure({ title: 'a'.repeat(LIMITS.procedureTitle), description: '' })).toEqual({});
    expect(validateProcedure({ title: `  ${'a'.repeat(LIMITS.procedureTitle)}  `, description: '' })).toEqual({});
    expect(validateProcedure({ title: 'a'.repeat(LIMITS.procedureTitle + 1), description: '' })).toEqual({
      title: 'El título puede tener hasta 200 caracteres.',
    });
  });

  test('the description can have 1000 characters, not 1001', () => {
    expect(validateProcedure({ title: 'X', description: 'a'.repeat(LIMITS.procedureDescription) })).toEqual({});
    expect(
      validateProcedure({ title: 'X', description: 'a'.repeat(LIMITS.procedureDescription + 1) }),
    ).toEqual({ description: 'La descripción puede tener hasta 1000 caracteres.' });
  });

  test('reports both fields at once', () => {
    expect(
      validateProcedure({ title: '', description: 'a'.repeat(LIMITS.procedureDescription + 1) }),
    ).toEqual({
      title: 'Escribí un título.',
      description: 'La descripción puede tener hasta 1000 caracteres.',
    });
  });
});

describe('validateStep', () => {
  test('a title and no description is valid', () => {
    expect(validateStep({ title: 'Contar el efectivo', description: '' })).toEqual({});
  });

  test('a title that is only spaces is not valid', () => {
    expect(validateStep({ title: '  ', description: '' })).toEqual({ title: 'Escribí un título.' });
  });

  test('the title can have 200 characters, not 201', () => {
    expect(validateStep({ title: 'a'.repeat(LIMITS.stepTitle), description: '' })).toEqual({});
    expect(validateStep({ title: 'a'.repeat(LIMITS.stepTitle + 1), description: '' })).toEqual({
      title: 'El título puede tener hasta 200 caracteres.',
    });
  });

  test('the description can have 2000 characters, not 2001', () => {
    expect(validateStep({ title: 'X', description: 'a'.repeat(LIMITS.stepDescription) })).toEqual({});
    expect(validateStep({ title: 'X', description: 'a'.repeat(LIMITS.stepDescription + 1) })).toEqual({
      description: 'La descripción puede tener hasta 2000 caracteres.',
    });
  });
});
