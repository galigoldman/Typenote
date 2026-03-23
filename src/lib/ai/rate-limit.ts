import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryType = 'chat' | 'latex';

export interface RateLimitResult {
  currentCount: number;
  monthlyLimit: number;
  tier: string;
  isAllowed: boolean;
}

export interface QuotaBucket {
  used: number;
  limit: number;
  remaining: number;
}

export interface QuotaInfo {
  chat: QuotaBucket;
  latex: QuotaBucket;
  tier: string;
  resetsAt: string; // ISO 8601
  deepModeAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Tier limit resolution
// ---------------------------------------------------------------------------

/** Default monthly chat limits per tier. */
const DEFAULT_CHAT_LIMITS: Record<string, number> = {
  free: 50,
  beta: 100,
  pro: 500,
};

/** Default monthly LaTeX limits per tier. */
const DEFAULT_LATEX_LIMITS: Record<string, number> = {
  free: 150,
  beta: 500,
  pro: 1500,
};

/**
 * Resolve the monthly limit for a given tier and query type.
 *
 * Priority: environment variable > default map > free default.
 *
 * For chat: checks AI_LIMIT_{TIER} (backwards-compatible with existing env vars).
 * For LaTeX: checks AI_LATEX_LIMIT_{TIER}.
 */
export function resolveLimitForTier(
  tier: string,
  queryType: QueryType = 'chat',
): number {
  const defaults =
    queryType === 'latex' ? DEFAULT_LATEX_LIMITS : DEFAULT_CHAT_LIMITS;
  const envPrefix = queryType === 'latex' ? 'AI_LATEX_LIMIT' : 'AI_LIMIT';
  const envKey = `${envPrefix}_${tier.toUpperCase()}`;
  const envValue = process.env[envKey];

  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(
      `[rate-limit] Invalid value for ${envKey}="${envValue}", using default`,
    );
  }

  return defaults[tier] ?? defaults.free!;
}

// ---------------------------------------------------------------------------
// checkAndIncrementUsage
// ---------------------------------------------------------------------------

/**
 * Atomically check and increment a user's monthly AI usage.
 *
 * Calls the `increment_ai_usage` Postgres RPC which performs an atomic upsert.
 * The `queryType` parameter separates chat and LaTeX counters so they have
 * independent quotas.
 */
export async function checkAndIncrementUsage(
  userId: string,
  model: string,
  queryType: QueryType = 'chat',
): Promise<RateLimitResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_model: model,
    p_query_type: queryType,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error('Rate limit check returned no data');
  }

  const tier = row.tier as string;
  const currentCount = row.current_count as number;

  // Apply env var override for the limit
  const monthlyLimit = resolveLimitForTier(tier, queryType);

  return {
    currentCount,
    monthlyLimit,
    tier,
    isAllowed: currentCount <= monthlyLimit,
  };
}

// ---------------------------------------------------------------------------
// getQuota
// ---------------------------------------------------------------------------

/**
 * Get a user's current AI quota for display in the chat panel.
 *
 * The RPC now returns two rows (chat + latex). We combine them into a single
 * QuotaInfo object with per-type buckets.
 */
export async function getQuota(userId: string): Promise<QuotaInfo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_ai_quota', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Quota check failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [data];

  if (!rows.length) {
    throw new Error('Quota check returned no data');
  }

  // The RPC returns one row per query_type. Both rows share the same tier/resets_at.
  const tier = (rows[0].tier as string) ?? 'free';
  const resetsAt = rows[0].resets_at as string;

  let chatUsed = 0;
  let latexUsed = 0;

  for (const row of rows) {
    if (row.query_type === 'chat') {
      chatUsed = row.used as number;
    } else if (row.query_type === 'latex') {
      latexUsed = row.used as number;
    }
  }

  const chatLimit = resolveLimitForTier(tier, 'chat');
  const latexLimit = resolveLimitForTier(tier, 'latex');

  return {
    chat: {
      used: chatUsed,
      limit: chatLimit,
      remaining: Math.max(0, chatLimit - chatUsed),
    },
    latex: {
      used: latexUsed,
      limit: latexLimit,
      remaining: Math.max(0, latexLimit - latexUsed),
    },
    tier,
    resetsAt,
    deepModeAvailable: tier === 'pro',
  };
}

// ---------------------------------------------------------------------------
// recordTokenUsage (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Record token counts for admin observability. Called AFTER the AI response.
 *
 * This is a fire-and-forget update — it never throws. If the DB update fails,
 * we log and move on. The user's query is not affected.
 *
 * Why not in the atomic RPC? Because token counts are unknown before the AI call,
 * and the RPC runs before the call for fail-closed rate limiting.
 */
export async function recordTokenUsage(
  userId: string,
  queryType: QueryType,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const supabase = await createClient();

    // Atomic increment via RPC — can't use .update() because it replaces, not adds.
    await supabase.rpc('record_token_usage', {
      p_user_id: userId,
      p_query_type: queryType,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    });
  } catch (err) {
    // Fire-and-forget: log but never throw
    console.error('[rate-limit] Failed to record token usage:', err);
  }
}
