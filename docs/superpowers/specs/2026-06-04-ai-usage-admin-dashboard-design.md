# AI Usage Admin Dashboard — Design

**Date:** 2026-06-04
**Status:** Approved design, pending implementation plan
**Scope:** One combined PR (ledger accuracy + admin auth + read-only dashboard + a security fix)

## 1. Problem & Goal

We have no first-party, accurate, *named* view of AI usage and cost. We need
observability over: AI generation usage (chat + LaTeX), token consumption, an
estimated dollar cost, per-user quota state, and embedding usage — plus the
foundation to add controls later.

PostHog (already integrated) is the analytics/exploration layer (trends, traces,
latency, per-model charts). It deliberately **cannot** answer the operational
questions this dashboard targets, because:

- Per project rules it receives **no PII** — so it only knows UUIDs, never "who
  by email is my top spender."
- It is sampled / eventually-consistent / ad-blockable — fine for trends, wrong
  for a source-of-truth count.
- It cannot JOIN to our Postgres domain data (courses, profiles, quotas).

So this dashboard is the **named, accurate, source-of-truth operational view**.
Historical trend charts are explicitly **out of scope** — PostHog wins those for
free and we will not rebuild them.

### Division of responsibility

| Concern | Home | Why |
| --- | --- | --- |
| Trends, latency, traces, per-model charts | PostHog LLM Analytics | Free, exploratory, time-series |
| Exact per-named-user usage, cost, quota %, controls | This dashboard | Accurate, named, joined to domain, actionable |

## 2. Current State (verified against code)

- `ai_usage` table (`supabase/migrations/00016`, `00018`): one row per
  `(user_id, usage_month, query_type)`. `query_type ∈ {chat, latex}` today
  (no CHECK constraint — values are app-enforced). `query_count` drives
  rate-limiting via the atomic `increment_ai_usage` RPC.
- `00018` added `total_input_tokens` / `total_output_tokens` columns and a
  `record_token_usage` RPC — but the RPC is **UPDATE-only**, and the ask route
  calls `recordTokenUsage(user.id, 'chat', 0, 0)`
  (`src/app/api/ai/ask/route.ts:382`). **Result: those columns are all zeros.**
- `00018` created `admin_user_ai_usage` as a plain VIEW (no `security_invoker`,
  no `REVOKE`) that joins every user's `email`. **Likely RLS-bypass leak** via
  the auto-generated REST API. Pre-existing; fixed here.
- Embeddings (`src/lib/ai/embeddings.ts`) call `embedContent` and record
  **nothing**. On the Gemini **Developer API** the embedding response has **no
  token field** (token stats are Vertex-only) — so embedding tokens must be
  **estimated**, not read.
- No `is_admin` concept, no `/admin` route. `createAdminClient()`
  (`src/lib/supabase/admin.ts`) provides a service-role client.
- Middleware (`src/lib/supabase/middleware.ts`) redirects unauthenticated users
  off non-auth pages to `/login`, and redirects authenticated users *away* from
  auth pages.
- Seed has `test@typenote.dev` and `test-b@typenote.dev`; no admin user.

## 3. Architecture

Three layers, built bottom-up so numbers are real before they are drawn. One PR.

### Layer 1 — Accurate token/cost ledger

**New table `ai_token_usage`** — the cost ledger, separate from the rate-limit
ledger (single responsibility: `ai_usage` counts queries for quotas;
`ai_token_usage` accounts tokens for cost).

```
ai_token_usage(
  id            bigserial pk,
  user_id       uuid not null references auth.users(id) on delete cascade,
  usage_month   text not null default to_char(CURRENT_DATE,'YYYY-MM'),
  model         text not null,          -- 'flash' | 'pro' | 'embedding'
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
)
unique (user_id, usage_month, model)
```

- RLS: users may SELECT their own rows (mirrors `ai_usage`). Admin reads bypass
  RLS via service-role behind the `requireAdmin()` gate (§Layer 2).
- `updated_at` trigger reuses `handle_updated_at`.

**New RPC `record_token_usage(p_user_id, p_model, p_input, p_output)`** — an
**UPSERT** into `ai_token_usage` (INSERT … ON CONFLICT DO UPDATE adding to the
running totals). Replaces the old UPDATE-only RPC. Per-model keying eliminates
the lossy `last_model` problem (a user mixing Flash + Pro is priced correctly).

**Token capture:**
- `src/app/api/ai/ask/route.ts`: after the stream completes, read generation
  token counts from the final chunk's `usageMetadata` **if present**, else fall
  back to a char-based estimate (never record zeros again). Record under the
  real model (`'flash'` for quick, `'pro'` for deep).
- `src/app/api/ai/latex/route.ts`: record under `'flash'`.
- `src/lib/ai/embeddings.ts`: `embedText`/`embedQuery` return
  `{ values, tokens }` where `tokens` is an **estimate** (`ceil(chars / 4)`;
  chunking already targets ~1600 chars ≈ ~400 tokens).
- `src/lib/actions/ai-context.ts`: at the two embed call sites
  (`indexContent` ~L296, `searchContext` ~L358) record estimated embedding
  tokens under model `'embedding'`, attributed to the authenticated user.
  **The Moodle shared-registry path (`userId=null`, ~L134) is skipped** — that
  corpus is deduplicated/shared and has no single owner. Documented gap.

