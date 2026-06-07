import { describe, it, expect } from 'vitest';
import {
  monthRange,
  dayRange,
  aggregateRoster,
  aggregateDailyTotals,
} from '@/lib/queries/admin-usage';

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

describe('dayRange', () => {
  it('returns UTC start (inclusive) and next-day start (exclusive)', () => {
    expect(dayRange('2099-01-06')).toEqual({
      start: '2099-01-06T00:00:00.000Z',
      end: '2099-01-07T00:00:00.000Z',
    });
  });
  it('rolls over month boundaries', () => {
    expect(dayRange('2099-01-31')).toEqual({
      start: '2099-01-31T00:00:00.000Z',
      end: '2099-02-01T00:00:00.000Z',
    });
  });
});

describe('aggregateRoster', () => {
  it('builds full roster incl. zero-usage users, sorted by cost desc, with rich totals', () => {
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
        created_at: '2099-01-05T10:00:00.000Z',
      },
      {
        user_id: 'u1',
        query_type: 'embedding',
        model: 'embedding',
        input_tokens: 2_000_000,
        output_tokens: 0,
        created_at: '2099-01-06T10:00:00.000Z',
      },
    ];
    const { users, totals } = aggregateRoster(authUsers, profiles, events);

    expect(users).toHaveLength(2);
    const u1 = users.find((u) => u.userId === 'u1')!;
    expect(u1.chatCount).toBe(1);
    expect(u1.embeddingCount).toBe(1);
    expect(u1.totalTokens).toBe(3_500_000);
    expect(u1.tokensByModel.flash).toEqual({
      input: 1_000_000,
      output: 500_000,
    });
    expect(u1.estimatedCostUsd).toBeCloseTo(1.95, 2);

    const u2 = users.find((u) => u.userId === 'u2')!;
    expect(u2.email).toBe('b@x.dev');
    expect(u2.tier).toBe('free');
    expect(u2.estimatedCostUsd).toBe(0);

    expect(users[0].userId).toBe('u1'); // cost desc

    // Rich totals.
    expect(totals.totalUsers).toBe(2);
    expect(totals.activeUsers).toBe(1); // only u1 had events
    expect(totals.chatCount).toBe(1);
    expect(totals.embeddingCount).toBe(1);
    expect(totals.totalQueries).toBe(2); // chat + embedding
    expect(totals.totalTokens).toBe(3_500_000);
    expect(totals.estimatedCostUsd).toBeCloseTo(1.95, 2);
  });
});

describe('aggregateDailyTotals', () => {
  it('groups events by UTC day, newest first, summing tokens and cost', () => {
    const events = [
      {
        user_id: 'u1',
        query_type: 'chat',
        model: 'flash',
        input_tokens: 1_000_000, // $0.30
        output_tokens: 0,
        created_at: '2099-01-05T23:00:00.000Z',
      },
      {
        user_id: 'u2',
        query_type: 'chat',
        model: 'flash',
        input_tokens: 1_000_000, // $0.30
        output_tokens: 0,
        created_at: '2099-01-06T01:00:00.000Z',
      },
      {
        user_id: 'u1',
        query_type: 'embedding',
        model: 'embedding',
        input_tokens: 1_000_000, // $0.20
        output_tokens: 0,
        created_at: '2099-01-06T02:00:00.000Z',
      },
    ];
    const days = aggregateDailyTotals(events);
    expect(days.map((d) => d.day)).toEqual(['2099-01-06', '2099-01-05']);

    const d06 = days.find((d) => d.day === '2099-01-06')!;
    expect(d06.queryCount).toBe(2);
    expect(d06.totalTokens).toBe(2_000_000);
    expect(d06.estimatedCostUsd).toBeCloseTo(0.5, 2); // 0.30 + 0.20

    const d05 = days.find((d) => d.day === '2099-01-05')!;
    expect(d05.queryCount).toBe(1);
    expect(d05.estimatedCostUsd).toBeCloseTo(0.3, 2);
  });

  it('returns [] for no events', () => {
    expect(aggregateDailyTotals([])).toEqual([]);
  });
});
