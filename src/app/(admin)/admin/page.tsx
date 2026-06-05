import { getAdminUsage } from '@/lib/queries/admin-usage';
import { MonthSelect } from '@/components/admin/month-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function tokensFor(
  tokensByModel: Record<string, { input: number; output: number }>,
  model: string,
): number {
  const t = tokensByModel[model];
  return t ? t.input + t.output : 0;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const selectedMonth = month ?? currentMonth();
  const { users, totals } = await getAdminUsage(selectedMonth);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Source-of-truth usage from the token ledger. Cost is an estimate
          (switchable via per-model price env vars).
        </p>
        <MonthSelect selected={selectedMonth} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chat queries
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.chatCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              LaTeX queries
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.latexCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.totalTokens.toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Est. cost
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {usd(totals.estimatedCostUsd)}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Chat</th>
              <th className="px-3 py-2 text-right font-medium">LaTeX</th>
              <th className="px-3 py-2 text-right font-medium">Flash tok</th>
              <th className="px-3 py-2 text-right font-medium">Pro tok</th>
              <th className="px-3 py-2 text-right font-medium">Embed tok</th>
              <th className="px-3 py-2 text-right font-medium">Est. cost</th>
              <th className="px-3 py-2 text-right font-medium">Chat quota</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.tier}</td>
                <td className="px-3 py-2 text-right">{u.chatCount}</td>
                <td className="px-3 py-2 text-right">{u.latexCount}</td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'flash').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'pro').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'embedding').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {usd(u.estimatedCostUsd)}
                </td>
                <td
                  className={
                    'px-3 py-2 text-right ' +
                    (u.chatQuotaPct >= 100
                      ? 'font-semibold text-destructive'
                      : u.chatQuotaPct >= 80
                        ? 'font-medium text-amber-600'
                        : '')
                  }
                >
                  {u.chatQuotaPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