**Pricing** — `src/lib/ai/pricing.ts`: per-1M-token price constants per model
(`flash`, `pro`, `embedding`; input vs output where applicable). Cost is computed
in app code: `Σ over models (tokens × price)`. Prices are approximate and easy to
update; the dashboard labels cost as an **estimate**.

**Cleanup:** drop the now-superseded `total_input_tokens` /
`total_output_tokens` columns from `ai_usage` (only ever held zeros).

### Layer 2 — Admin authorization

**Best practice: one auth system, authorization by role.** No separate admin
credentials/login (that fragments auth and doubles attack surface). Concretely:

- Migration: `ALTER TABLE profiles ADD COLUMN is_admin boolean NOT NULL DEFAULT false`.
- Flip `is_admin=true` for the admin account via SQL (and the seed for local/CI).
- Admin signs in through the existing `/login`.
- `requireAdmin()` helper (server-only): `getUser()` → load `profiles.is_admin`
  → if not admin, `notFound()` (404-feel: the area isn't discoverable). Used in
  the `/admin` server layout, so it gates every nested admin page.
- Dashboard data is read in **Server Components** via `createAdminClient()`
  (service-role), reached **only after** `requireAdmin()` passes, and never
  passed raw to client components (see "heavy props to client components"
  guidance — pass derived rows only). Defense in depth: authz gate first,
  privileged read second, server-only throughout.
- Future hardening lever (out of scope): MFA / step-up auth on admin *actions*.

**Authentication vs authorization (interview point):** Supabase proves *who you
are*; `is_admin` decides *what you may do*. Keeping them separate is the pattern.

### Layer 3 — Read-only dashboard at `/admin`

- **Summary cards (current month):** total chat queries, total latex queries,
  total tokens, **estimated total cost**, embedding tokens + estimated cost.
- **Per-user table:** email, display name, tier, chat count, latex count,
  per-model tokens (Flash/Pro/embedding input+output), **estimated cost**,
  **% of chat quota used** (rows near/over the cap highlighted). Sorted by
  estimated cost desc — top spenders first.
- **Month selector:** defaults to current `usage_month`.
- Data assembled server-side: join `ai_token_usage` (cost) + `ai_usage`
  (counts/quota) + `profiles` (identity/tier), aggregated per user for the
  selected month.

### Security fix (folded in)

Recreate `admin_user_ai_usage` `WITH (security_invoker = true)` and `REVOKE`
SELECT from `anon`/`authenticated`, closing the cross-user email/usage leak.
The recreated view **omits** the dropped `total_input_tokens` /
`total_output_tokens` columns (token/cost now lives in `ai_token_usage`); it
keeps identity + query-count fields for ad-hoc SQL. The dashboard itself does
not depend on this view (it aggregates the base tables server-side), so locking
it down is safe.

## 4. Data Flow

1. User asks a question → ask route runs `increment_ai_usage` (quota, fail-closed)
   → streams answer → on completion records **real** tokens via
   `record_token_usage(user, model, input, output)` (fire-and-forget, never
   throws).
2. User imports a file / searches → embedding tokens estimated → recorded under
   model `embedding` for the triggering user (shared Moodle path skipped).
3. Admin visits `/admin` → middleware lets the logged-in user through →
   `requireAdmin()` confirms `is_admin` → Server Component reads + aggregates via
   service-role → renders cards + table. No state changes.

## 5. Error Handling

- Token recording is **fire-and-forget** and never throws — a metrics write
  failure must never fail a user's AI answer. (Rate-limit check, by contrast,
  fails **closed**. Opposite choices, both correct: enforcement must not leak
  free usage; observability must not break the product.)
- `requireAdmin()` failure → `notFound()` (not a redirect to a login that the
  user is already past).
- Missing/زero token data renders as `0` / `$0.00`, not an error.

## 6. Testing

- **Unit:** `pricing.ts` math (per-model sums); `usageMetadata` extraction +
  char-estimate fallback; `requireAdmin` allow/deny logic; embedding token
  estimate.
- **Integration:** `record_token_usage` upsert creates and then accumulates
  per-model rows; chat/latex/embedding stay correctly separated; the per-user
  aggregate query returns correct sums against seeded data; RLS denies a normal
  user reading another user's `ai_token_usage`.
- **E2E (Playwright, real flows):** CI has no Gemini key and debug mode records
  zeros, so the dashboard E2E **seeds `ai_token_usage` + `ai_usage` rows with
  known values** and an admin user, then:
  - admin logs in via the shared `e2e/helpers/auth.ts` helper → opens `/admin` →
    sees expected totals, per-user rows, and cost;
  - a non-admin (`test@typenote.dev`) is blocked from `/admin` (404-feel).
  - Update `e2e/TEST_REGISTRY.md` first.
- Seeding an admin requires an `auth.users` + `auth.identities` block (mirroring
  the existing seed users) plus `is_admin=true`; `is_admin` migration must
  precede the seed reference.

## 7. Out of Scope (YAGNI / deferred)

- Write-controls (change tier, reset quota, global AI kill switch) — a focused
  follow-up once the numbers are trusted.
- Historical trend charts / per-model time series — PostHog covers these free.
- All-time cost rollup, alerting, MFA/step-up — deferred.
- Per-user attribution of the shared Moodle/dedup embedding corpus — documented
  gap (no single owner by design).

## 8. Known Limitations

- Embedding token counts are **estimates** (Developer API exposes none).
- Dollar cost is an **estimate** from a static price table; per-model keying
  makes it accurate to the model mix, but published prices can drift.
- Shared Moodle embedding cost is not attributed to any user in v1.
