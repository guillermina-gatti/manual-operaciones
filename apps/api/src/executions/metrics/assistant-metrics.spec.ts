import { AssistantAggregate, toAssistantTotals } from './assistant-metrics';

const ROW: AssistantAggregate = {
  answered: 6,
  noInfo: 2,
  conflict: 1,
  aiUnavailable: 1,
  smallTalk: 4,
  latencyP50Ms: 2400.4,
  latencyP95Ms: 6100.6,
  inputTokens: 12000,
  outputTokens: 3000,
  useful: 3,
  notUseful: 1,
};

describe('toAssistantTotals', () => {
  it('questions is the sum of the four results, without small talk', () => {
    const totals = toAssistantTotals(ROW);

    expect(totals.questions).toBe(10);
    expect(totals.smallTalk).toBe(4);
  });

  it('keeps every count and groups the feedback', () => {
    expect(toAssistantTotals(ROW)).toEqual({
      questions: 10,
      answered: 6,
      noInfo: 2,
      conflict: 1,
      aiUnavailable: 1,
      smallTalk: 4,
      latencyP50Ms: 2400,
      latencyP95Ms: 6101,
      inputTokens: 12000,
      outputTokens: 3000,
      feedback: { useful: 3, notUseful: 1 },
    });
  });

  it('without timed questions the latencies stay null', () => {
    const totals = toAssistantTotals({
      ...ROW,
      latencyP50Ms: null,
      latencyP95Ms: null,
    });

    expect(totals.latencyP50Ms).toBeNull();
    expect(totals.latencyP95Ms).toBeNull();
  });

  it('nothing asked: every number is zero', () => {
    const totals = toAssistantTotals({
      answered: 0,
      noInfo: 0,
      conflict: 0,
      aiUnavailable: 0,
      smallTalk: 0,
      latencyP50Ms: null,
      latencyP95Ms: null,
      inputTokens: 0,
      outputTokens: 0,
      useful: 0,
      notUseful: 0,
    });

    expect(totals.questions).toBe(0);
    expect(totals.feedback).toEqual({ useful: 0, notUseful: 0 });
  });
});
