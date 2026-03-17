# Implementation Plan: AI Rate Limiting

**Branch**: `009-ai-rate-limit` | **Date**: 2026-03-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-ai-rate-limit/spec.md`

## Summary

Add per-user daily AI question limits to prevent unlimited API costs. A new `ai_usage` table tracks queries per user per day. A `subscription_tier` column on `profiles` determines each user's daily cap (free: 30, pro: 100). An atomic Postgres RPC function (`increment_ai_usage`) checks and increments the count before every Gemini call. The AI chat panel displays remaining quota and shows a friendly message when the limit is reached.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+ + Next.js 16 (App Router)
**Primary Dependencies**: `@google/genai`, Supabase SSR (`@supabase/ssr`)
**Storage**: PostgreSQL via Supabase (`ai_usage` table, `profiles` table modification)
**Testing**: Vitest (unit/integration), Playwright (e2e)
**Target Platform**: Web (Next.js App Router)
**Project Type**: Web application (full-stack)
**Performance Goals**: Rate limit check adds <50ms to request latency; quota endpoint responds in <100ms
**Constraints**: Must use Supabase RPC for atomic increment; no external caching layer; fail-closed on errors
**New Dependencies**: None — uses existing Supabase client infrastructure

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Check

| Principle                       | Status | Notes                                                                                                                                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Incremental Development      | PASS   | Migration first → RPC functions → server route changes → client UI. Each phase produces a testable increment.                                          |
| II. Test-Driven Quality         | PASS   | Integration tests for RPC functions and migration, unit tests for route handlers, e2e for full enforcement flow.                                       |
| III. Protected Main Branch      | PASS   | Working on `009-ai-rate-limit` branch. Will PR to main.                                                                                                |
| IV. Migrations as Code          | PASS   | Single migration `00016_ai_rate_limiting.sql` creates table, adds column, and defines RPC functions. Will verify with `supabase db reset`.              |
| V. Interview-Ready Architecture | PASS   | Key concepts: atomic upsert, TOCTOU prevention, fail-closed pattern, defense-in-depth (DB-level enforcement). Documented in quickstart.md.             |

### Post-Phase 1 Check

| Principle                       | Status | Notes                                                                                                   |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Data model (migration) → server route (enforcement) → client UI (display). Clean incremental phases.    |
| II. Test-Driven Quality         | PASS   | Integration tests for both RPC functions. Unit tests for quota route and ask route rate limit logic.     |
| IV. Migrations as Code          | PASS   | Single migration file with table, column, indexes, RLS, triggers, and 2 RPC functions.                  |
| V. Interview-Ready Architecture | PASS   | Atomic upsert pattern, fail-closed, env-configurable tiers, defense-in-depth enforcement.               |

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-rate-limit/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — schema changes
├── quickstart.md        # Phase 1 output — development guide
├── contracts/           # Phase 1 output — interface contracts
│   └── rate-limit-api.md # API contract for quota + rate limiting
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/api/ai/
│   ├── ask/route.ts              # MODIFIED — add rate limit check before Gemini call
│   └── quota/route.ts            # NEW — GET endpoint returning user's current quota
├── components/ai/
│   └── ai-chat-panel.tsx         # MODIFIED — add quota indicator, handle 429 error
└── lib/
    └── ai/
        └── rate-limit.ts         # NEW — rate limit helper (calls RPC, resolves env overrides)

supabase/
├── migrations/
│   └── 00016_ai_rate_limiting.sql  # NEW — ai_usage table, profiles column, RPC functions
└── seed.sql                        # MODIFIED — add test data for ai_usage and subscription_tier

tests/
├── src/lib/ai/
│   └── rate-limit.test.ts                    # NEW — unit tests for rate limit helper
├── src/app/api/ai/
│   └── quota/route.test.ts                   # NEW — unit tests for quota endpoint
└── src/lib/queries/
    └── ai-usage.integration.test.ts          # NEW — integration tests for RPC functions
```

**Structure Decision**: Minimal footprint — one new migration, one new API route, one new helper module, modifications to two existing files. The rate limit logic is centralized in a helper module (`rate-limit.ts`) called by the ask route, keeping the route handler clean.

## Implementation Phases

### Phase 1: Database & Types (Foundation)

**Goal**: Create `ai_usage` table, add `subscription_tier` to profiles, define RPC functions.

1. Create migration: `supabase migration new ai_rate_limiting`
   - Add `subscription_tier text NOT NULL DEFAULT 'free'` to `profiles`
   - Create `ai_usage` table with unique index on `(user_id, usage_date)`
   - Add RLS policy: users can read their own usage rows
   - Add `updated_at` trigger (reuse existing `update_updated_at_column()`)
   - Create `increment_ai_usage` RPC (atomic upsert + tier lookup + limit check)
   - Create `get_ai_quota` RPC (read-only quota query)
2. Run `supabase db reset` to verify migration chain
3. Update `supabase/seed.sql`:
   - Set test user's `subscription_tier` to `'free'`
   - Optionally add sample `ai_usage` rows for testing
4. Create `src/lib/ai/rate-limit.ts`:
   - `checkAndIncrementUsage(userId, model)` — calls RPC, handles env overrides
   - `getQuota(userId)` — calls RPC, returns quota info
   - Type definitions for RPC responses

**Test**: Integration test (`ai-usage.integration.test.ts`):

- `increment_ai_usage` creates new row on first call of the day
- `increment_ai_usage` increments existing row on subsequent calls
- `increment_ai_usage` returns `is_allowed = false` when count exceeds limit
- `increment_ai_usage` handles concurrent calls atomically (no double-count past limit)
- `get_ai_quota` returns 0 used when no row exists for today
- `get_ai_quota` returns correct count after several increments
- Profiles with unknown tier default to free limit
- Changing user's tier mid-day updates the limit on next check

