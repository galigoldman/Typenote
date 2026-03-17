# Quickstart: 009-ai-rate-limit

## What This Feature Does

Adds per-user daily AI question limits. Each user has a subscription tier (free: 30/day, pro: 100/day) that determines how many AI questions they can ask. The AI chat panel shows remaining quota, and the system blocks requests when the limit is reached with a friendly message.

## Architecture Overview

```
Student sends question
        ↓
POST /api/ai/ask
  → getAuthUserId()
  → RPC: increment_ai_usage(user_id, model)
        ↓
  ┌─────────────────────────┐
  │ is_allowed = true?      │
  │                         │
  │  YES → proceed with     │  NO → return 429
  │        RAG + Gemini     │       { error: "rate_limited",
  │        (existing flow)  │         message: "...",
  │                         │         used, limit, resetsAt }
  └─────────────────────────┘
        ↓
Streaming SSE response (existing)
        ↓
Client decrements local quota counter
```

## Key Changes by Layer

### Database (1 migration: `00016_ai_rate_limiting.sql`)

- **New table `ai_usage`**: Tracks per-user per-day question counts. One row per (user_id, date) pair.
- **Modified `profiles`**: Add `subscription_tier text DEFAULT 'free'` column.
- **New RPC `increment_ai_usage`**: Atomic check + increment. Returns count, limit, tier, is_allowed.
- **New RPC `get_ai_quota`**: Read-only quota query for the chat panel indicator.

### Server (Route Handlers)

- **Modified `POST /api/ai/ask`**: Calls `increment_ai_usage` before Gemini call. Returns 429 when quota exceeded, 503 when rate limit check fails.
- **New `GET /api/ai/quota`**: Returns current usage, limit, tier, and reset time.

### Client (React Components)

- **Modified `ai-chat-panel.tsx`**: Fetches quota on mount, shows remaining indicator, handles 429 error with friendly message, visual low-quota warning.

### Configuration

- **Environment variables**: `AI_LIMIT_FREE` (default: 30), `AI_LIMIT_PRO` (default: 100) — override defaults without code changes.

## Development Order

1. **Migration + RPC functions** — create `ai_usage` table, add `subscription_tier` to profiles, create both RPC functions
2. **Quota API endpoint** — `GET /api/ai/quota` route handler
3. **Rate limit enforcement** — modify `POST /api/ai/ask` to call `increment_ai_usage` before Gemini
4. **Quota display** — modify chat panel to show remaining count and handle 429 responses
5. **Tests** — integration tests for RPC functions, unit tests for route handlers, e2e for quota enforcement flow

## Admin Analytics Queries (Supabase SQL Editor)

These queries can be run directly in the Supabase SQL Editor or Studio for usage analysis.

**Total queries per user per day (last 7 days):**

```sql
SELECT p.email, au.usage_date, au.query_count, au.last_model
FROM ai_usage au
JOIN profiles p ON p.id = au.user_id
WHERE au.usage_date >= CURRENT_DATE - interval '7 days'
ORDER BY au.usage_date DESC, au.query_count DESC;
```

**Top users by total usage:**

```sql
SELECT p.email, p.subscription_tier, SUM(au.query_count) AS total_queries
FROM ai_usage au
JOIN profiles p ON p.id = au.user_id
GROUP BY p.id, p.email, p.subscription_tier
ORDER BY total_queries DESC
LIMIT 20;
```

**Model breakdown (Flash vs Pro usage):**

```sql
SELECT last_model, COUNT(*) AS days_used, SUM(query_count) AS total_queries
FROM ai_usage
WHERE last_model IS NOT NULL
GROUP BY last_model;
```

**Users who hit their limit today:**

```sql
SELECT p.email, au.query_count, p.subscription_tier,
  CASE p.subscription_tier WHEN 'pro' THEN 100 ELSE 30 END AS daily_limit
FROM ai_usage au
JOIN profiles p ON p.id = au.user_id
WHERE au.usage_date = CURRENT_DATE
  AND au.query_count >= CASE p.subscription_tier WHEN 'pro' THEN 100 ELSE 30 END;
```

## Interview Talking Points

- **Why atomic upsert (INSERT ON CONFLICT)?** Prevents the classic TOCTOU (time-of-check-time-of-use) race condition. Two concurrent requests can't both read count=29 and both proceed — Postgres row-level locking serializes the updates. This is a common distributed systems interview topic.
- **Why fail-closed?** If the rate limit database call fails, we reject the request rather than allowing it through untracked. This is the standard pattern for cost-protection systems — AWS API Gateway, Cloudflare Workers, and Stripe all fail-closed on rate limit checks. The alternative (fail-open) turns every database outage into a potential cost spike.
- **Why per-day aggregate rows instead of per-query rows?** The primary read pattern is "how many queries today?" — an aggregate row answers this in O(1) with no counting. Per-query rows would require `COUNT(*)` on every request. The trade-off is less granular audit trail, but that's not needed yet.
- **Why store tier on profiles instead of a separate table?** With only 2 tiers, a join table is premature normalization. The column can be updated programmatically when billing is added. This is a conscious denormalization trade-off — simpler queries now, easy to refactor later.
- **Why environment variables for limits?** Decouples operational decisions (changing a limit from 30 to 50) from code deployments. This is the twelve-factor app principle of storing config in the environment.
- **Why RPC (Postgres functions) instead of application-level logic?** The atomic guarantee lives in the database, not the application. Even if the app layer has a bug or race condition, the database function ensures correctness. This is defense-in-depth — the most critical invariant (never exceed the limit) is enforced at the lowest level.
