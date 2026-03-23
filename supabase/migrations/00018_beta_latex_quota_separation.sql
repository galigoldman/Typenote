-- 014-beta-latex-limits: Separate chat/LaTeX quotas, beta tier, token tracking
--
-- What this migration does:
-- 1. Adds query_type column to ai_usage (distinguishes 'chat' vs 'latex')
-- 2. Adds token tracking columns (fire-and-forget, observability only)
-- 3. Updates unique index to include query_type
-- 4. Updates increment_ai_usage RPC with query_type param + beta tier + latex limits
-- 5. Updates get_ai_quota RPC to return per-type rows
-- 6. Creates admin_user_ai_usage VIEW for Supabase dashboard queries
--
-- Why separate query_type instead of separate tables?
-- A single table with a discriminator column is simpler. The unique index
-- (user_id, usage_month, query_type) cleanly separates counters while keeping
-- the atomic upsert pattern unchanged.
--
-- Why token columns if we don't use them for limiting?
-- Admins want to see actual token consumption per user for cost estimation.
-- These are updated via a fire-and-forget UPDATE after each AI call — not
-- in the atomic RPC. If the update fails, the query still succeeds.

-- 1. Add new columns to ai_usage
ALTER TABLE ai_usage
  ADD COLUMN query_type text NOT NULL DEFAULT 'chat',
  ADD COLUMN total_input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN total_output_tokens bigint NOT NULL DEFAULT 0;

-- 2. Replace unique index to include query_type
-- Existing rows all get query_type='chat' (the default), so no data conflict.
DROP INDEX ai_usage_user_month_idx;

CREATE UNIQUE INDEX ai_usage_user_month_type_idx
  ON ai_usage (user_id, usage_month, query_type);

-- 3. Updated increment RPC with query_type support + beta tier + latex limits
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_model text DEFAULT NULL,
  p_query_type text DEFAULT 'chat'
)
RETURNS TABLE (
  current_count integer,
  monthly_limit integer,
  tier text,
  is_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_limit integer;
  v_count integer;
  v_month text;
BEGIN
  v_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier
    FROM profiles WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  -- Resolve limit based on tier AND query type.
  -- Chat limits: free=50, beta=100, pro=500
  -- LaTeX limits: free=150, beta=500, pro=1500
  -- Application-layer env var overrides take precedence — see rate-limit.ts.
  IF p_query_type = 'latex' THEN
    v_limit := CASE v_tier
      WHEN 'pro'  THEN 1500
      WHEN 'beta' THEN 500
      WHEN 'free' THEN 150
      ELSE 150
    END;
  ELSE
    v_limit := CASE v_tier
      WHEN 'pro'  THEN 500
      WHEN 'beta' THEN 100
      WHEN 'free' THEN 50
      ELSE 50
    END;
  END IF;

  -- Atomic upsert keyed on (user_id, usage_month, query_type)
  INSERT INTO ai_usage (user_id, usage_month, query_type, query_count, last_model)
    VALUES (p_user_id, v_month, p_query_type, 1, p_model)
    ON CONFLICT (user_id, usage_month, query_type)
    DO UPDATE SET
      query_count = ai_usage.query_count + 1,
      last_model = COALESCE(p_model, ai_usage.last_model),
      updated_at = now()
    RETURNING ai_usage.query_count INTO v_count;

  RETURN QUERY SELECT v_count, v_limit, v_tier, (v_count <= v_limit);
END;
$$;

-- 4. Updated quota read RPC — returns one row per query_type
CREATE OR REPLACE FUNCTION get_ai_quota(p_user_id uuid)
RETURNS TABLE (
  query_type text,
  used integer,
  monthly_limit integer,
  tier text,
  resets_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_month text;
  v_resets_at timestamptz;
BEGIN
  v_month := to_char(CURRENT_DATE, 'YYYY-MM');

  SELECT subscription_tier INTO v_tier
    FROM profiles WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  v_resets_at := (date_trunc('month', CURRENT_DATE) + interval '1 month')::timestamptz;

  -- Return chat row
  RETURN QUERY
    SELECT
      'chat'::text AS query_type,
      COALESCE(
        (SELECT au.query_count FROM ai_usage au
         WHERE au.user_id = p_user_id AND au.usage_month = v_month AND au.query_type = 'chat'),
        0
      ) AS used,
      (CASE v_tier
        WHEN 'pro'  THEN 500
        WHEN 'beta' THEN 100
        WHEN 'free' THEN 50
        ELSE 50
      END) AS monthly_limit,
      v_tier AS tier,
      v_resets_at AS resets_at;

  -- Return latex row
  RETURN QUERY
    SELECT
      'latex'::text AS query_type,
      COALESCE(
        (SELECT au.query_count FROM ai_usage au
         WHERE au.user_id = p_user_id AND au.usage_month = v_month AND au.query_type = 'latex'),
        0
      ) AS used,
      (CASE v_tier
        WHEN 'pro'  THEN 1500
        WHEN 'beta' THEN 500
        WHEN 'free' THEN 150
        ELSE 150
      END) AS monthly_limit,
      v_tier AS tier,
      v_resets_at AS resets_at;
END;
$$;

-- 5. Fire-and-forget token recording RPC
-- Called AFTER the AI response to accumulate token counts for admin observability.
-- Uses atomic increment (not replace) so concurrent calls don't overwrite.
CREATE OR REPLACE FUNCTION record_token_usage(
  p_user_id uuid,
  p_query_type text,
  p_input_tokens integer,
  p_output_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_usage
    SET total_input_tokens = total_input_tokens + p_input_tokens,
        total_output_tokens = total_output_tokens + p_output_tokens
    WHERE user_id = p_user_id
      AND usage_month = to_char(CURRENT_DATE, 'YYYY-MM')
      AND query_type = p_query_type;
  -- If no row matched (shouldn't happen — increment_ai_usage creates it), silently do nothing.
END;
$$;

-- 6. Admin usage view — queryable in Supabase dashboard
CREATE OR REPLACE VIEW admin_user_ai_usage AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.email,
  p.subscription_tier,
  au.usage_month,
  au.query_type,
  au.query_count,
  au.total_input_tokens,
  au.total_output_tokens,
  au.updated_at
FROM profiles p
LEFT JOIN ai_usage au ON au.user_id = p.id
ORDER BY au.usage_month DESC, p.display_name;
