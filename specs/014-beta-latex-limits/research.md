# Research: 014-beta-latex-limits

**Date**: 2026-03-23
**Branch**: `014-beta-latex-limits`

## 1. Current Rate Limiting Architecture

### Decision: Extend existing atomic RPC pattern (not replace)

**Rationale**: The current system uses Postgres RPC functions (`increment_ai_usage`, `get_ai_quota`) with atomic upsert for race-safe counting. This pattern is proven and works. We extend it with a `query_type` dimension rather than building a new system.

**Alternatives considered**:

- **Application-layer counting** — rejected because it's vulnerable to race conditions (TOCTOU), which is why the existing system uses DB-level atomicity.
- **Redis-based rate limiting** — rejected because it adds infrastructure complexity for no gain. Postgres RPC is already fast enough for the query volume (~100-500/user/month).
- **Separate tables per query type** — rejected because a single table with a `query_type` discriminator is simpler and the unique index `(user_id, usage_month, query_type)` handles separation cleanly.

## 2. Query Type Separation Strategy

### Decision: Add `query_type` column to `ai_usage` table

**Rationale**: The current `ai_usage` table has one row per user per month. Adding `query_type TEXT NOT NULL DEFAULT 'chat'` and updating the unique index from `(user_id, usage_month)` to `(user_id, usage_month, query_type)` gives us separate counters with minimal schema change.

**Values**: `'chat'` (AI tutor questions), `'latex'` (LaTeX conversions).

**Migration approach**: The existing `increment_ai_usage` RPC needs a new `p_query_type` parameter. Existing rows default to `'chat'`. The RPC's limit resolution switches on both tier AND query type.

## 3. Observability — Fire-and-Forget Token Tracking

### Decision: Store cumulative token counts via async UPDATE after each AI call

**Rationale**: Token counts are useful for admins to see actual consumption, but they must NOT block or complicate the rate limiting path. The approach: the atomic RPC (`increment_ai_usage`) handles only the query count and limit check (before the AI call). After the AI call completes, a separate `UPDATE ai_usage SET total_input_tokens = total_input_tokens + X, total_output_tokens = total_output_tokens + Y` fires asynchronously. If it fails, the query still succeeds — we just lose that one data point.

- **LaTeX**: `generateText` returns `result.usage` synchronously — trivial.
- **Chat streaming**: capture usage after the stream finishes in the `finally` block where we already persist the assistant message.

**Alternatives considered**:

- **Atomic token tracking in the RPC** — rejected because tokens are unknown before the AI call, and the RPC runs before the call.
- **No token tracking at all** — rejected because admins want to see actual consumption, not just query counts.
- **Per-query log table** — rejected for beta (overkill).

**Admin view**: Postgres VIEW (`admin_user_ai_usage`) with query counts + token totals per user per month per type.

## 4. Deep Mode Restriction

### Decision: Server-side enforcement + UI lockout

**Rationale**: The `/api/ai/ask` route already receives `mode: 'quick' | 'deep'`. We add a tier check: if the user's tier is not `'pro'`, reject `mode: 'deep'` with a 403 and descriptive message. The UI also disables/locks the deep mode toggle for non-pro users, showing it as a premium feature.

**How to get tier on the client**: The existing `/api/ai/quota` endpoint already returns `tier`. The chat panel already fetches this. We use `quota.tier` to conditionally render the mode toggle.

## 5. Course Context for LaTeX

### Decision: Pass `courseName` as optional body parameter to `/api/ai/latex`, append one line to prompt

**Rationale**: The LaTeX callers (math-node-view, tiptap-editor, canvas-editor) all have access to the course context through their parent props or page context. We pass `courseName` alongside `text` in the POST body. The `convertToLatex` function appends `\nCourse: {courseName}` to the user prompt (not the system prompt) to keep it minimal.

**Token impact**: ~10-15 extra tokens per query when course name is present. Negligible cost impact.

## 6. LaTeX Quota Limits

### Decision: Separate env var pattern `AI_LATEX_LIMIT_{TIER}`

**Rationale**: Follows the existing `AI_LIMIT_{TIER}` pattern for chat limits. The application-layer `resolveLimitForTier` function is extended to accept a query type parameter and look up the appropriate env var.

**Default limits**:

| Tier | Chat | LaTeX |
| ---- | ---- | ----- |
| free | 50   | 150   |
| beta | 100  | 500   |
| pro  | 500  | 1500  |
