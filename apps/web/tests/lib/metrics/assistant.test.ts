import { describe, expect, test } from 'vitest';
import { answeredLabel, assistantHeadline } from '@/lib/metrics/assistant';

const totals = (questions: number, answered: number, aiUnavailable: number) => ({
  questions,
  answered,
  aiUnavailable,
});

describe('assistantHeadline', () => {
  test('without questions, nothing: the panel shows its empty state', () => {
    expect(assistantHeadline(totals(0, 0, 0))).toBeNull();
  });

  test('the AI was never available', () => {
    expect(assistantHeadline(totals(1250, 0, 1250))).toBe(
      '1.250 preguntas, y la IA no estuvo disponible para ninguna',
    );
    expect(assistantHeadline(totals(1, 0, 1))).toBe('1 pregunta, y la IA no estuvo disponible');
  });

  test('every question answered', () => {
    expect(assistantHeadline(totals(12, 12, 0))).toBe('El asistente respondió las 12 preguntas');
    expect(assistantHeadline(totals(1, 1, 0))).toBe('El asistente respondió la única pregunta');
  });

  test('some answered, with the AI not available in some or in none', () => {
    expect(assistantHeadline(totals(12, 8, 2))).toBe(
      'El asistente respondió 8 de 12 preguntas, y la IA no estuvo disponible en 2',
    );
    expect(assistantHeadline(totals(12, 8, 0))).toBe('El asistente respondió 8 de 12 preguntas');
    expect(assistantHeadline(totals(1, 0, 0))).toBe('El asistente respondió 0 de 1 pregunta');
  });
});

test('the legend in singular and plural', () => {
  expect(answeredLabel(1)).toBe('1 respondida');
  expect(answeredLabel(104)).toBe('104 respondidas');
});
