'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminUserUsage } from '@/lib/queries/admin-usage';
import { sortUsers, type SortKey, type SortDir } from '@/lib/admin/roster-sort';

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}
function tokensFor(u: AdminUserUsage, model: string): number {
  const t = u.tokensByModel[model];
  return t ? t.input + t.output : 0;
}

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  render: (u: AdminUserUsage) => React.ReactNode;
}

const COLUMNS: Column[] = [
  {
    key: 'email',
    label: 'User',
    numeric: false,
    render: (u) => (
      <Link
        href={`/admin/users/${u.userId}`}
        className="text-primary underline-offset-2 hover:underline"
      >
        {u.email}
      </Link>
    ),
  },
  { key: 'tier', label: 'Tier', numeric: false, render: (u) => u.tier },
  { key: 'chat', label: 'Chat', numeric: true, render: (u) => u.chatCount },
  { key: 'latex', label: 'LaTeX', numeric: true, render: (u) => u.latexCount },
  {
    key: 'embedding',
    label: 'Embed',
    numeric: true,
    render: (u) => u.embeddingCount,
  },
  {
    key: 'flash',
    label: 'Flash tok',
    numeric: true,
    render: (u) => tokensFor(u, 'flash').toLocaleString(),
  },
  {
    key: 'pro',
    label: 'Pro tok',
    numeric: true,
    render: (u) => tokensFor(u, 'pro').toLocaleString(),
  },
  {
    key: 'embedTokens',
    label: 'Embed tok',
    numeric: true,
    render: (u) => tokensFor(u, 'embedding').toLocaleString(),
  },
  {
    key: 'tokens',
    label: 'Tokens',
    numeric: true,
    render: (u) => u.totalTokens.toLocaleString(),
  },
  {
    key: 'cost',
    label: 'Est. cost',
    numeric: true,
    render: (u) => usd(u.estimatedCostUsd),
  },
  {
    key: 'quota',
    label: 'Chat quota',
    numeric: true,
    render: (u) => (
      <span
        className={
          u.chatQuotaPct >= 100
            ? 'font-semibold text-destructive'
            : u.chatQuotaPct >= 80
              ? 'font-medium text-amber-600'
              : ''
        }
      >
        {u.chatQuotaPct}%
      </span>
    ),
  },
];

export function UsageRoster({ users }: { users: AdminUserUsage[] }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.displayName?.toLowerCase().includes(q) ?? false),
        )
      : users;
    return sortUsers(filtered, sortKey, sortDir);
  }, [users, query, sortKey, sortDir]);

  function toggleSort(col: Column) {
    if (col.key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir(col.numeric ? 'desc' : 'asc');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          type="search"
          aria-label="Filter users"
          placeholder="Filter by email…"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'user' : 'users'}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table data-testid="usage-roster" className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    aria-sort={
                      active
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={
                      'px-3 py-2 font-medium' +
                      (col.numeric ? ' text-right' : '')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={
                        'inline-flex items-center gap-1 hover:text-foreground ' +
                        (active ? 'text-foreground' : 'text-muted-foreground')
                      }
                    >
                      {col.label}
                      <span aria-hidden className="text-xs">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.userId} className="border-t">
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={'px-3 py-2' + (col.numeric ? ' text-right' : '')}
                  >
                    {col.render(u)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No users match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
