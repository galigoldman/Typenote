import { describe, it, expect } from 'vitest';
import { getAdminUsage } from '@/lib/queries/admin-usage';

const TEST_USER = 'test@typenote.dev';

describe('getAdminUsage (full roster from auth.users)', () => {
  it('lists every auth user, including ones with no usage this month', async () => {
    // 2099-07 is a month with no seeded events → all users have zero usage,
    // but the full roster must still be returned (the "missing users" fix).
    const { users, totals } = await getAdminUsage('2099-07');
    const admin = users.find((u) => u.email === 'admin@typenote.dev');
    const tester = users.find((u) => u.email === TEST_USER);
    expect(admin).toBeDefined();
    expect(tester).toBeDefined();
    // Zero-usage users still appear with $0 cost.
    expect(admin!.estimatedCostUsd).toBe(0);
    expect(users.length).toBeGreaterThanOrEqual(2);
    // Roster total reflects everyone; nobody active this empty month.
    expect(totals.totalUsers).toBe(users.length);
    expect(totals.activeUsers).toBe(0);
  });

  it('returns a month-wide daily trend for the seeded month', async () => {
    // Seed (2099-01): 2099-01-05 has 1 event, 2099-01-06 has 2 events.
    const { dailyTotals } = await getAdminUsage('2099-01');
    const days = dailyTotals.map((d) => d.day);
    expect(days).toContain('2099-01-05');
    expect(days).toContain('2099-01-06');
    // Newest first.
    expect(days.indexOf('2099-01-06')).toBeLessThan(days.indexOf('2099-01-05'));
    const d06 = dailyTotals.find((d) => d.day === '2099-01-06')!;
    expect(d06.queryCount).toBe(2); // chat + embedding on the 6th
  });

  it('scopes the roster to a single day, while keeping the month-wide trend', async () => {
    // Day 2099-01-06 for the test user: chat flash 400k/200k ($0.62) +
    // embedding 2M ($0.40) = $1.02.
    const { users, totals, dailyTotals } = await getAdminUsage(
      '2099-01',
      '2099-01-06',
    );
    const tester = users.find((u) => u.email === TEST_USER)!;
    expect(tester.estimatedCostUsd).toBeCloseTo(1.02, 2);
    expect(tester.chatCount).toBe(1); // only the 06th chat
    expect(tester.embeddingCount).toBe(1);
    expect(totals.activeUsers).toBe(1);
    expect(totals.estimatedCostUsd).toBeCloseTo(1.02, 2);
    // Trend is still month-wide (both seeded days present) despite day scope.
    expect(dailyTotals.map((d) => d.day)).toEqual(
      expect.arrayContaining(['2099-01-05', '2099-01-06']),
    );
  });
});
