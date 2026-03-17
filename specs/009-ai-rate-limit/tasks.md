# Tasks: AI Rate Limiting

**Feature**: 009-ai-rate-limit | **Branch**: `009-ai-rate-limit`
**Generated**: 2026-03-17 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Phase 1: Setup

- [ ] T001 Verify branch `009-ai-rate-limit` is checked out and up-to-date with `origin/main`

## Phase 2: Foundation (Database + Types)

_Must complete before any user story. Creates the `ai_usage` table, `subscription_tier` column, and both RPC functions._

- [ ] T002 Create migration `supabase/migrations/00016_ai_rate_limiting.sql` per data-model.md: add `subscription_tier text NOT NULL DEFAULT 'free'` to `profiles` table
- [ ] T003 In the same migration file `supabase/migrations/00016_ai_rate_limiting.sql`: create `ai_usage` table with columns (id bigserial PK, user_id uuid FK→auth.users ON DELETE CASCADE, usage_date date DEFAULT CURRENT_DATE, query_count integer DEFAULT 0, last_model text, created_at timestamptz, updated_at timestamptz), unique index on (user_id, usage_date), RLS policy for SELECT where user_id = auth.uid(), and updated_at trigger reusing `update_updated_at_column()`
- [ ] T004 In the same migration file `supabase/migrations/00016_ai_rate_limiting.sql`: create `increment_ai_usage(p_user_id uuid, p_model text)` RPC function (SECURITY DEFINER, plpgsql) that looks up user tier from profiles, resolves limit via CASE (free→30, pro→100, else→30), performs atomic INSERT ON CONFLICT upsert, returns (current_count, daily_limit, tier, is_allowed) per data-model.md
- [ ] T005 In the same migration file `supabase/migrations/00016_ai_rate_limiting.sql`: create `get_ai_quota(p_user_id uuid)` RPC function (SECURITY DEFINER, plpgsql) that returns (used, daily_limit, tier, resets_at) — looks up tier, gets today's count or 0, calculates next midnight UTC per data-model.md
- [ ] T006 Run `supabase db reset` to verify the full migration chain replays cleanly
- [ ] T007 Update `supabase/seed.sql`: set test user's `subscription_tier` to `'free'` and add a sample `ai_usage` row for the test user with a few queries
- [ ] T008 Create `src/lib/ai/rate-limit.ts` with TypeScript types and helper functions: `RateLimitResult` type (currentCount, dailyLimit, tier, isAllowed), `QuotaInfo` type (used, limit, remaining, tier, resetsAt), `checkAndIncrementUsage(userId: string, model: string)` that calls the `increment_ai_usage` RPC and applies env var overrides (AI_LIMIT_FREE, AI_LIMIT_PRO), `getQuota(userId: string)` that calls the `get_ai_quota` RPC and returns `QuotaInfo`
- [ ] T009 Write integration test `src/lib/queries/ai-usage.integration.test.ts`: test increment_ai_usage creates row on first call, increments on subsequent calls, returns is_allowed=false when exceeding limit, handles unknown tier as free; test get_ai_quota returns 0 when no row exists, returns correct count after increments; test that changing user tier mid-day updates the limit on next check

## Phase 3: User Story 1 — Free Tier Daily Limit Enforcement (P1)

_Goal: Block AI requests when daily quota is exhausted. Returns 429 with friendly message._

**Independent test**: Log in as free-tier user. Send 30+ questions. Verify the 31st returns 429 with friendly message. Verify reset after midnight UTC.

