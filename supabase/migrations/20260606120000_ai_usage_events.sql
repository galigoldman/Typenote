-- AI usage analytics: append-only per-call event log.
--
-- One row per AI call. This is the single source of truth for usage analytics
-- (per-query, per-day, per-month, per-document). ai_usage stays the rate-limit
-- counter (hot enforcement path); this table is the read model for reporting.
-- No question text is stored — numbers only (PII-safe).
CREATE TABLE public.ai_usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_type    text NOT NULL CHECK (query_type IN ('chat','latex','embedding')),
  model         text NOT NULL,                 -- 'flash' | 'pro' | 'embedding'
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  course_id     uuid REFERENCES public.courses(id)   ON DELETE SET NULL,
  document_id   uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_events_user_created_idx
  ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX ai_usage_events_document_idx
  ON public.ai_usage_events (document_id)
  WHERE document_id IS NOT NULL;
CREATE INDEX ai_usage_events_course_created_idx
  ON public.ai_usage_events (course_id, created_at DESC)
  WHERE course_id IS NOT NULL;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Users may read their own events; admin dashboard reads bypass RLS via the
-- service-role client. No INSERT policy for normal clients — events are written
-- server-side only (service-role / SECURITY DEFINER contexts).
CREATE POLICY "Users can view their own usage events"
  ON public.ai_usage_events FOR SELECT
  USING (auth.uid() = user_id);
