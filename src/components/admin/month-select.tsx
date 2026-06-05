'use client';

import { useRouter } from 'next/navigation';

/** Last 12 months as 'YYYY-MM', most recent first, plus any current selection. */
function recentMonths(selected: string): string[] {
  const months = new Set<string>([selected]);
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    months.add(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }
  return [...months].sort().reverse();
}

export function MonthSelect({ selected }: { selected: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Usage month"
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={selected}
      onChange={(e) => router.push(`/admin?month=${e.target.value}`)}
    >
      {recentMonths(selected).map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
