import { createAdminClient } from '@/lib/supabase/admin';
import { estimateCostUsd } from '@/lib/ai/pricing';
import { resolveLimitForTier } from '@/lib/ai/rate-limit';

export interface ModelTokens {
  input: number;
  output: number;
}
export interface AdminUserUsage {
  userId: string;
  email: string;
  displayName: string | null;
  tier: string;
  chatCount: number;
  latexCount: number;
  embeddingCount: number;
  totalTokens: number;
  tokensByModel: Record<string, ModelTokens>;
  estimatedCostUsd: number;
  chatQuotaPct: number;
}
export interface AdminUsageTotals {
  activeUsers: number;
  totalUsers: number;
  totalQueries: number;
  chatCount: number;
  latexCount: number;
  embeddingCount: number;
  totalTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
}
export interface DailyTotalRow {
  day: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface AdminUsage {
  users: AdminUserUsage[];
  totals: AdminUsageTotals;
  /** Per-day totals across all users for the whole month (trend), newest first. */
  dailyTotals: DailyTotalRow[];
}

interface AuthUserLite {
  id: string;
  email: string | null | undefined;
}
interface ProfileLite {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: string | null;
}
export interface EventLite {
  user_id: string;
  query_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

/** UTC [start, end) ISO bounds for a 'YYYY-MM' month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** UTC [start, end) ISO bounds for a single 'YYYY-MM-DD' day. */
export function dayRange(day: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Per-day totals (across all users), newest day first. Pure. */
export function aggregateDailyTotals(events: EventLite[]): DailyTotalRow[] {
  const byDay = new Map<string, DailyTotalRow>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    let r = byDay.get(day);
    if (!r) {
      r = { day, queryCount: 0, totalTokens: 0, estimatedCostUsd: 0 };
      byDay.set(day, r);
    }
    r.queryCount += 1;
    r.totalTokens += e.input_tokens + e.output_tokens;
    r.estimatedCostUsd += estimateCostUsd(
      e.model,
      e.input_tokens,
      e.output_tokens,
    );
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Pure aggregation — unit-tested without a DB. */
export function aggregateRoster(
  authUsers: AuthUserLite[],
  profiles: ProfileLite[],
  events: EventLite[],
): AdminUsage {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const byUser = new Map<string, AdminUserUsage>();

  for (const au of authUsers) {
    const p = profileById.get(au.id);
    byUser.set(au.id, {
      userId: au.id,
      email: au.email ?? p?.email ?? '(no email)',
      displayName: p?.display_name ?? null,
      tier: p?.subscription_tier ?? 'free',
      chatCount: 0,
      latexCount: 0,
      embeddingCount: 0,
      totalTokens: 0,
      tokensByModel: {},
      estimatedCostUsd: 0,
      chatQuotaPct: 0,
    });
  }

  const activeUserIds = new Set<string>();
  for (const e of events) {
    const row = byUser.get(e.user_id);
    if (!row) continue;
    activeUserIds.add(e.user_id);
    if (e.query_type === 'chat') row.chatCount += 1;
    else if (e.query_type === 'latex') row.latexCount += 1;
    else if (e.query_type === 'embedding') row.embeddingCount += 1;
    const tk = (row.tokensByModel[e.model] ??= { input: 0, output: 0 });
    tk.input += e.input_tokens;
    tk.output += e.output_tokens;
  }

  const totals: AdminUsageTotals = {
    activeUsers: activeUserIds.size,
    totalUsers: byUser.size,
    totalQueries: 0,
    chatCount: 0,
    latexCount: 0,
    embeddingCount: 0,
    totalTokens: 0,
    embeddingTokens: 0,
    estimatedCostUsd: 0,
  };
  for (const row of byUser.values()) {
    let cost = 0;
    for (const [model, tk] of Object.entries(row.tokensByModel)) {
      cost += estimateCostUsd(model, tk.input, tk.output);
      row.totalTokens += tk.input + tk.output;
      if (model === 'embedding') totals.embeddingTokens += tk.input;
    }
    row.estimatedCostUsd = cost;
    const chatLimit = resolveLimitForTier(row.tier, 'chat');
    row.chatQuotaPct =
      chatLimit > 0 ? Math.round((row.chatCount / chatLimit) * 100) : 0;

    totals.chatCount += row.chatCount;
    totals.latexCount += row.latexCount;
    totals.embeddingCount += row.embeddingCount;
    totals.totalTokens += row.totalTokens;
    totals.estimatedCostUsd += cost;
  }
  totals.totalQueries =
    totals.chatCount + totals.latexCount + totals.embeddingCount;

  const users = [...byUser.values()].sort(
    (a, b) =>
      b.estimatedCostUsd - a.estimatedCostUsd ||
      b.chatCount + b.latexCount - (a.chatCount + a.latexCount) ||
      a.email.localeCompare(b.email),
  );
  return { users, totals, dailyTotals: [] };
}

/** Enumerate every auth user (paged) so zero-profile users still appear. */
async function listAllAuthUsers(
  admin: ReturnType<typeof createAdminClient>,
): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < perPage) break;
  }
  return out;
}

/**
 * Aggregate per-user AI usage + cost from the event log.
 *
 * Always fetches the whole month (one query) so the daily-trend is month-wide.
 * When `day` ('YYYY-MM-DD') is given, the roster + totals are scoped to that
 * single UTC day; the trend still covers the full month.
 *
 * Service-role reads — call ONLY after requireAdmin() in a Server Component.
 */
export async function getAdminUsage(
  month: string,
  day?: string,
): Promise<AdminUsage> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);

  const [authUsers, profilesRes, eventsRes] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from('profiles').select('id, email, display_name, subscription_tier'),
    admin
      .from('ai_usage_events')
      .select(
        'user_id, query_type, model, input_tokens, output_tokens, created_at',
      )
      .gte('created_at', start)
      .lt('created_at', end),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const monthEvents = (eventsRes.data ?? []) as EventLite[];
  const dailyTotals = aggregateDailyTotals(monthEvents);

  const scopedEvents = day
    ? monthEvents.filter((e) => e.created_at.slice(0, 10) === day)
    : monthEvents;

  const roster = aggregateRoster(
    authUsers,
    profilesRes.data ?? [],
    scopedEvents,
  );
  return { ...roster, dailyTotals };
}
