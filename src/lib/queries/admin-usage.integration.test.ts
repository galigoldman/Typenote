/**
 * Integration test: getAdminUsage aggregates per-user usage + token cost for a
 * given month against the seeded deterministic rows (month 2099-01).
 */
import { describe, it, expect } from 'vitest';
import { getAdminUsage } from './admin-usage';

const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

describe('getAdminUsage (2099-01 seed)', () => {
  it('returns the seeded user with correct counts and a positive cost', async () => {
    const { users, totals } = await getAdminUsage('2099-01');
    const row = users.find((u) => u.userId === TEST_USER_ID);

    expect(row).toBeDefined();
    expect(row!.chatCount).toBe(12);
    expect(row!.latexCount).toBe(30);
    expect(row!.tokensByModel.flash).toEqual({
      input: 1000000,
      output: 500000,
    });
    expect(row!.tokensByModel.embedding.input).toBe(2000000);
    // flash 1M in*0.30 + 0.5M out*2.50 + embedding 2M*0.15 = 0.30 + 1.25 + 0.30
    expect(row!.estimatedCostUsd).toBeCloseTo(1.85, 4);
    expect(totals.estimatedCostUsd).toBeGreaterThanOrEqual(1.85);
  });

  it('returns no rows for a month with no activity', async () => {
    const { users } = await getAdminUsage('1999-01');
    expect(users).toHaveLength(0);
  });
});
