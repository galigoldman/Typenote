import type { AdminUserUsage } from '@/lib/queries/admin-usage';

export type SortKey =
  | 'email'
  | 'tier'
  | 'chat'
  | 'latex'
  | 'embedding'
  | 'flash'
  | 'pro'
  | 'embedTokens'
  | 'tokens'
  | 'cost'
  | 'quota';
export type SortDir = 'asc' | 'desc';

function tokensFor(u: AdminUserUsage, model: string): number {
  const t = u.tokensByModel[model];
  return t ? t.input + t.output : 0;
}

/** Numeric/string value a column sorts on. */
export function sortValue(u: AdminUserUsage, key: SortKey): number | string {
  switch (key) {
    case 'email':
      return u.email.toLowerCase();
    case 'tier':
      return u.tier.toLowerCase();
    case 'chat':
      return u.chatCount;
    case 'latex':
      return u.latexCount;
    case 'embedding':
      return u.embeddingCount;
    case 'flash':
      return tokensFor(u, 'flash');
    case 'pro':
      return tokensFor(u, 'pro');
    case 'embedTokens':
      return tokensFor(u, 'embedding');
    case 'tokens':
      return u.totalTokens;
    case 'cost':
      return u.estimatedCostUsd;
    case 'quota':
      return u.chatQuotaPct;
  }
}

/**
 * Stable sort of a roster by a column. Pure — no DB, no React. Returns a new
 * array; email is the deterministic tiebreaker so ordering is reproducible.
 */
export function sortUsers(
  users: AdminUserUsage[],
  key: SortKey,
  dir: SortDir,
): AdminUserUsage[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...users].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    let cmp: number;
    if (typeof av === 'string' || typeof bv === 'string') {
      cmp = String(av).localeCompare(String(bv));
    } else {
      cmp = av - bv;
    }
    return cmp !== 0
      ? cmp * factor
      : a.email.toLowerCase().localeCompare(b.email.toLowerCase());
  });
}
