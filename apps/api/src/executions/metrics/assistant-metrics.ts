/* The assistant metrics (HU38, contract 5): what the chat recorded about each question,
added up for the panel. Only counts, times and tokens: no question text, answer or user */

// One row of totals, as the database adds it up (prisma-assistant-metrics.repository.ts).
// Small talk is already left out of every field but smallTalk.
export interface AssistantAggregate {
  answered: number;
  noInfo: number;
  conflict: number;
  aiUnavailable: number;
  smallTalk: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  inputTokens: number;
  outputTokens: number;
  useful: number;
  notUseful: number;
}

export interface AssistantTotals {
  questions: number; // = answered + noInfo + conflict + aiUnavailable
  answered: number;
  noInfo: number;
  conflict: number;
  aiUnavailable: number;
  smallTalk: number; // greetings and platform help: not a question to the documents
  latencyP50Ms: number | null; // null without any answered, no-info or conflict question
  latencyP95Ms: number | null;
  inputTokens: number;
  outputTokens: number;
  feedback: { useful: number; notUseful: number };
}

// questions is the sum of the four results, so it can never disagree with them. The
// percentiles of the database are interpolated: whole milliseconds are enough.
export function toAssistantTotals(row: AssistantAggregate): AssistantTotals {
  return {
    questions: row.answered + row.noInfo + row.conflict + row.aiUnavailable,
    answered: row.answered,
    noInfo: row.noInfo,
    conflict: row.conflict,
    aiUnavailable: row.aiUnavailable,
    smallTalk: row.smallTalk,
    latencyP50Ms: roundedOrNull(row.latencyP50Ms),
    latencyP95Ms: roundedOrNull(row.latencyP95Ms),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    feedback: { useful: row.useful, notUseful: row.notUseful },
  };
}

const roundedOrNull = (value: number | null) =>
  value === null ? null : Math.round(value);
