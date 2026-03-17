# Data Model: 009-ai-rate-limit

**Date**: 2026-03-17

## New Table: `ai_usage`

Tracks per-user daily AI question counts.

| Column       | Type        | Nullable | Default | FK             | Description                                     |
| ------------ | ----------- | -------- | ------- | -------------- | ----------------------------------------------- |
| `id`         | `bigint`    | NO       | auto    | —              | Auto-incrementing primary key                   |
| `user_id`    | `uuid`      | NO       | —       | `auth.users`   | The user who made the query                     |
| `usage_date` | `date`      | NO       | `now()` | —              | Calendar date (UTC) of usage                    |
| `query_count`| `integer`   | NO       | `0`     | —              | Cumulative questions asked on this date         |
| `last_model` | `text`      | YES      | `null`  | —              | Last model used (e.g., 'flash', 'pro')          |
| `created_at` | `timestamptz` | NO    | `now()` | —              | Row creation timestamp                          |
| `updated_at` | `timestamptz` | NO    | `now()` | —              | Last update timestamp                           |

**Constraints:**

- `UNIQUE(user_id, usage_date)` — one aggregate row per user per day
- `FK user_id → auth.users(id) ON DELETE CASCADE` — if user is deleted, usage records are cleaned up

**Indexes:**

- Primary key on `id`
- Unique index on `(user_id, usage_date)` — supports the upsert and serves as the lookup index

**RLS Policies:**

- Users can read their own usage: `SELECT WHERE user_id = auth.uid()`
- No direct INSERT/UPDATE from client — all writes go through an RPC function (service-level or authenticated via RPC)

## Modified Table: `profiles`

**New column:**

| Column              | Type   | Nullable | Default   | Description                                         |
| ------------------- | ------ | -------- | --------- | --------------------------------------------------- |
| `subscription_tier` | `text` | NO       | `'free'`  | User's subscription level ('free', 'pro', etc.)     |

**Why on `profiles`?** The profiles table already stores per-user metadata (email, display_name, avatar_url). Adding a tier column here avoids a new join and keeps user lookups to one table.

**Why `text` instead of `enum`?** New tiers can be added without a migration. The application validates against a known list; unrecognized tiers default to 'free'.

## RPC Function: `increment_ai_usage`

Atomic check-and-increment function. Called by the AI ask route before every Gemini call.

**Signature:**

```sql
increment_ai_usage(
  p_user_id uuid,
  p_model text DEFAULT NULL
)
RETURNS TABLE (
  current_count integer,
  daily_limit integer,
  tier text,
  is_allowed boolean
)
```

**Behavior:**

1. Look up the user's `subscription_tier` from `profiles`
2. Resolve the daily limit from the tier (using a config map within the function, or passed as a parameter)
3. Upsert into `ai_usage`: insert new row with count=1 or increment existing row's count
4. Return: new count, the limit, the tier, and whether the request is allowed (count <= limit)

**Atomicity guarantee:** The entire operation runs in a single transaction. The `INSERT ... ON CONFLICT DO UPDATE` uses Postgres row-level locking — two concurrent requests serialize at the row level, so the count is never double-incremented past the limit.

## RPC Function: `get_ai_quota`

Read-only function for the quota display endpoint.

**Signature:**

```sql
get_ai_quota(p_user_id uuid)
RETURNS TABLE (
  used integer,
  daily_limit integer,
  tier text,
  resets_at timestamptz
)
```

**Behavior:**

1. Look up the user's `subscription_tier` from `profiles`
2. Look up today's `ai_usage` row (may not exist = 0 used)
3. Return: current count (or 0), daily limit for their tier, tier name, and next midnight UTC

## Tier Limits Configuration

Tier limits are stored as a mapping inside the `increment_ai_usage` RPC function body (simple CASE statement). They can be overridden by environment variables at the application layer for non-database tier limit changes.

| Tier   | Daily Limit | Environment Variable Override |
| ------ | ----------- | ----------------------------- |
| `free` | 30          | `AI_LIMIT_FREE`              |
| `pro`  | 100         | `AI_LIMIT_PRO`               |

**Fallback:** If a user's `subscription_tier` doesn't match any known tier, they get the `free` tier limit.

## Data Flow

### AI Question (rate-limited)

```
1. Student sends question
2. POST /api/ai/ask — route handler:
   a. Authenticate user (getAuthUserId())
   b. Call RPC increment_ai_usage(user_id, model)
   c. If is_allowed = false → return 429 with friendly message
   d. If is_allowed = true → proceed with RAG search + Gemini call
3. Client receives response (or rate limit error)
4. Client optimistically decrements local quota counter
```

### Quota Check (display)

```
1. AI chat panel opens
2. GET /api/ai/quota — route handler:
   a. Authenticate user
   b. Call RPC get_ai_quota(user_id)
   c. Return { used, limit, tier, resetsAt }
3. Panel displays "X of Y remaining today"
```

### Daily Reset

```
No cron or cleanup needed.
The ai_usage table uses usage_date as part of the unique key.
When a new day (UTC) begins, the first question creates a new row
with count=1. Yesterday's row is simply never queried again.

Old rows can be cleaned up periodically (e.g., monthly) but are
not harmful — they serve as usage history for analytics.
```

## Migration

**File**: `supabase/migrations/00016_ai_rate_limiting.sql`

```sql
-- 1. Add subscription_tier to profiles
ALTER TABLE profiles
  ADD COLUMN subscription_tier text NOT NULL DEFAULT 'free';

-- 2. Create ai_usage table
CREATE TABLE ai_usage (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  query_count integer NOT NULL DEFAULT 0,
  last_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per user per day
CREATE UNIQUE INDEX ai_usage_user_date_idx ON ai_usage (user_id, usage_date);

-- Auto-update timestamp trigger (reuse existing pattern)
CREATE TRIGGER set_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Atomic increment RPC
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_model text DEFAULT NULL
)
RETURNS TABLE (
  current_count integer,
  daily_limit integer,
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
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier
    FROM profiles WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  -- Resolve limit from tier
  v_limit := CASE v_tier
    WHEN 'pro' THEN 100
    WHEN 'free' THEN 30
    ELSE 30  -- unknown tier defaults to free
  END;

  -- Atomic upsert: insert or increment
  INSERT INTO ai_usage (user_id, usage_date, query_count, last_model)
    VALUES (p_user_id, CURRENT_DATE, 1, p_model)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET
      query_count = ai_usage.query_count + 1,
      last_model = COALESCE(p_model, ai_usage.last_model),
      updated_at = now()
    RETURNING ai_usage.query_count INTO v_count;

  RETURN QUERY SELECT v_count, v_limit, v_tier, (v_count <= v_limit);
END;
$$;

-- 4. Quota read RPC
CREATE OR REPLACE FUNCTION get_ai_quota(p_user_id uuid)
RETURNS TABLE (
  used integer,
  daily_limit integer,
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
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier INTO v_tier
    FROM profiles WHERE id = p_user_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  v_limit := CASE v_tier
    WHEN 'pro' THEN 100
    WHEN 'free' THEN 30
    ELSE 30
  END;

  -- Get today's usage (0 if no row exists)
  SELECT COALESCE(au.query_count, 0) INTO v_used
    FROM ai_usage au
    WHERE au.user_id = p_user_id AND au.usage_date = CURRENT_DATE;

  IF v_used IS NULL THEN
    v_used := 0;
  END IF;

  -- Next midnight UTC
  RETURN QUERY SELECT v_used, v_limit, v_tier,
    (CURRENT_DATE + interval '1 day')::timestamptz;
END;
$$;
```
