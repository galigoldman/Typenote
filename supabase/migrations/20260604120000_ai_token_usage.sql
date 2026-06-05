-- AI usage admin dashboard: accurate per-model token cost ledger.
--
-- Why a new table instead of more columns on ai_usage?
-- ai_usage is the RATE-LIMIT ledger (query_count per query_type, drives the
-- atomic quota RPC). Token COST has a different grain — it must be split by
-- model (flash/pro/embedding) so a user who mixes Flash + Pro is priced
-- correctly. Single-responsibility tables: ai_usage counts queries,
-- ai_token_usage accounts tokens.

-- 1. Cost ledger table
CREATE TABLE public.ai_token_usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_month   text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  model         text NOT NULL,            -- 'flash' | 'pro' | 'embedding'
  input_tokens  bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_token_usage_user_month_model_idx
  ON public.ai_token_usage (user_id, usage_month, model);

CREATE TRIGGER ai_token_usage_updated_at
  BEFORE UPDATE ON public.ai_token_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

-- Users may read their own token rows; admin reads bypass RLS via service role.
CREATE POLICY "Users can view their own token usage"
  ON public.ai_token_usage FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Replace record_token_usage: key by MODEL, and UPSERT (embedding rows never
-- pass through increment_ai_usage, so the row may not exist yet).
-- Param names change (p_query_type -> p_model), so DROP then CREATE.
DROP FUNCTION IF EXISTS public.record_token_usage(uuid, text, integer, integer);

CREATE FUNCTION public.record_token_usage(
  p_user_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.ai_token_usage (user_id, usage_month, model, input_tokens, output_tokens)
    VALUES (p_user_id, to_char(CURRENT_DATE, 'YYYY-MM'), p_model, p_input_tokens, p_output_tokens)
    ON CONFLICT (user_id, usage_month, model)
    DO UPDATE SET
      input_tokens  = public.ai_token_usage.input_tokens  + p_input_tokens,
      output_tokens = public.ai_token_usage.output_tokens + p_output_tokens,
      updated_at    = now();
END;
$$;

-- 3. Security fix + cleanup of the old zeroed columns.
-- The admin_user_ai_usage VIEW referenced these columns, so drop the view first.
-- It was created without security_invoker (RLS-bypass leak) and joined every
-- user's email — recreate it security_invoker and REVOKE from public roles.
DROP VIEW IF EXISTS public.admin_user_ai_usage;

ALTER TABLE public.ai_usage
  DROP COLUMN IF EXISTS total_input_tokens,
  DROP COLUMN IF EXISTS total_output_tokens;

CREATE VIEW public.admin_user_ai_usage
  WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.email,
  p.subscription_tier,
  au.usage_month,
  au.query_type,
  au.query_count,
  au.updated_at
FROM public.profiles p
LEFT JOIN public.ai_usage au ON au.user_id = p.id
ORDER BY au.usage_month DESC, p.display_name;

REVOKE ALL ON public.admin_user_ai_usage FROM anon, authenticated;
