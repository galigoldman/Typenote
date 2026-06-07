'use client';

import { useRouter } from 'next/navigation';

/** Every 'YYYY-MM-DD' in the given 'YYYY-MM' month, ascending. */
function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  );
}

const ALL = 'all';

export function DaySelect({
  month,
  selected,
}: {
  month: string;
  selected?: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Usage day"
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={selected ?? ALL}
      onChange={(e) => {
        const v = e.target.value;
        router.push(
          v === ALL
            ? `/admin?month=${month}`
            : `/admin?month=${month}&day=${v}`,
        );
      }}
    >
      <option value={ALL}>All days</option>
      {daysInMonth(month).map((d) => (
        <option key={d} value={d}>
          {d.slice(8)}
        </option>
      ))}
    </select>
  );
}
