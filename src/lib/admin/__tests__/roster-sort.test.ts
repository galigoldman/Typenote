import { describe, it, expect } from 'vitest';
import { sortUsers, sortValue } from '@/lib/admin/roster-sort';
import type { AdminUserUsage } from '@/lib/queries/admin-usage';

function u(partial: Partial<AdminUserUsage>): AdminUserUsage {
  return {
    userId: partial.userId ?? partial.email ?? 'id',
    email: partial.email ?? 'x@x.dev',
    displayName: partial.displayName ?? null,
    tier: partial.tier ?? 'free',
    chatCount: partial.chatCount ?? 0,
    latexCount: partial.latexCount ?? 0,
    embeddingCount: partial.embeddingCount ?? 0,
    totalTokens: partial.totalTokens ?? 0,
    tokensByModel: partial.tokensByModel ?? {},
    estimatedCostUsd: partial.estimatedCostUsd ?? 0,
    chatQuotaPct: partial.chatQuotaPct ?? 0,
  };
}

const ROSTER = [
  u({ email: 'carol@x.dev', estimatedCostUsd: 0.5, chatCount: 2 }),
  u({ email: 'alice@x.dev', estimatedCostUsd: 2.0, chatCount: 1 }),
  u({ email: 'bob@x.dev', estimatedCostUsd: 0.5, chatCount: 9 }),
];

describe('sortValue', () => {
  it('lowercases string keys and reads model token totals', () => {
    expect(sortValue(u({ email: 'A@B.dev' }), 'email')).toBe('a@b.dev');
    expect(
      sortValue(
        u({ tokensByModel: { flash: { input: 10, output: 5 } } }),
        'flash',
      ),
    ).toBe(15);
    expect(
      sortValue(
        u({ tokensByModel: { embedding: { input: 7, output: 0 } } }),
        'embedTokens',
      ),
    ).toBe(7);
  });
});

describe('sortUsers', () => {
  it('sorts by cost descending', () => {
    const r = sortUsers(ROSTER, 'cost', 'desc');
    expect(r.map((x) => x.email)).toEqual([
      'alice@x.dev', // 2.0
      'bob@x.dev', // 0.5, tiebreak by email (bob < carol)
      'carol@x.dev', // 0.5
    ]);
  });

  it('sorts by cost ascending', () => {
    const r = sortUsers(ROSTER, 'cost', 'asc');
    expect(r.map((x) => x.email)).toEqual([
      'bob@x.dev',
      'carol@x.dev',
      'alice@x.dev',
    ]);
  });

  it('sorts by email ascending (case-insensitive)', () => {
    const r = sortUsers(ROSTER, 'email', 'asc');
    expect(r.map((x) => x.email)).toEqual([
      'alice@x.dev',
      'bob@x.dev',
      'carol@x.dev',
    ]);
  });

  it('sorts by a numeric column with email tiebreak', () => {
    const r = sortUsers(ROSTER, 'chat', 'desc');
    expect(r.map((x) => x.email)).toEqual([
      'bob@x.dev', // 9
      'carol@x.dev', // 2
      'alice@x.dev', // 1
    ]);
  });

  it('does not mutate the input array', () => {
    const before = ROSTER.map((x) => x.email);
    sortUsers(ROSTER, 'cost', 'asc');
    expect(ROSTER.map((x) => x.email)).toEqual(before);
  });
});
