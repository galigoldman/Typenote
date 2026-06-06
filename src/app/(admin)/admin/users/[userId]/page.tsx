import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchUserEvents,
  fetchDocumentTitles,
  groupByMonth,
  groupByDay,
  toQueryLog,
  groupByDocument,
} from '@/lib/queries/admin-user-usage';

export const dynamic = 'force-dynamic';

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function AdminUserUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const { month, day } = await searchParams;

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? userId;

  const allEvents = await fetchUserEvents(userId);
  const months = groupByMonth(allEvents);

  const monthEvents = month
    ? allEvents.filter((e) => e.created_at.slice(0, 7) === month)
    : [];
  const days = month ? groupByDay(monthEvents) : [];

  const dayEvents = day
    ? allEvents.filter((e) => e.created_at.slice(0, 10) === day)
    : [];
  const queryLog = day ? toQueryLog(dayEvents) : [];

  const docIds = [
    ...new Set(allEvents.map((e) => e.document_id).filter(Boolean) as string[]),
  ];
  const titles = await fetchDocumentTitles(docIds);
  const byDocument = groupByDocument(allEvents, titles);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-primary hover:underline">
          ← All users
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{email}</h1>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          By month
        </h2>
        <UsageTable
          headers={['Month', 'Queries', 'Tokens', 'Est. cost']}
          rows={months.map((m) => ({
            key: m.month,
            href: `/admin/users/${userId}?month=${m.month}`,
            cells: [
              m.month,
              m.queryCount,
              m.totalTokens.toLocaleString(),
              usd(m.estimatedCostUsd),
            ],
          }))}
          empty="No usage recorded."
        />
      </section>

      {month && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {month} — by day
          </h2>
          <UsageTable
            headers={['Day', 'Queries', 'Tokens', 'Est. cost']}
            rows={days.map((d) => ({
              key: d.day,
              href: `/admin/users/${userId}?month=${month}&day=${d.day}`,
              cells: [
                d.day,
                d.queryCount,
                d.totalTokens.toLocaleString(),
                usd(d.estimatedCostUsd),
              ],
            }))}
            empty="No usage that month."
          />
        </section>
      )}

      {day && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {day} — per query
          </h2>
          <UsageTable
            headers={['Time (UTC)', 'Type', 'Model', 'In', 'Out', 'Est. cost']}
            rows={queryLog.map((q) => ({
              key: q.id,
              cells: [
                q.createdAt.slice(11, 19),
                q.queryType,
                q.model,
                q.inputTokens.toLocaleString(),
                q.outputTokens.toLocaleString(),
                usd(q.estimatedCostUsd),
              ],
            }))}
            empty="No queries that day."
          />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Questions by document
        </h2>
        <UsageTable
          headers={['Document', 'Queries', 'Tokens', 'Est. cost']}
          rows={byDocument.map((d) => ({
            key: d.documentId ?? 'none',
            cells: [
              d.title,
              d.queryCount,
              d.totalTokens.toLocaleString(),
              usd(d.estimatedCostUsd),
            ],
          }))}
          empty="No document-scoped usage."
        />
      </section>
    </div>
  );
}

function UsageTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: { key: string; href?: string; cells: (string | number)[] }[];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className={
                  'px-3 py-2 font-medium' + (i === 0 ? '' : ' text-right')
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={'px-3 py-2' + (i === 0 ? '' : ' text-right')}
                >
                  {i === 0 && r.href ? (
                    <Link
                      href={r.href}
                      className="text-primary hover:underline"
                    >
                      {c}
                    </Link>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
