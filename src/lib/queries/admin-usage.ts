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
  /** Chat queries used as a percentage of the tier's chat limit (0-100+). */
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

/**
 * Aggregate per-user AI usage + cost for one month. Reads via the service-role
 * client (bypasses RLS) — call ONLY after requireAdmin() in a Server Component.
 */
export async function getAdminUsage(month: string): Promise<AdminUsage> {
  const admin = createAdminClient();

  const [{ data: profiles }, { data: usage }, { data: tokens }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, email, display_name, subscription_tier'),
      admin
        .from('ai_usage')
        .select('user_id, query_type, query_count')
        .eq('usage_month', month),
      admin
        .from('ai_token_usage')
        .select('user_id, model, input_tokens, output_tokens')
        .eq('usage_month', month),
    ]);

  const byUser = new Map<string, AdminUserUsage>();
  for (const p of profiles ?? []) {
    byUser.set(p.id, {
      userId: p.id,
      email: p.email,
      displayName: p.display_name ?? null,
      tier: p.subscription_tier ?? 'free',
      chatCount: 0,
      latexCount: 0,
      tokensByModel: {},
      estimatedCostUsd: 0,
      chatQuotaPct: 0,
    });
  }

  for (const u of usage ?? []) {
    const row = byUser.get(u.user_id);
    if (!row) continue;
    if (u.query_type === 'chat') row.chatCount = u.query_count;
    else if (u.query_type === 'latex') row.latexCount = u.query_count;
  }

  for (const t of tokens ?? []) {
    const row = byUser.get(t.user_id);
    if (!row) continue;
    row.tokensByModel[t.model] = {
      input: t.input_tokens,
      output: t.output_tokens,
    };
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

  // Surface every registered user (full roster), not just those active this
  // month — admins want complete visibility, including who has never used AI.
  // Sort top spenders first (cost desc), then by query volume, then email so the
  // ordering is stable; zero-activity users naturally sink to the bottom.
  const users = [...byUser.values()].sort(
    (a, b) =>
      b.estimatedCostUsd - a.estimatedCostUsd ||
      b.chatCount + b.latexCount - (a.chatCount + a.latexCount) ||
      a.email.localeCompare(b.email),
  );

  return { users, totals };
}