- [ ] T010 [US1] Modify `src/app/api/ai/ask/route.ts`: after the existing auth check (getAuthUserId), add rate limit check by calling `checkAndIncrementUsage(userId, mode)` from `src/lib/ai/rate-limit.ts`. If `isAllowed === false`, return Response with status 429 and JSON body `{ error: "rate_limited", message: "You've used all {limit} of your daily AI questions. Your quota resets at midnight UTC.", used, limit, resetsAt }` per contracts/rate-limit-api.md
- [ ] T011 [US1] In the same route modification `src/app/api/ai/ask/route.ts`: wrap the `checkAndIncrementUsage` call in try/catch — if the RPC call throws, return Response with status 503 and JSON body `{ error: "service_unavailable", message: "AI service is temporarily unavailable. Please try again in a moment." }` (fail-closed behavior per FR-007)
- [ ] T012 [US1] Write unit test `src/app/api/ai/ask/rate-limit.test.ts`: mock `checkAndIncrementUsage` to test three scenarios — (1) isAllowed=true proceeds to Gemini call, (2) isAllowed=false returns 429 with correct body fields, (3) RPC throws returns 503. Verify Gemini is NOT called when rate limited (mock `buildAiContext` and verify it's not reached)

## Phase 4: User Story 2 — Quota Visibility in Chat Panel (P1)

_Goal: Show remaining quota indicator in AI chat panel with visual warnings._

**Independent test**: Open AI chat panel. Verify quota indicator shows "X of Y remaining". Send a question. Verify counter decrements. When ≤5 remaining, indicator turns amber/red. At 0, input is disabled.

- [ ] T013 [P] [US2] Create `src/app/api/ai/quota/route.ts`: GET handler that authenticates user via `getAuthUserId()` (import from existing ai-context.ts pattern), calls `getQuota(userId)` from `src/lib/ai/rate-limit.ts`, returns JSON `{ used, limit, remaining: Math.max(0, limit - used), tier, resetsAt }`. Handle 401 for unauthenticated, 500 for RPC failure per contracts/rate-limit-api.md
- [ ] T014 [US2] Modify `src/components/ai/ai-chat-panel.tsx`: add `quota` state (`QuotaInfo | null`), fetch `GET /api/ai/quota` on mount (when `isOpen` becomes true), populate quota state. If fetch fails, set quota to null (don't block usage — enforcement is server-side)
- [ ] T015 [US2] In `src/components/ai/ai-chat-panel.tsx`: render quota indicator below the mode toggle or above the input area — show "X of Y questions remaining today" in muted text. When `remaining ≤ 5`, apply amber/warning text color. When `remaining === 0`, show "No questions remaining — resets at midnight UTC" and disable the textarea + send button
- [ ] T016 [US2] In `src/components/ai/ai-chat-panel.tsx`: after a successful question send (when streaming completes or 'done' event received), optimistically decrement `quota.remaining` by 1 and increment `quota.used` by 1 in local state. Handle 429 response from `/api/ai/ask`: parse the JSON error body, update quota state from the response (used, limit, resetsAt), display the `message` field as an assistant message in the chat, and disable input
- [ ] T017 [US2] Write unit test `src/components/ai/ai-chat-panel.test.ts`: test quota indicator renders with correct remaining count, indicator changes color class when remaining ≤ 5, input is disabled when remaining = 0, 429 response shows friendly message and disables input

## Phase 5: User Story 3 — Multiple Subscription Levels (P1)

_Goal: Ensure tier-aware limits with configurable caps. All tier logic is already in the RPC functions (Phase 2) and rate-limit helper (T008). This phase validates configurability end-to-end._

**Independent test**: Set test user's tier to 'pro' in DB. Verify quota endpoint returns limit=100. Change back to 'free'. Verify limit=30. Set env var `AI_LIMIT_PRO=200`, verify limit changes without code deploy.

- [ ] T018 [US3] In `src/lib/ai/rate-limit.ts`: ensure `checkAndIncrementUsage` reads `AI_LIMIT_FREE` and `AI_LIMIT_PRO` from `process.env` and overrides the RPC-returned `dailyLimit` when the env var is set and the tier matches. Add validation: parse as integer, ignore if NaN or ≤ 0, log warning for invalid values. Also support dynamic tier names — if env var `AI_LIMIT_{TIER_UPPERCASE}` exists (e.g., `AI_LIMIT_TEAM`), use its value as the limit for that tier
- [ ] T019 [US3] In `src/lib/ai/rate-limit.ts`: ensure `getQuota` also applies the same env var override logic so the quota endpoint returns the overridden limit (user sees the actual limit, not the DB default)
- [ ] T020 [US3] Write unit test `src/lib/ai/rate-limit.test.ts`: test env var override — mock process.env.AI_LIMIT_FREE='50', verify checkAndIncrementUsage returns dailyLimit=50 for free tier. Test AI_LIMIT_PRO='200'. Test invalid env var (NaN, negative) falls back to DB default. Test dynamic tier name resolution (AI_LIMIT_TEAM='500')

## Phase 6: User Story 4 — Admin Usage Visibility (P2)

_Goal: Usage data queryable in ai_usage table for admin analysis. No UI needed._

**Independent test**: Query `ai_usage` table directly. Verify rows contain user_id, usage_date, query_count, last_model after AI questions are sent.

- [ ] T021 [US4] Verify that the `ai_usage` table and `increment_ai_usage` RPC (created in Phase 2) correctly record `last_model` with the mode value ('flash' or 'pro') passed from the ask route. Confirm in integration test `src/lib/queries/ai-usage.integration.test.ts` that after multiple calls with different models, the last_model field reflects the most recent model used
- [ ] T022 [US4] Add a query example to `specs/009-ai-rate-limit/quickstart.md` showing how to run admin analytics queries: total queries per user per day, top users by usage, model breakdown (flash vs pro), and usage trends over time — useful for future admin dashboard

## Phase 7: Polish & Cross-Cutting

- [ ] T023 Run `pnpm test` — verify all existing tests still pass (no regressions)
- [ ] T024 Run `pnpm lint` — verify zero lint errors
- [ ] T025 Run `pnpm build` — verify the build succeeds with the new route and modified components
- [ ] T026 Manual verification: full flow — open AI chat panel, verify quota shows, send questions, verify counter decrements, send until limit reached, verify 429 with friendly message, verify input disabled
- [ ] T027 Manual verification: change test user's `subscription_tier` to 'pro' in Supabase Studio → verify quota endpoint returns limit=100 → change back to 'free' → verify limit=30
- [ ] T028 Manual verification: set `AI_LIMIT_FREE=10` in `.env.local` → restart dev server → verify quota shows 10 limit instead of 30 (env override working)
- [ ] T029 Run `supabase db reset` one final time to confirm migration chain is clean

## Dependencies

```
Phase 2 (Foundation) ─────────────────────────┐
    │                                          │
    ▼                                          ▼
Phase 3 (US1: Enforcement)     Phase 4 (US2: Quota Display)
    │                                          │
    ▼                                          ▼
Phase 5 (US3: Configurable Tiers) ◄────────────┘
    │
    ▼
Phase 6 (US4: Admin Visibility)
    │
    ▼
Phase 7 (Polish)
```

### Parallel Opportunities

- **T013 (quota route)** can be developed in parallel with **T010–T011 (ask route enforcement)** — different files, no dependency
- **T002–T005** (migration sections) are written in one file but are logically independent SQL blocks
- **T017** (chat panel test) and **T012** (ask route test) can be written in parallel
- **T021** (admin visibility verification) can run anytime after Phase 2

## Implementation Strategy

### MVP (Ship First)

Phase 2 + Phase 3 (US1) = **rate limit enforcement without UI**. The system blocks requests at the limit; users see a JSON error. This is the minimum protection against cost overruns.

### Full Feature

Add Phase 4 (US2) for quota visibility, Phase 5 (US3) for confirmed configurability, Phase 6 (US4) for admin queries. Polish in Phase 7.

### Task Summary

| Phase     | Story                 | Tasks  | Key Files                                                                                 |
| --------- | --------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 1         | Setup                 | 1      | —                                                                                         |
| 2         | Foundation            | 8      | `00016_ai_rate_limiting.sql`, `rate-limit.ts`, `seed.sql`, `ai-usage.integration.test.ts` |
| 3         | US1: Enforcement      | 3      | `ask/route.ts`, `rate-limit.test.ts`                                                      |
| 4         | US2: Quota Display    | 5      | `quota/route.ts`, `ai-chat-panel.tsx`, `ai-chat-panel.test.ts`                            |
| 5         | US3: Config Tiers     | 3      | `rate-limit.ts`, `rate-limit.test.ts`                                                     |
| 6         | US4: Admin Visibility | 2      | `ai-usage.integration.test.ts`, `quickstart.md`                                           |
| 7         | Polish                | 7      | —                                                                                         |
| **Total** |                       | **29** |                                                                                           |
