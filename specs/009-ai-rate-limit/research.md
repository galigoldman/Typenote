# Research: 009-ai-rate-limit

**Date**: 2026-03-17

## Decision 1: Usage Tracking Strategy — Per-Day Row vs. Per-Query Row

**Decision**: Use a **per-user-per-day aggregate row** in an `ai_usage` table with an atomic counter. One row per (user_id, usage_date) pair.

**Rationale**:

- The primary operation is "check + increment" — a single row per day makes this a simple `INSERT ... ON CONFLICT DO UPDATE SET query_count = query_count + 1 RETURNING query_count`
- This is a Supabase RPC (Postgres function) to guarantee atomicity — the check and increment happen in one database round-trip, preventing race conditions from concurrent requests
- Row count stays small (1 row per user per day) — no performance concerns even without partition pruning
- Still captures the model used for each query via a separate `model` column (last model used) or a JSONB breakdown

**Alternatives considered**:

- **One row per query**: Full audit trail but creates many rows (30+ per user per day). Quota check requires `COUNT(*)` with date filter on every request — slower under load. Rejected — overkill for current needs; can add a detailed log table later if needed.
- **In-memory counter (Redis/Edge Config)**: Ultra-fast reads but adds infrastructure dependency. Supabase doesn't include Redis. Rejected — unnecessary complexity; Postgres is fast enough for this use case (sub-5ms for an indexed row lookup + update).
- **Client-side counter**: No enforcement — trivially bypassable. Rejected.

## Decision 2: Subscription Tier Storage

**Decision**: Add a `subscription_tier` column to the existing `profiles` table (default: `'free'`). Store tier limits in a config map within the application code, overridable by environment variables.

**Rationale**:

- The profiles table already exists with RLS and triggers — adding one column is minimal schema change
- Only two tiers exist at launch — a full `subscription_tiers` lookup table is premature
- Environment variables (`AI_LIMIT_FREE=30`, `AI_LIMIT_PRO=100`) allow ops-level changes without code deploy
- Application-level config map serves as the fallback when env vars aren't set
- When real billing arrives, the tier column is already there — just update it programmatically

**Alternatives considered**:

- **Separate `subscription_tiers` table**: Normalized, supports unlimited tiers via DB config. Rejected for now — only 2 tiers, would need a join on every request for no benefit. Can migrate to this later when real billing is added.
- **Store tier in JWT claims**: Instant access at edge, no DB lookup. Rejected — Supabase custom claims require auth hooks or session refresh; adds auth complexity for minimal gain.
- **Feature flags (Edge Config)**: Tier limits as feature flags. Rejected — Typenote uses Supabase, not Vercel's managed infrastructure.

## Decision 3: Atomic Increment Mechanism

**Decision**: Use a Supabase RPC (Postgres function) that atomically checks the current count, increments it, and returns the result in a single database call.

**Rationale**:

- `INSERT ... ON CONFLICT (user_id, usage_date) DO UPDATE SET query_count = query_count + 1 RETURNING query_count` is a single atomic SQL statement
- No race conditions — Postgres row-level locking ensures two concurrent requests can't both read count=29 and both write count=30
- The RPC returns the new count AND the user's tier limit in one call — the route handler makes exactly one DB round-trip for the rate limit check
- This is a textbook upsert pattern in Postgres, well-documented and reliable

**Alternatives considered**:

- **SELECT then UPDATE (two queries)**: Read count, check in application, then update. Rejected — classic TOCTOU race condition. Two concurrent requests could both read count=29 and both proceed.
- **Advisory locks**: `pg_advisory_lock` around check+increment. Rejected — unnecessary heavyweight locking when the upsert pattern handles it.

## Decision 4: Fail-Closed Behavior

**Decision**: If the rate limit check (RPC call) fails for any reason (database error, network timeout), reject the AI request. Never allow an untracked query through.

**Rationale**:

- The purpose of rate limiting is cost protection. A database outage shouldn't become a cost spike.
- Fail-closed is the standard pattern for rate limiters — AWS API Gateway, Cloudflare, Stripe all use this approach.
- The user gets a clear error message ("Service temporarily unavailable") rather than a silent cost accumulation.

**Trade-offs**:

- A Supabase outage blocks all AI usage (not just rate limiting). This is acceptable because the AI endpoint already depends on Supabase for auth and RAG search — if Supabase is down, the AI can't function anyway.

## Decision 5: Quota Display API

**Decision**: Create a new lightweight API endpoint (`GET /api/ai/quota`) that returns the user's current usage, daily limit, and tier. The chat panel calls this on mount and updates optimistically after each question.

**Rationale**:

- Separating quota info from the AI ask endpoint keeps concerns clean
- The chat panel needs quota before the first question is sent (to show the indicator)
- After sending a question, the client optimistically decrements the local counter — no extra API call needed
- If the quota endpoint fails, the chat panel can still function (just without the quota indicator) — quota enforcement remains server-side

**Alternatives considered**:

- **Return quota in the AI ask response**: Mixes concerns, doesn't help before the first question. Rejected.
- **Embed in page props (SSR)**: Requires passing through Server Components → Client Components. Works but couples quota to the page data flow. Rejected — a dedicated endpoint is cleaner and cacheable.
- **WebSocket for real-time updates**: Overkill — quota changes once per question, not continuously. Rejected.
