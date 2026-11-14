// Texts of the assistant panel of /metricas (HU38), from the totals of GET /api/metrics/assistant.
// Pure. Small talk never counts here: it is not a question.
import type { AssistantMetrics } from './team-c-metrics';
import { formatCount } from './format';

type Totals = Pick<AssistantMetrics['totals'], 'questions' | 'answered' | 'aiUnavailable'>;

const questionsLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'pregunta' : 'preguntas'}`;

// The headline of the panel. Without questions the panel shows its empty state instead (null).
// - The AI was never available: "12 preguntas, y la IA no estuvo disponible para ninguna"
//   ("1 pregunta, y la IA no estuvo disponible").
// - Every question answered: "El asistente respondió las 12 preguntas" ("…la única pregunta").
// - Otherwise: "El asistente respondió 8 de 12 preguntas", plus ", y la IA no estuvo disponible
//   en 2" when that happened.
export function assistantHeadline({ questions, answered, aiUnavailable }: Totals): string | null {
  if (questions === 0) return null;
  if (aiUnavailable === questions) {
    return questions === 1
      ? '1 pregunta, y la IA no estuvo disponible'
      : `${questionsLabel(questions)}, y la IA no estuvo disponible para ninguna`;
  }
  if (answered === questions) {
    return questions === 1
      ? 'El asistente respondió la única pregunta'
      : `El asistente respondió las ${questionsLabel(questions)}`;
  }
  const unavailable =
    aiUnavailable > 0 ? `, y la IA no estuvo disponible en ${formatCount(aiUnavailable)}` : '';
  return `El asistente respondió ${formatCount(answered)} de ${questionsLabel(questions)}${unavailable}`;
}

// The words of the legend: "1 respondida", "14 sin información", "4 con contradicción",
// "6 IA no disponible".
export const answeredLabel = (count: number) =>
  `${formatCount(count)} ${count === 1 ? 'respondida' : 'respondidas'}`;
export const noInfoLabel = (count: number) => `${formatCount(count)} sin información`;
export const conflictLabel = (count: number) => `${formatCount(count)} con contradicción`;
export const aiUnavailableLabel = (count: number) => `${formatCount(count)} IA no disponible`;
