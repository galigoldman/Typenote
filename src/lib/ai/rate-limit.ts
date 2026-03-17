import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  currentCount: number;
  dailyLimit: number;
  tier: string;
  isAllowed: boolean;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
  resetsAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Tier limit resolution
// ---------------------------------------------------------------------------

/** Default limits per tier (used when env vars are not set). */
const DEFAULT_LIMITS: Record<string, number> = {
  free: 30,
  pro: 100,
};

/**
 * Resolve the daily limit for a given tier.
 *
 * Priority: environment variable AI_LIMIT_{TIER} > default map > free default.
 *
 * Why env vars? Decouples operational decisions (changing a limit from 30 to 50)
 * from code deployments. This is the twelve-factor app principle of storing
 * config in the environment.
 */
function resolveLimitForTier(tier: string): number {
  const envKey = `AI_LIMIT_${tier.toUpperCase()}`;
  const envValue = process.env[envKey];

  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    // Invalid env var — fall through to defaults
    console.warn(
      `[rate-limit] Invalid value for ${envKey}="${envValue}", using default`,
    );
  }

  return DEFAULT_LIMITS[tier] ?? DEFAULT_LIMITS.free!;
}

// ---------------------------------------------------------------------------
// checkAndIncrementUsage
// ---------------------------------------------------------------------------

/**
 * Atomically check and increment a user's daily AI usage.
 *
 * Calls the `increment_ai_usage` Postgres RPC which performs an atomic upsert.
 * After getting the DB-level limit, applies env var overrides if configured.
 *
 * Why RPC instead of application-level logic? The atomic guarantee lives in
 * the database, not the application. Even if the app layer has a bug or race
 * condition, the database function ensures correctness. This is defense-in-depth.
 */
export async function checkAndIncrementUsage(
  userId: string,
  model: string,
): Promise<RateLimitResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_model: model,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  // RPC returns an array with one row
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error('Rate limit check returned no data');
  }

  const tier = row.tier as string;
  const currentCount = row.current_count as number;

  // Apply env var override for the limit
  const dailyLimit = resolveLimitForTier(tier);

  return {
    currentCount,
    dailyLimit,
    tier,
    isAllowed: currentCount <= dailyLimit,
  };
}

// ---------------------------------------------------------------------------
// getQuota
// ---------------------------------------------------------------------------

/**
 * Get a user's current AI quota for display in the chat panel.
 *
 * Calls the `get_ai_quota` Postgres RPC, then applies env var overrides
 * so the displayed limit matches what enforcement actually uses.
 */
export async function getQuota(userId: string): Promise<QuotaInfo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_ai_quota', {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Quota check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error('Quota check returned no data');
  }

  const tier = row.tier as string;
  const used = row.used as number;

  // Apply env var override for the limit
  const limit = resolveLimitForTier(tier);
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    tier,
    resetsAt: row.resets_at as string,
  };
}
