import { describe, it, expect } from 'vitest';
import { monthRange, aggregateRoster } from '@/lib/queries/admin-usage';

describe('monthRange', () => {
  it('returns UTC start (inclusive) and next-month start (exclusive)', () => {
    expect(monthRange('2099-01')).toEqual({
      start: '2099-01-01T00:00:00.000Z',
      end: '2099-02-01T00:00:00.000Z',
    });
    expect(monthRange('2099-12')).toEqual({
      start: '2099-12-01T00:00:00.000Z',
      end: '2100-01-01T00:00:00.000Z',
    });
  });
});

describe('aggregateRoster', () => {
  it('builds full roster incl. zero-usage users, sorted by cost desc', () => {
    const authUsers = [
      { id: 'u1', email: 'a@x.dev' },
      { id: 'u2', email: 'b@x.dev' }, // no profile, no usage
    ];
    const profiles = [
      {
        id: 'u1',
        email: 'a@x.dev',
        display_name: 'A',
        subscription_tier: 'pro',
      },
    ];
    const events = [
      {
        user_id: 'u1',
        query_type: 'chat',
        model: 'flash',
        input_tokens: 1_000_000,
        output_tokens: 500_000,
      },
      {
        user_id: 'u1',
        query_type: 'embedding',
        model: 'embedding',
        input_tokens: 2_000_000,
        output_tokens: 0,
      },
    ];
    const { users, totals } = aggregateRoster(authUsers, profiles, events);

    expect(users).toHaveLength(2);
    const u1 = users.find((u) => u.userId === 'u1')!;
    expect(u1.chatCount).toBe(1);
    expect(u1.tokensByModel.flash).toEqual({
      input: 1_000_000,
      output: 500_000,
    });
    expect(u1.estimatedCostUsd).toBeCloseTo(1.95, 2);
    const u2 = users.find((u) => u.userId === 'u2')!;
    expect(u2.email).toBe('b@x.dev');
    expect(u2.tier).toBe('free');
    expect(u2.estimatedCostUsd).toBe(0);
    expect(users[0].userId).toBe('u1');
    expect(totals.estimatedCostUsd).toBeCloseTo(1.95, 2);
  });
});