### Phase 2: Quota API Endpoint (Server)

**Goal**: Create `GET /api/ai/quota` endpoint.

1. Create `src/app/api/ai/quota/route.ts`:
   - Authenticate user via `getAuthUserId()` (existing pattern)
   - Call `getQuota(userId)` from rate-limit helper
   - Return JSON: `{ used, limit, remaining, tier, resetsAt }`
   - Handle errors: 401 for unauthenticated, 500 for RPC failure

**Test**: Unit test (`quota/route.test.ts`):

- Returns 401 when user is not authenticated
- Returns correct quota structure for authenticated user
- Returns `remaining = 0` when user has exhausted quota
- Returns 500 when RPC call fails

### Phase 3: Rate Limit Enforcement (Server)

**Goal**: Modify `POST /api/ai/ask` to check rate limit before calling Gemini.

1. Modify `src/app/api/ai/ask/route.ts`:
   - After auth check, before `buildAiContext()`:
     - Call `checkAndIncrementUsage(userId, mode)`
     - If not allowed → return 429 with `{ error: "rate_limited", message, used, limit, resetsAt }`
     - If RPC fails → return 503 with `{ error: "service_unavailable", message }`
     - If allowed → proceed with existing flow

**Test**: Unit test for the route modifications:

- Request proceeds when user has remaining quota
- Returns 429 with correct body when quota exhausted
- Returns 503 when rate limit check fails (fail-closed)
- Rate limit check happens before Gemini call (mock verifies Gemini not called when blocked)

### Phase 4: Quota Display (Client)

**Goal**: Show remaining quota in AI chat panel, handle rate limit errors gracefully.

1. Modify `src/components/ai/ai-chat-panel.tsx`:
   - Add state: `quota` (`{ used, limit, remaining, tier, resetsAt } | null`)
   - On mount: fetch `GET /api/ai/quota`, populate quota state
   - Display quota indicator (small text below mode toggle or above input):
     - Normal: "18 of 30 questions remaining today" (muted text)
     - Low (≤5): Same text but amber/warning color
     - Exhausted (0): "No questions remaining — resets at midnight UTC" + disable input
   - After sending a question: optimistically decrement `remaining` by 1
   - Handle 429 from `/api/ai/ask`:
     - Parse the error response body
     - Set quota state from the error response
     - Display the `message` field as an assistant message in the chat
     - Disable input until quota resets
   - Handle quota fetch failure: hide the indicator (don't block usage — enforcement is server-side)

**Test**: Unit test for the component:

- Quota indicator renders with correct remaining count
- Indicator changes color when remaining ≤ 5
- Input is disabled when remaining = 0
- 429 response shows friendly message and disables input
- Optimistic decrement works after sending a question

### Phase 5: Polish & Cross-Cutting

**Goal**: Verify everything works end-to-end, handle edge cases, ensure CI passes.

1. Run `pnpm test` — all tests pass
2. Run `pnpm lint` — zero errors
3. Run `pnpm build` — verify build succeeds
4. Manual test: full flow from AI chat panel → send questions → hit limit → see friendly message
5. Manual test: verify quota indicator shows correct count after each question
6. Manual test: change test user's tier to 'pro' in DB → verify limit changes
7. Verify that the quota resets on the next UTC day (simulate by manually setting `usage_date` to yesterday in the DB)
8. Verify fail-closed: temporarily break the RPC function → verify 503 response

## Dependencies & Execution Order

```
Phase 1 (Database + Types) ──────────────────┐
    │                                         │
    ▼                                         ▼
Phase 2 (Quota API)          Phase 3 (Rate Limit Enforcement)
    │                                         │
    └────────────────┬────────────────────────┘
                     ▼
              Phase 4 (Quota Display)
                     │
                     ▼
              Phase 5 (Polish)
```

### Parallel Opportunities

- **Phase 2 + Phase 3**: Independent — quota display API and rate limit enforcement modify different route files and can be developed in parallel
- **Phase 1**: Must complete first — everything depends on the migration and RPC functions
- **Phase 4 depends on Phases 2 + 3**: Needs both the quota endpoint and the 429 error format

## Complexity Tracking

No constitution violations. All complexity is justified by the feature requirements:

| Decision                       | Why                                                             | Simpler Alternative                                    |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------ |
| Postgres RPC for atomic upsert | Prevents race conditions; single DB round-trip                  | SELECT then UPDATE — TOCTOU race condition              |
| `subscription_tier` on profiles| Avoids join, only 2 tiers                                       | Separate tiers table — premature for 2 values           |
| Env var overrides for limits   | Ops can change limits without deploy                            | Hardcoded — would need code change + deploy             |
| Fail-closed on RPC failure     | Cost protection; AI already depends on Supabase anyway          | Fail-open — turns DB outage into cost spike             |
| Separate quota endpoint        | Chat panel needs quota before first question                    | Embed in page props — couples quota to page data flow   |

## Interview-Ready Concepts

- **Atomic Upsert (INSERT ON CONFLICT)**: How Postgres row-level locking prevents TOCTOU race conditions in counters
- **Fail-Closed vs. Fail-Open**: Why rate limiters default to closed, and when you'd choose open (hint: almost never for cost protection)
- **Defense-in-Depth**: Rate limit enforced in DB (RPC), not just application code — even a buggy app can't bypass it
- **Denormalization Trade-off**: Tier on profiles vs. separate table — when to normalize, when to keep it simple
- **Twelve-Factor Config**: Environment variables for operational parameters (limits) vs. code for business logic
