import { afterEach, describe, expect, test, vi } from 'vitest';
import { teamCMetrics } from '@/lib/metrics';
import { createUnavailableTeamCMetrics } from '@/lib/metrics/unavailable-team-c-metrics';

describe('createUnavailableTeamCMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('answers that the metrics of pair C are not available', async () => {
    const source = createUnavailableTeamCMetrics();

    await expect(source.getAssistant({ from: '2026-10-01', to: '2026-10-27' })).resolves.toBeNull();
    await expect(source.getDocuments({})).resolves.toBeNull();
  });

  test('never calls the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const source = createUnavailableTeamCMetrics();

    await source.getAssistant({});
    await source.getDocuments({});

    expect(fetch).not.toHaveBeenCalled();
  });

  test('is the adapter the panel uses for now', async () => {
    await expect(teamCMetrics.getAssistant({})).resolves.toBeNull();
  });
});
