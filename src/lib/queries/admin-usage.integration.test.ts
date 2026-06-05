/**
 * Integration test: getAdminUsage aggregates per-user usage + token cost for a
 * given month against the seeded deterministic rows (month 2099-01).
 */
import { describe, it, expect } from 'vitest';
import { getAdminUsage } from './admin-usage';

const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';
// admin@typenote.dev — seeded but has NO ai_usage/token rows in any test month,
// so it's our canary for the "show every user, even zero-activity" behavior.
const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000001';

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
    // flash 1M in*0.30 + 0.5M out*2.50 + embedding 2M*0.20 = 0.30 + 1.25 + 0.40
    expect(row!.estimatedCostUsd).toBeCloseTo(1.95, 4);
    expect(totals.estimatedCostUsd).toBeGreaterThanOrEqual(1.95);
  });

  it('also lists zero-activity users (full roster), with zeroed columns', async () => {
    const { users } = await getAdminUsage('2099-01');
    const admin = users.find((u) => u.userId === ADMIN_USER_ID);

    expect(admin).toBeDefined();
    expect(admin!.chatCount).toBe(0);
    expect(admin!.latexCount).toBe(0);
    expect(admin!.tokensByModel).toEqual({});
    expect(admin!.estimatedCostUsd).toBe(0);
    // Active users sort ahead of zero-activity ones (cost desc).
    const activeIdx = users.findIndex((u) => u.userId === TEST_USER_ID);
    const adminIdx = users.findIndex((u) => u.userId === ADMIN_USER_ID);
    expect(activeIdx).toBeLessThan(adminIdx);
  });

  it('still lists every user for a month with no activity (all zeroed)', async () => {
    const { users, totals } = await getAdminUsage('1999-01');

    // The roster is the full set of profiles, independent of the month.
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users.some((u) => u.userId === TEST_USER_ID)).toBe(true);
    expect(users.some((u) => u.userId === ADMIN_USER_ID)).toBe(true);
    expect(
      users.every(
        (u) =>
          u.chatCount === 0 &&
          u.latexCount === 0 &&
          Object.keys(u.tokensByModel).length === 0 &&
          u.estimatedCostUsd === 0,
      ),
    ).toBe(true);
    expect(totals.estimatedCostUsd).toBe(0);
  });
});
