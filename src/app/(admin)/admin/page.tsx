import Link from 'next/link';
import { getAdminUsage } from '@/lib/queries/admin-usage';
import { MonthSelect } from '@/components/admin/month-select';
import { DaySelect } from '@/components/admin/day-select';
import { UsageRoster } from '@/components/admin/usage-roster';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { month, day } = await searchParams;
  const selectedMonth = month ?? currentMonth();
  // Only honour a day that belongs to the selected month.
  const selectedDay = day?.startsWith(selectedMonth) ? day : undefined;

  const { users, totals, dailyTotals } = await getAdminUsage(
    selectedMonth,
    selectedDay,
  );
  const maxDayCost = Math.max(0, ...dailyTotals.map((d) => d.estimatedCostUsd));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Source-of-truth usage from the event ledger
          {selectedDay ? ` — ${selectedDay}` : ` — ${selectedMonth}`}. Cost is
          an estimate (switchable via per-model price env vars).
        </p>
        <div className="flex items-center gap-2">
          <MonthSelect selected={selectedMonth} />
          <DaySelect month={selectedMonth} selected={selectedDay} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi
          label="Active users"
          value={`${totals.activeUsers} / ${totals.totalUsers}`}
        />
        <Kpi
          label="Total queries"
          value={totals.totalQueries.toLocaleString()}
        />
        <Kpi label="Chat queries" value={totals.chatCount.toLocaleString()} />
        <Kpi label="LaTeX queries" value={totals.latexCount.toLocaleString()} />
        <Kpi
          label="Embeddings"
          value={totals.embeddingCount.toLocaleString()}
        />
        <Kpi label="Total tokens" value={totals.totalTokens.toLocaleString()} />
        <Kpi label="Est. cost" value={usd(totals.estimatedCostUsd)} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Daily totals — {selectedMonth}
        </h2>
        {dailyTotals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No usage recorded this month.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 text-right font-medium">Queries</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Est. cost
                  </th>
                  <th className="w-1/3 px-3 py-2 font-medium">Cost share</th>
                </tr>
              </thead>
              <tbody>
                {dailyTotals.map((d) => (
                  <tr key={d.day} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin?month=${selectedMonth}&day=${d.day}`}
                        className={
                          'text-primary hover:underline ' +
                          (d.day === selectedDay ? 'font-semibold' : '')
                        }
                      >
                        {d.day}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d.queryCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {usd(d.estimatedCostUsd)}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="h-2 rounded bg-primary/70"
                        style={{
                          width: `${
                            maxDayCost > 0
                              ? Math.max(
                                  2,
                                  (d.estimatedCostUsd / maxDayCost) * 100,
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Per-user{selectedDay ? ` — ${selectedDay}` : ''} (click a column to
          sort)
        </h2>
        <UsageRoster users={users} />
      </section>
    </div>
  );
}
