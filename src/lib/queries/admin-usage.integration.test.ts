import { describe, it, expect } from 'vitest';
import { getAdminUsage } from '@/lib/queries/admin-usage';

describe('getAdminUsage (full roster from auth.users)', () => {
  it('lists every auth user, including ones with no usage this month', async () => {
    // 2099-07 is a month with no seeded events → all users have zero usage,
    // but the full roster must still be returned (the "missing users" fix).
    const { users } = await getAdminUsage('2099-07');
    const admin = users.find((u) => u.email === 'admin@typenote.dev');
    const tester = users.find((u) => u.email === 'test@typenote.dev');
    expect(admin).toBeDefined();
    expect(tester).toBeDefined();
    // Zero-usage users still appear with $0 cost.
    expect(admin!.estimatedCostUsd).toBe(0);
    expect(users.length).toBeGreaterThanOrEqual(2);
  });
});
