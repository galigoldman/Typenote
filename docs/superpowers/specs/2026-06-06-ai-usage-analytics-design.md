# AI Usage Analytics — Design

**Date:** 2026-06-06
**Status:** Approved (brainstorming) → ready for implementation plan
**Branch:** `feat/ai-usage-analytics` (off `dev`)

## Goal

Give the admin a full picture of AI usage and token cost, drillable from the
whole roster down to a single query: **per month → per day → per query**, plus a
**per-document** breakdown ("how many questions were asked against each
document"). No question text is ever stored or shown — numbers only.

This work also fixes a production bug: token cost shows **$0** because recording
is fire-and-forget and gets dropped when the Vercel function freezes after the
response.

## Problems being solved

1. **No sub-monthly granularity.** `ai_usage` (rate-limit counts) and
   `ai_token_usage` (token aggregate) are both **monthly rollups**. There is no
   per-day or per-query record anywhere, so daily / per-query / per-document
   views are impossible with the current schema.
2. **Prod cost is $0 (bug).** All three recording sites fire-and-forget:
   - `src/app/api/ai/latex/route.ts:89` — `recordTokenUsage(...).catch(()=>{})` then immediate `return`
   - `src/app/api/ai/ask/route.ts:395` — `.catch(()=>{})` after the stream closes
   - `src/lib/actions/ai-context.ts:352,381` — `.catch(()=>{})` for embeddings

   On Vercel (Fluid Compute / serverless) the function can freeze right after
   sending the response, so the `record_token_usage` RPC never runs. It works
   locally and in tests only because the process never freezes. Documented
   failure mode: same as the Moodle-indexing drop that the serverless
   fire-and-forget guardrail (ESLint rule + await-in-route) was created for.

3. **Roster misses users with no profile row.** The roster currently iterates
   `profiles`, so any user whose `handle_new_user` trigger never created a
   profile row (e.g. signups during the months prod was schema-stale) is
   invisible — which presents as "only users who had usage show up." Fixed by
   sourcing the roster from `auth.users` (the real source of truth for "who
   exists") via the service-role admin API, then left-joining profile data.

## Architecture — append-only event log (single source of truth)

One new append-only table records **one row per AI call**. Every dashboard view
is an aggregation of this single table, so there is no second aggregate to drift
out of sync.

```sql
create table public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  query_type    text not null check (query_type in ('chat','latex','embedding')),
  model         text not null,                 -- 'flash' | 'pro' | 'embedding'
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  course_id     uuid references public.courses(id)   on delete set null,
  document_id   uuid references public.documents(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_document_idx      on public.ai_usage_events (document_id);
create index ai_usage_events_course_created_idx on public.ai_usage_events (course_id, created_at desc);

alter table public.ai_usage_events enable row level security;
-- No anon/authenticated policies: admin dashboard reads via the service-role
-- client only (matches ai_token_usage). RLS-on with no policy = deny-all to
-- normal clients; service role bypasses RLS.
```

**Design rationale (interview framing):** this separates two concerns that the
current schema conflates.
- `ai_usage` stays as the **rate-limit counter** — a denormalized,
  atomically-incremented count optimized for the hot enforcement path
  (`increment_ai_usage` RPC returns "are you under quota?"). Untouched.
- `ai_usage_events` is the **append-only analytics ledger** — the read model for
  reporting. Counts, tokens, cost, daily/monthly buckets, and per-document
  rollups all derive from it.

This is a CQRS-style split: command-side counter for enforcement, event log for
analytics. `ai_token_usage` (the monthly token aggregate) is **retired going
forward** — its role is subsumed by aggregating events.

**History (clean cutover):** the dashboard reads only `ai_usage_events`.
Pre-existing `ai_token_usage` months are not bridged (prod cost is ~$0 today, so
there is effectively no history to lose). `ai_token_usage` and
`record_token_usage` are left in place but no longer written/read by the
dashboard; removed in a later cleanup once the event log is proven in prod.

## Recording

New helper, awaited at every call site (no fire-and-forget):

```ts
// src/lib/ai/usage-events.ts
export async function recordAiEvent(e: {
  userId: string;
  queryType: 'chat' | 'latex' | 'embedding';
  model: string;
  inputTokens: number;
  outputTokens: number;
  courseId?: string | null;
  documentId?: string | null;
}): Promise<void>;
```

- Inserts one row via the request-scoped Supabase client.
- Wrapped in try/catch and logs on failure — a metrics write must never fail the
  user's AI response — **but is `await`ed** so the insert completes before the
  serverless function can freeze. This is the fix for the $0 bug.
- Call sites (replace the three `recordTokenUsage(...).catch()` calls):
  - `latex/route.ts` → `await recordAiEvent({queryType:'latex', model:'flash', courseId})` before `return`.
  - `ask/route.ts` → `await recordAiEvent({queryType:'chat', model: modelLabel, courseId, documentId})` inside the stream's `try` (before `controller.close()` in `finally`).
  - `ai-context.ts` (×2) → `await recordAiEvent({queryType:'embedding', model:'embedding', courseId, documentId})`.
- `course_id` / `document_id` are passed where the route already has them
  (the ask route has the active conversation's `course_id`; embedding paths have
  the source's course/document). When unavailable, pass `null`.

## Dashboard

All reads go through the service-role admin client after `requireAdmin()`.

### `/admin` — roster (existing page, re-pointed to events)
**User source = `auth.users`**, enumerated via the service-role
`supabase.auth.admin.listUsers()` (paged until exhausted), so every registered
user appears even with no `profiles` row and no usage. Each auth user is
left-joined to `profiles` (tier, display_name; fall back to the auth email /
'free' tier when absent) and to per-user totals aggregated from
`ai_usage_events` for the selected month: chat count, latex count, tokens by
model, est. cost, chat-quota %. Same columns and sort as today (cost desc →
volume → email). Each user row links to the drill-down page. This replaces the
old `profiles`-only enumeration and fixes "only users with usage show up."

### `/admin/users/[userId]` — drill-down (new)
Server component, `requireAdmin()` + `dynamic = 'force-dynamic'`. Sections:

1. **By month** — one row per month the user has events: total queries (by
   type), tokens (by model), est. cost. Most recent first.
2. **By day** — selecting a month (via `?month=YYYY-MM`) expands to one row per
   day in that month (`date_trunc('day', created_at)`): queries / tokens / cost.
3. **Per query** — selecting a day (`?day=YYYY-MM-DD`) lists individual events:
   timestamp, query type, model, input/output tokens, est. cost, and
   course/document name when present. **No question text.**
4. **By document** — top documents for this user by question count, with tokens
   and est. cost. Joins `document_id` → `documents.title`. Answers "questions per
   document". Events with null `document_id` group under "No document".

Query layer: `src/lib/queries/admin-user-usage.ts` with focused functions
(`getUserMonthlyUsage`, `getUserDailyUsage`, `getUserQueryLog`,
`getUserUsageByDocument`) — each takes the admin client + filters and returns
typed rows. Aggregation by month/day uses `date_trunc` (or grouping in JS over a
date-filtered fetch at current scale). Cost via `estimateCostUsd`.

## Testing

- **Unit (Vitest):** aggregation helpers (month/day grouping, per-document
  rollup, cost) over fixture event rows; `recordAiEvent` inserts the right
  payload and never throws on DB error.
- **Integration:** `recordAiEvent` writes a real row to local Supabase; the
  query functions aggregate seeded events into correct month/day/document
  totals. Add deterministic seeded events (mirror the existing `2099-01` admin
  seed) so cost math is checkable.
- **E2E (Playwright):** extend `e2e/admin-dashboard.spec.ts` — admin opens a
  user's drill-down, sees monthly rows, drills into a month → day → per-query
  list, and sees the per-document section. Non-admin gets 404 on
  `/admin/users/[id]`. Use the shared `e2e/helpers/auth.ts`; no `test.skip`.
  Update `e2e/TEST_REGISTRY.md`.
- Seed (`supabase/seed.sql`): add deterministic `ai_usage_events` rows for the
  seeded test user (and the existing seeded month) so unit/integration/E2E have
  stable numbers. The existing admin E2E that asserts `$1.95` is re-pointed to
  event-derived cost (same figure, now from events).

## Follow-up (separate change, not in this plan)

- **Profiles hygiene (optional):** the roster no longer depends on `profiles`
  being complete, but a later cleanup can still backfill missing `profiles` rows
  from `auth.users` and harden `handle_new_user` so other features that read
  `profiles` are also correct. Verify the gap once Supabase prod access is set
  up.
- Drop `ai_token_usage` + `record_token_usage` once the event log is proven in
  prod.
