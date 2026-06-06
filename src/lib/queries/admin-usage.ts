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
  tokensByModel: Record<string, ModelTokens>;
  estimatedCostUsd: number;
  chatQuotaPct: number;
}
export interface AdminUsageTotals {
  chatCount: number;
  latexCount: number;
  totalTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
}
export interface AdminUsage {
  users: AdminUserUsage[];
  totals: AdminUsageTotals;
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
interface EventLite {
  user_id: string;
  query_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/** UTC [start, end) ISO bounds for a 'YYYY-MM' month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
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
      tokensByModel: {},
      estimatedCostUsd: 0,
      chatQuotaPct: 0,
    });
  }

  for (const e of events) {
    const row = byUser.get(e.user_id);
    if (!row) continue;
    if (e.query_type === 'chat') row.chatCount += 1;
    else if (e.query_type === 'latex') row.latexCount += 1;
    const tk = (row.tokensByModel[e.model] ??= { input: 0, output: 0 });
    tk.input += e.input_tokens;
    tk.output += e.output_tokens;
  }

  const totals: AdminUsageTotals = {
    chatCount: 0,
    latexCount: 0,
    totalTokens: 0,
    embeddingTokens: 0,
    estimatedCostUsd: 0,
  };
  for (const row of byUser.values()) {
    let cost = 0;
    for (const [model, tk] of Object.entries(row.tokensByModel)) {
      cost += estimateCostUsd(model, tk.input, tk.output);
      totals.totalTokens += tk.input + tk.output;
      if (model === 'embedding') totals.embeddingTokens += tk.input;
    }
    row.estimatedCostUsd = cost;
    const chatLimit = resolveLimitForTier(row.tier, 'chat');
    row.chatQuotaPct =
      chatLimit > 0 ? Math.round((row.chatCount / chatLimit) * 100) : 0;
    totals.chatCount += row.chatCount;
    totals.latexCount += row.latexCount;
    totals.estimatedCostUsd += cost;
  }

  const users = [...byUser.values()].sort(
    (a, b) =>
      b.estimatedCostUsd - a.estimatedCostUsd ||
      b.chatCount + b.latexCount - (a.chatCount + a.latexCount) ||
      a.email.localeCompare(b.email),
  );
  return { users, totals };
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
 * Aggregate per-user AI usage + cost for one month from the event log.
 * Service-role reads — call ONLY after requireAdmin() in a Server Component.
 */
export async function getAdminUsage(month: string): Promise<AdminUsage> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);

  const [authUsers, profilesRes, eventsRes] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from('profiles').select('id, email, display_name, subscription_tier'),
    admin
      .from('ai_usage_events')
      .select('user_id, query_type, model, input_tokens, output_tokens')
      .gte('created_at', start)
      .lt('created_at', end),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  return aggregateRoster(
    authUsers,
    profilesRes.data ?? [],
    eventsRes.data ?? [],
  );
}
