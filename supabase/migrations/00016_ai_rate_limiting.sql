-- 009-ai-rate-limit: Per-user monthly AI query caps with subscription tiers
--
-- Why this migration?
-- No rate limiting exists on AI endpoints. A single user can run up unlimited
-- API costs. This adds: (1) a subscription_tier column to profiles for tier-based
-- limits, (2) an ai_usage table tracking per-user monthly question counts, and
-- (3) two RPC functions — one for atomic check-and-increment (called before every
-- Gemini call), and one for reading quota (called by the chat panel UI).
--
-- Why monthly instead of daily?
-- Monthly quotas align with billing cycles and feel less restrictive to users.
-- A student who has a heavy study day shouldn't be penalized — they can use
-- their full allocation whenever they need it most.
--
-- Interview concepts:
-- - Atomic upsert (INSERT ON CONFLICT): prevents TOCTOU race conditions
-- - SECURITY DEFINER functions: execute with the function owner's privileges
-- - Fail-closed rate limiting: if the DB is down, requests are rejected

-- 1. Add subscription_tier to profiles
-- Why text instead of enum? New tiers can be added without a migration.
-- The application validates against a known list; unrecognized tiers default to 'free'.
ALTER TABLE profiles
  ADD COLUMN subscription_tier text NOT NULL DEFAULT 'free';

-- 2. Create ai_usage table
-- One row per user per month. The query_count is incremented atomically via RPC.
-- usage_month is stored as text 'YYYY-MM' for simple comparison and grouping.
CREATE TABLE ai_usage (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_month text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  query_count integer NOT NULL DEFAULT 0,
  last_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per user per month (also serves as the lookup index)
CREATE UNIQUE INDEX ai_usage_user_month_idx ON ai_usage (user_id, usage_month);

-- Auto-update timestamp trigger (reuses existing function from 00001_initial_schema)
CREATE TRIGGER set_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Atomic increment RPC
-- Called by POST /api/ai/ask before every Gemini call.
-- Uses INSERT ON CONFLICT to atomically check + increment in a single statement.
-- Postgres row-level locking ensures two concurrent requests can't both read
-- count=29 and both write count=30 — they serialize at the row level.
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_model text DEFAULT NULL
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

  -- Resolve limit from tier
  -- To add a new tier: add a WHEN clause here and update the RPC.
  -- Application-layer env var overrides (AI_LIMIT_FREE, AI_LIMIT_PRO) take
  -- precedence when set — see src/lib/ai/rate-limit.ts.
  v_limit := CASE v_tier
    WHEN 'pro' THEN 500
    WHEN 'free' THEN 50
    ELSE 50  -- unknown tier defaults to free
  END;

  -- Atomic upsert: insert with count=1 or increment existing row
  INSERT INTO ai_usage (user_id, usage_month, query_count, last_model)
    VALUES (p_user_id, v_month, 1, p_model)
    ON CONFLICT (user_id, usage_month)
    DO UPDATE SET
      query_count = ai_usage.query_count + 1,
      last_model = COALESCE(p_model, ai_usage.last_model),
      updated_at = now()
    RETURNING ai_usage.query_count INTO v_count;

  RETURN QUERY SELECT v_count, v_limit, v_tier, (v_count <= v_limit);
END;
$$;

-- 4. Quota read RPC
-- Called by GET /api/ai/quota to display remaining questions in the chat panel.
-- Read-only — does not modify any data.
CREATE OR REPLACE FUNCTION get_ai_quota(p_user_id uuid)
RETURNS TABLE (
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
  v_limit integer;
  v_used integer;
  v_month text;
BEGIN
  v_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier
    FROM profiles WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  v_limit := CASE v_tier
    WHEN 'pro' THEN 500
    WHEN 'free' THEN 50
    ELSE 50
  END;

  -- Get current month's usage (0 if no row exists yet)
  SELECT COALESCE(au.query_count, 0) INTO v_used
    FROM ai_usage au
    WHERE au.user_id = p_user_id AND au.usage_month = v_month;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  -- First day of next month at midnight UTC
  RETURN QUERY SELECT v_used, v_limit, v_tier,
    (date_trunc('month', CURRENT_DATE) + interval '1 month')::timestamptz;
END;
$$;
