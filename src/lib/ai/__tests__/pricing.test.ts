import { describe, it, expect, afterEach, vi } from 'vitest';
import { estimateCostUsd, getModelPrices } from '../pricing';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('estimateCostUsd', () => {
  it('prices flash input + output per 1M tokens using defaults', () => {
    // defaults: flash input 0.30, output 2.50 per 1M
    const cost = estimateCostUsd('flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.3 + 2.5, 6);
  });

  it('prices embedding as input-only', () => {
    // default embedding input 0.15 per 1M, output unused
    const cost = estimateCostUsd('embedding', 2_000_000, 0);
    expect(cost).toBeCloseTo(0.3, 6);
  });

  it('returns 0 for an unknown model', () => {
    expect(estimateCostUsd('mystery', 1_000_000, 1_000_000)).toBe(0);
  });

  it('honours env overrides so prices are switchable without a deploy', () => {
    vi.stubEnv('AI_PRICE_FLASH_INPUT', '1.00');
    vi.stubEnv('AI_PRICE_FLASH_OUTPUT', '3.00');
    expect(getModelPrices().flash).toEqual({ input: 1.0, output: 3.0 });
    expect(estimateCostUsd('flash', 1_000_000, 1_000_000)).toBeCloseTo(4.0, 6);
  });

  it('ignores invalid env values and falls back to default', () => {
    vi.stubEnv('AI_PRICE_FLASH_INPUT', 'not-a-number');
    expect(getModelPrices().flash.input).toBe(0.3);
  });
});
