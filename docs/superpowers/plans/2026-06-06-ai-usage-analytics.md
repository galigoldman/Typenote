# AI Usage Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record one row per AI call in an append-only `ai_usage_events` table and build an admin drill-down (roster → per-user → month → day → per-query, plus per-document), while fixing the prod $0 bug by awaiting recording.

**Architecture:** Single append-only event log is the source of truth for all AI usage analytics. Every view is an aggregation of that one table (grouped in JS over date-filtered fetches — trivial at current scale). The admin roster is enumerated from `auth.users` (service-role admin API) so users with no `profiles` row still appear. `ai_usage` (rate-limit counter) is untouched; `ai_token_usage` is retired going forward (clean cutover, no history bridge).

**Tech Stack:** Next.js 16 App Router (server components, `force-dynamic`), Supabase Postgres + service-role admin client, Vitest (unit/integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-06-ai-usage-analytics-design.md`

---

## File Structure

- `supabase/migrations/20260606120000_ai_usage_events.sql` — new event-log table + indexes + RLS (create)
- `src/lib/ai/usage-events.ts` — `recordAiEvent()` insert helper (create)
- `src/lib/ai/__tests__/usage-events.test.ts` — unit test for `recordAiEvent` (create)
- `src/lib/queries/ai-usage-events.integration.test.ts` — integration test: insert + read back (create)
- `src/app/api/ai/latex/route.ts` — replace fire-and-forget with awaited `recordAiEvent` (modify)
- `src/app/api/ai/ask/route.ts` — same (modify)
- `src/lib/actions/ai-context.ts` — same, ×2 embedding sites (modify)
- `src/lib/queries/admin-usage.ts` — re-point roster to `auth.users` + event aggregation (modify)
- `src/lib/queries/__tests__/admin-usage.test.ts` — unit test for roster aggregation (create)
- `src/lib/queries/admin-usage.integration.test.ts` — integration: full roster incl. zero-usage user (create)
- `src/lib/queries/admin-user-usage.ts` — per-user month/day/query/document aggregations (create)
- `src/lib/queries/__tests__/admin-user-usage.test.ts` — unit tests for the four aggregations (create)
- `src/app/(admin)/admin/users/[userId]/page.tsx` — drill-down page (create)
- `src/app/(admin)/admin/page.tsx` — link each roster row to the drill-down (modify)
- `supabase/seed.sql` — deterministic `ai_usage_events` rows for month 2099-01 (modify)
- `e2e/admin-dashboard.spec.ts` — drill-down + per-document E2E (modify)
- `e2e/TEST_REGISTRY.md` — register the new scenarios (modify)

---

## Task 1: Migration — `ai_usage_events` table

**Files:**

- Create: `supabase/migrations/20260606120000_ai_usage_events.sql`

- [ ] **Step 1: Write the migration**

```sql
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
  ON public.ai_usage_events (document_id);
CREATE INDEX ai_usage_events_course_created_idx
  ON public.ai_usage_events (course_id, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Users may read their own events; admin dashboard reads bypass RLS via the
-- service-role client. No INSERT policy for normal clients — events are written
-- server-side only (service-role / SECURITY DEFINER contexts).
CREATE POLICY "Users can view their own usage events"
  ON public.ai_usage_events FOR SELECT
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply locally and verify it loads**

Run: `pnpm supabase db reset` (resets local DB + reseeds; see memory "Running tests locally" for env).
Expected: reset completes with no migration error; `ai_usage_events` exists.

- [ ] **Step 3: Verify table shape**

Run: `pnpm supabase db reset >/dev/null 2>&1 && psql "$DATABASE_URL" -c "\d public.ai_usage_events"` (use the local DB URL from your worktree env script).
Expected: columns `id, user_id, query_type, model, input_tokens, output_tokens, course_id, document_id, created_at`; three indexes listed; RLS enabled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606120000_ai_usage_events.sql
git commit -m "feat(db): add ai_usage_events append-only analytics ledger"
```

---

## Task 2: `recordAiEvent` helper

**Files:**

- Create: `src/lib/ai/usage-events.ts`
- Create: `src/lib/ai/__tests__/usage-events.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/ai/__tests__/usage-events.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ insert: mockInsert }),
  })),
}));

import { recordAiEvent } from '@/lib/ai/usage-events';

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe('recordAiEvent', () => {
  it('inserts a row with the full payload', async () => {
    await recordAiEvent({
      userId: 'u1',
      queryType: 'chat',
      model: 'flash',
      inputTokens: 100,
      outputTokens: 50,
      courseId: 'c1',
      documentId: 'd1',
    });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'u1',
      query_type: 'chat',
      model: 'flash',
      input_tokens: 100,
      output_tokens: 50,
      course_id: 'c1',
      document_id: 'd1',
    });
  });

  it('defaults course_id/document_id to null when omitted', async () => {
    await recordAiEvent({
      userId: 'u1',
      queryType: 'latex',
      model: 'flash',
      inputTokens: 1,
      outputTokens: 2,
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ course_id: null, document_id: null }),
    );
  });

  it('never throws when the insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } });
    await expect(
      recordAiEvent({
        userId: 'u1',
        queryType: 'embedding',
        model: 'embedding',
        inputTokens: 10,
        outputTokens: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/lib/ai/__tests__/usage-events.test.ts`
Expected: FAIL — cannot find module `@/lib/ai/usage-events`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/ai/usage-events.ts
import { createClient } from '@/lib/supabase/server';

export type AiQueryType = 'chat' | 'latex' | 'embedding';

export interface AiUsageEvent {
  userId: string;
  queryType: AiQueryType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  courseId?: string | null;
  documentId?: string | null;
}

/**
 * Append one row to the AI usage event log. MUST be awaited by callers before
 * the serverless function returns — a dropped (fire-and-forget) write is the
 * cause of the prod $0 bug. Never throws: a metrics-write failure must not fail
 * the user's AI response, but the await guarantees the insert is in flight
 * before the function can freeze.
 */
export async function recordAiEvent(e: AiUsageEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('ai_usage_events').insert({
      user_id: e.userId,
      query_type: e.queryType,
      model: e.model,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      course_id: e.courseId ?? null,
      document_id: e.documentId ?? null,
    });
    if (error) {
      console.error('[usage-events] failed to record AI event:', error.message);
    }
  } catch (err) {
    console.error('[usage-events] failed to record AI event:', err);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test src/lib/ai/__tests__/usage-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/usage-events.ts src/lib/ai/__tests__/usage-events.test.ts
git commit -m "feat(ai): add recordAiEvent append-only usage logger"
```

---

## Task 3: Integration test — recordAiEvent writes a real row

**Files:**

- Create: `src/lib/queries/ai-usage-events.integration.test.ts`

This uses the cookie-based server client against local Supabase, like `src/lib/queries/ai-token-usage.integration.test.ts`. Insert via the service-role client directly (RLS-bypass) to keep it independent of auth.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/lib/queries/ai-usage-events.integration.test.ts
import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// Seeded test user (see supabase/seed.sql).
const TEST_USER = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

describe('ai_usage_events insert', () => {
  it('persists a row readable by the admin client', async () => {
    const admin = createAdminClient();
    const { error } = await admin.from('ai_usage_events').insert({
      user_id: TEST_USER,
      query_type: 'chat',
      model: 'flash',
      input_tokens: 111,
      output_tokens: 22,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('ai_usage_events')
      .select('input_tokens, output_tokens, query_type, model')
      .eq('user_id', TEST_USER)
      .eq('input_tokens', 111)
      .single();

    expect(data).toMatchObject({
      input_tokens: 111,
      output_tokens: 22,
      query_type: 'chat',
      model: 'flash',
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:integration src/lib/queries/ai-usage-events.integration.test.ts`
Expected: PASS (requires local Supabase running + migration applied via `pnpm supabase db reset`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/ai-usage-events.integration.test.ts
git commit -m "test(ai): integration — ai_usage_events insert round-trips"
```

---

## Task 4: Wire recording into the three call sites (awaited)

**Files:**

- Modify: `src/app/api/ai/latex/route.ts:88-91`
- Modify: `src/app/api/ai/ask/route.ts:389-400`
- Modify: `src/lib/actions/ai-context.ts:352,381`
- Modify: `src/app/api/ai/latex/route.test.ts` (expectation swap)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts` (expectation swap)

The existing route tests assert `recordTokenUsage` was called. After cutover they must assert `recordAiEvent`. Keep `recordTokenUsage` in `rate-limit.ts` for now (unused by routes; removed in the spec's follow-up) so its own unit tests still pass.

- [ ] **Step 1: Update the latex route test (failing)**

In `src/app/api/ai/latex/route.test.ts`, replace the `recordTokenUsage` mock + assertion with `recordAiEvent`:

```ts
// at top with other vi.mock calls
vi.mock('@/lib/ai/usage-events', () => ({
  recordAiEvent: vi.fn().mockResolvedValue(undefined),
}));
import { recordAiEvent } from '@/lib/ai/usage-events';

// in the "records usage" test:
it('should call recordAiEvent after conversion', async () => {
  // ...existing arrange that yields inputTokens 12, outputTokens 7 for user u1...
  expect(recordAiEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'u1',
      queryType: 'latex',
      model: 'flash',
      inputTokens: 12,
      outputTokens: 7,
    }),
  );
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/app/api/ai/latex/route.test.ts`
Expected: FAIL — route still calls `recordTokenUsage`, `recordAiEvent` not called.

- [ ] **Step 3: Update the latex route**

In `src/app/api/ai/latex/route.ts`, replace the import and the fire-and-forget block:

```ts
// import line
import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';
import { recordAiEvent } from '@/lib/ai/usage-events';

// replace lines 88-91:
// Await so the write completes before the serverless function can freeze.
await recordAiEvent({
  userId: user.id,
  queryType: 'latex',
  model: 'flash',
  inputTokens,
  outputTokens,
  courseId: typeof courseId === 'string' ? courseId : null,
});
```

(If `courseId` is not already destructured in this route, read it from the parsed body as the existing code does for `courseName`; pass `null` if absent.)

- [ ] **Step 4: Run the latex test to confirm pass**

Run: `pnpm test src/app/api/ai/latex/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the ask route**

In `src/app/api/ai/ask/route.ts`, replace the import of `recordTokenUsage` (keep `checkAndIncrementUsage`) and the fire-and-forget block at ~395:

```ts
import { checkAndIncrementUsage } from '@/lib/ai/rate-limit';
import { recordAiEvent } from '@/lib/ai/usage-events';

// inside the stream try{}, replacing the recordTokenUsage(...).catch(...) call:
const inputTokens =
  usageInput || estimateTokens(`${systemPrompt}\n${question}`);
const outputTokens = usageOutput || estimateTokens(fullResponse);
// Await before the stream closes so the write isn't dropped on freeze.
await recordAiEvent({
  userId: user.id,
  queryType: 'chat',
  model: modelLabel,
  inputTokens,
  outputTokens,
  courseId: typeof courseId === 'string' ? courseId : null,
  documentId: typeof documentId === 'string' ? documentId : null,
});
```

`courseId` and `documentId` are already destructured from the request body at the top of the route (lines 13-21).

- [ ] **Step 6: Update the embedding sites + ai-context test**

In `src/lib/actions/ai-context.ts`, replace both `recordTokenUsage(...).catch(() => {})` calls (lines 352, 381):

```ts
// import
import { recordAiEvent } from '@/lib/ai/usage-events';

// line ~352 (cost attributed to the triggering user; course/document context
// available in this function — pass them if in scope, else null):
await recordAiEvent({
  userId: costUserId,
  queryType: 'embedding',
  model: 'embedding',
  inputTokens: embedTokens,
  outputTokens: 0,
  courseId: courseId ?? null,
  documentId: documentId ?? null,
});

// line ~381 (query embedding):
await recordAiEvent({
  userId,
  queryType: 'embedding',
  model: 'embedding',
  inputTokens: queryTokens,
  outputTokens: 0,
  courseId: courseId ?? null,
  documentId: documentId ?? null,
});
```

(Use whichever of `courseId`/`documentId` are in scope at each site; pass `null` for any that are not. Do not invent new parameters.)

In `src/lib/actions/__tests__/ai-context.test.ts`, swap the `recordTokenUsage` mock + the two assertions (lines 221, 325, 341) to `recordAiEvent` with `expect.objectContaining({ queryType: 'embedding', model: 'embedding', ... })`.

- [ ] **Step 7: Run all affected unit tests**

Run: `pnpm test src/app/api/ai src/lib/actions/__tests__/ai-context.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/ai/latex/route.ts src/app/api/ai/latex/route.test.ts \
  src/app/api/ai/ask/route.ts src/lib/actions/ai-context.ts \
  src/lib/actions/__tests__/ai-context.test.ts
git commit -m "fix(ai): await usage logging at all call sites (fixes prod \$0 drop)"
```

---

## Task 5: Roster reads from auth.users + event aggregation

**Files:**

- Modify: `src/lib/queries/admin-usage.ts`
- Create: `src/lib/queries/__tests__/admin-usage.test.ts`
- Create: `src/lib/queries/admin-usage.integration.test.ts`

Keep the exported `AdminUserUsage`, `AdminUsageTotals`, `AdminUsage` interfaces **unchanged** so `admin/page.tsx` needs no prop changes. Add a small exported helper `monthRange` for testability.

- [ ] **Step 1: Write the failing unit test for `monthRange` + aggregation**

```ts
// src/lib/queries/__tests__/admin-usage.test.ts
import { describe, it, expect } from 'vitest';
import { monthRange, aggregateRoster } from '@/lib/queries/admin-usage';

describe('monthRange', () => {
  it('returns UTC start (inclusive) and next-month start (exclusive)', () => {
    expect(monthRange('2099-01')).toEqual({
      start: '2099-01-01T00:00:00.000Z',
      end: '2099-02-01T00:00:00.000Z',
    });
    expect(monthRange('2099-12')).toEqual({
      start: '2099-12-01T00:00:00.000Z',
      end: '2100-01-01T00:00:00.000Z',
    });
  });
});

describe('aggregateRoster', () => {
  it('builds full roster incl. zero-usage users, sorted by cost desc', () => {
    const authUsers = [
      { id: 'u1', email: 'a@x.dev' },
      { id: 'u2', email: 'b@x.dev' }, // no profile, no usage
    ];
    const profiles = [
      {
        id: 'u1',
        email: 'a@x.dev',
        display_name: 'A',
        subscription_tier: 'pro',
      },
    ];
    const events = [
      {
        user_id: 'u1',
        query_type: 'chat',
        model: 'flash',
        input_tokens: 1_000_000,
        output_tokens: 500_000,
      },
      {
        user_id: 'u1',
        query_type: 'embedding',
        model: 'embedding',
        input_tokens: 2_000_000,
        output_tokens: 0,
      },
    ];
    const { users, totals } = aggregateRoster(authUsers, profiles, events);

    expect(users).toHaveLength(2);
    const u1 = users.find((u) => u.userId === 'u1')!;
    expect(u1.chatCount).toBe(1);
    expect(u1.tokensByModel.flash).toEqual({
      input: 1_000_000,
      output: 500_000,
    });
    expect(u1.estimatedCostUsd).toBeCloseTo(1.95, 2); // 0.30+1.25 flash + 0.40 embed
    const u2 = users.find((u) => u.userId === 'u2')!;
    expect(u2.email).toBe('b@x.dev');
    expect(u2.tier).toBe('free');
    expect(u2.estimatedCostUsd).toBe(0);
    expect(users[0].userId).toBe('u1'); // cost desc → u1 first
    expect(totals.estimatedCostUsd).toBeCloseTo(1.95, 2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/lib/queries/__tests__/admin-usage.test.ts`
Expected: FAIL — `monthRange`/`aggregateRoster` not exported.

- [ ] **Step 3: Rewrite `admin-usage.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateCostUsd } from '@/lib/ai/pricing';
import { resolveLimitForTier } from '@/lib/ai/rate-limit';

export interface ModelTokens {
  input: number;
  output: number;
}
export interface AdminUserUsage {
  userId: string;
  email: string;
  displayName: string | null;
  tier: string;
  chatCount: number;
  latexCount: number;
  tokensByModel: Record<string, ModelTokens>;
  estimatedCostUsd: number;
  chatQuotaPct: number;
}
export interface AdminUsageTotals {
  chatCount: number;
  latexCount: number;
  totalTokens: number;
  embeddingTokens: number;
  estimatedCostUsd: number;
}
export interface AdminUsage {
  users: AdminUserUsage[];
  totals: AdminUsageTotals;
}

interface AuthUserLite {
  id: string;
  email: string | null | undefined;
}
interface ProfileLite {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription_tier: string | null;
}
interface EventLite {
  user_id: string;
  query_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/** UTC [start, end) ISO bounds for a 'YYYY-MM' month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // JS rolls Dec→next year
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Pure aggregation — unit-tested without a DB. */
export function aggregateRoster(
  authUsers: AuthUserLite[],
  profiles: ProfileLite[],
  events: EventLite[],
): AdminUsage {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const byUser = new Map<string, AdminUserUsage>();

  for (const au of authUsers) {
    const p = profileById.get(au.id);
    byUser.set(au.id, {
      userId: au.id,
      email: au.email ?? p?.email ?? '(no email)',
      displayName: p?.display_name ?? null,
      tier: p?.subscription_tier ?? 'free',
      chatCount: 0,
      latexCount: 0,
      tokensByModel: {},
      estimatedCostUsd: 0,
      chatQuotaPct: 0,
    });
  }

  for (const e of events) {
    const row = byUser.get(e.user_id);
    if (!row) continue;
    if (e.query_type === 'chat') row.chatCount += 1;
    else if (e.query_type === 'latex') row.latexCount += 1;
    const tk = (row.tokensByModel[e.model] ??= { input: 0, output: 0 });
    tk.input += e.input_tokens;
    tk.output += e.output_tokens;
  }

  const totals: AdminUsageTotals = {
    chatCount: 0,
    latexCount: 0,
    totalTokens: 0,
    embeddingTokens: 0,
    estimatedCostUsd: 0,
  };
  for (const row of byUser.values()) {
    let cost = 0;
    for (const [model, tk] of Object.entries(row.tokensByModel)) {
      cost += estimateCostUsd(model, tk.input, tk.output);
      totals.totalTokens += tk.input + tk.output;
      if (model === 'embedding') totals.embeddingTokens += tk.input;
    }
    row.estimatedCostUsd = cost;
    const chatLimit = resolveLimitForTier(row.tier, 'chat');
    row.chatQuotaPct =
      chatLimit > 0 ? Math.round((row.chatCount / chatLimit) * 100) : 0;
    totals.chatCount += row.chatCount;
    totals.latexCount += row.latexCount;
    totals.estimatedCostUsd += cost;
  }

  const users = [...byUser.values()].sort(
    (a, b) =>
      b.estimatedCostUsd - a.estimatedCostUsd ||
      b.chatCount + b.latexCount - (a.chatCount + a.latexCount) ||
      a.email.localeCompare(b.email),
  );
  return { users, totals };
}

/** Enumerate every auth user (paged) so zero-profile users still appear. */
async function listAllAuthUsers(
  admin: ReturnType<typeof createAdminClient>,
): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < perPage) break;
  }
  return out;
}

/**
 * Aggregate per-user AI usage + cost for one month from the event log.
 * Service-role reads — call ONLY after requireAdmin() in a Server Component.
 */
export async function getAdminUsage(month: string): Promise<AdminUsage> {
  const admin = createAdminClient();
  const { start, end } = monthRange(month);

  const [authUsers, { data: profiles }, { data: events }] = await Promise.all([
    listAllAuthUsers(admin),
    admin.from('profiles').select('id, email, display_name, subscription_tier'),
    admin
      .from('ai_usage_events')
      .select('user_id, query_type, model, input_tokens, output_tokens')
      .gte('created_at', start)
      .lt('created_at', end),
  ]);

  return aggregateRoster(authUsers, profiles ?? [], events ?? []);
}
```

- [ ] **Step 4: Run the unit test to confirm pass**

Run: `pnpm test src/lib/queries/__tests__/admin-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration test**

```ts
// src/lib/queries/admin-usage.integration.test.ts
import { describe, it, expect } from 'vitest';
import { getAdminUsage } from '@/lib/queries/admin-usage';

describe('getAdminUsage (full roster from auth.users)', () => {
  it('includes the seeded admin user who has no usage in 2099-01', async () => {
    const { users } = await getAdminUsage('2099-01');
    // seeded admin@typenote.dev has events seeded for the test user only
    const admin = users.find((u) => u.email === 'admin@typenote.dev');
    expect(admin).toBeDefined();
    expect(admin!.estimatedCostUsd).toBe(0);
    const tester = users.find((u) => u.email === 'test@typenote.dev');
    expect(tester).toBeDefined();
    expect(tester!.estimatedCostUsd).toBeCloseTo(1.95, 2);
  });
});
```

- [ ] **Step 6: Run it** (after Task 8 seed exists; if run before, the cost assertion is the only part that depends on seed — sequence Task 8 before final verification)

Run: `pnpm test:integration src/lib/queries/admin-usage.integration.test.ts`
Expected: PASS once the seed (Task 8) is in place.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/admin-usage.ts src/lib/queries/__tests__/admin-usage.test.ts \
  src/lib/queries/admin-usage.integration.test.ts
git commit -m "feat(admin): roster from auth.users, aggregated from ai_usage_events"
```

---

## Task 6: Per-user drill-down query functions

**Files:**

- Create: `src/lib/queries/admin-user-usage.ts`
- Create: `src/lib/queries/__tests__/admin-user-usage.test.ts`

Four pure aggregators over event rows + thin DB wrappers. Pure functions are unit-tested; wrappers are exercised by the E2E.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/queries/__tests__/admin-user-usage.test.ts
import { describe, it, expect } from 'vitest';
import {
  groupByMonth,
  groupByDay,
  toQueryLog,
  groupByDocument,
} from '@/lib/queries/admin-user-usage';

const ev = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'e1',
  query_type: 'chat',
  model: 'flash',
  input_tokens: 1_000_000,
  output_tokens: 0,
  course_id: null,
  document_id: null,
  created_at: '2099-01-05T10:00:00.000Z',
  ...over,
});

describe('groupByMonth', () => {
  it('sums queries/tokens/cost per month, newest first', () => {
    const rows = groupByMonth([
      ev(),
      ev({ created_at: '2099-02-01T00:00:00.000Z' }),
    ]);
    expect(rows[0].month).toBe('2099-02');
    expect(rows[1].month).toBe('2099-01');
    expect(rows[1].queryCount).toBe(1);
    expect(rows[1].estimatedCostUsd).toBeCloseTo(0.3, 4); // 1M flash input
  });
});

describe('groupByDay', () => {
  it('buckets by UTC day', () => {
    const rows = groupByDay([
      ev({ created_at: '2099-01-05T10:00:00.000Z' }),
      ev({ created_at: '2099-01-05T23:00:00.000Z' }),
      ev({ created_at: '2099-01-06T01:00:00.000Z' }),
    ]);
    expect(rows.find((r) => r.day === '2099-01-05')!.queryCount).toBe(2);
    expect(rows.find((r) => r.day === '2099-01-06')!.queryCount).toBe(1);
  });
});

describe('toQueryLog', () => {
  it('maps rows to per-query entries with cost, newest first', () => {
    const log = toQueryLog([
      ev({ id: 'a', created_at: '2099-01-05T10:00:00.000Z' }),
      ev({ id: 'b', created_at: '2099-01-06T10:00:00.000Z' }),
    ]);
    expect(log[0].id).toBe('b');
    expect(log[0].estimatedCostUsd).toBeCloseTo(0.3, 4);
  });
});

describe('groupByDocument', () => {
  it('groups by document_id with a null bucket', () => {
    const rows = groupByDocument(
      [
        ev({ document_id: 'd1' }),
        ev({ document_id: 'd1' }),
        ev({ document_id: null }),
      ],
      { d1: 'Lecture 1' },
    );
    const d1 = rows.find((r) => r.documentId === 'd1')!;
    expect(d1.title).toBe('Lecture 1');
    expect(d1.queryCount).toBe(2);
    expect(rows.find((r) => r.documentId === null)!.title).toBe('No document');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test src/lib/queries/__tests__/admin-user-usage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/queries/admin-user-usage.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateCostUsd } from '@/lib/ai/pricing';
import { monthRange } from '@/lib/queries/admin-usage';

export interface EventRow {
  id: string;
  query_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  course_id: string | null;
  document_id: string | null;
  created_at: string;
}
export interface MonthlyUsageRow {
  month: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface DailyUsageRow {
  day: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
export interface QueryLogRow {
  id: string;
  createdAt: string;
  queryType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  documentId: string | null;
}
export interface DocumentUsageRow {
  documentId: string | null;
  title: string;
  queryCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

const cost = (e: EventRow) =>
  estimateCostUsd(e.model, e.input_tokens, e.output_tokens);
const tokens = (e: EventRow) => e.input_tokens + e.output_tokens;

export function groupByMonth(events: EventRow[]): MonthlyUsageRow[] {
  const m = new Map<string, MonthlyUsageRow>();
  for (const e of events) {
    const month = e.created_at.slice(0, 7); // YYYY-MM (ISO is UTC)
    const r = (m.get(month) ??= {
      month,
      queryCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function groupByDay(events: EventRow[]): DailyUsageRow[] {
  const m = new Map<string, DailyUsageRow>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10); // YYYY-MM-DD (UTC)
    const r = (m.get(day) ??= {
      day,
      queryCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function toQueryLog(events: EventRow[]): QueryLogRow[] {
  return events
    .map((e) => ({
      id: e.id,
      createdAt: e.created_at,
      queryType: e.query_type,
      model: e.model,
      inputTokens: e.input_tokens,
      outputTokens: e.output_tokens,
      estimatedCostUsd: cost(e),
      documentId: e.document_id,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function groupByDocument(
  events: EventRow[],
  titlesById: Record<string, string>,
): DocumentUsageRow[] {
  const m = new Map<string | null, DocumentUsageRow>();
  for (const e of events) {
    const key = e.document_id;
    const r = (m.get(key) ??= {
      documentId: key,
      title: key ? (titlesById[key] ?? '(deleted document)') : 'No document',
      queryCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    r.queryCount += 1;
    r.totalTokens += tokens(e);
    r.estimatedCostUsd += cost(e);
  }
  return [...m.values()].sort((a, b) => b.queryCount - a.queryCount);
}

/** Fetch all events for a user (newest first). */
export async function fetchUserEvents(
  userId: string,
  range?: { start: string; end: string },
): Promise<EventRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from('ai_usage_events')
    .select(
      'id, query_type, model, input_tokens, output_tokens, course_id, document_id, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (range) q = q.gte('created_at', range.start).lt('created_at', range.end);
  const { data } = await q;
  return (data as EventRow[]) ?? [];
}

/** Resolve document titles for a set of ids. */
export async function fetchDocumentTitles(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('id, title')
    .in('id', ids);
  const map: Record<string, string> = {};
  for (const d of data ?? [])
    map[d.id as string] = (d.title as string) ?? '(untitled)';
  return map;
}

export { monthRange };
```

- [ ] **Step 4: Run the unit test to confirm pass**

Run: `pnpm test src/lib/queries/__tests__/admin-user-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/admin-user-usage.ts src/lib/queries/__tests__/admin-user-usage.test.ts
git commit -m "feat(admin): per-user month/day/query/document usage aggregations"
```

---

## Task 7: Drill-down page + roster links

**Files:**

- Create: `src/app/(admin)/admin/users/[userId]/page.tsx`
- Modify: `src/app/(admin)/admin/page.tsx` (wrap the email cell in a link)

- [ ] **Step 1: Add the link from the roster (modify `admin/page.tsx`)**

Replace the email cell:

```tsx
import Link from 'next/link';
// ...
<td className="px-3 py-2">
  <Link
    href={`/admin/users/${u.userId}`}
    className="text-primary underline-offset-2 hover:underline"
  >
    {u.email}
  </Link>
</td>;
```

- [ ] **Step 2: Create the drill-down page**

```tsx
// src/app/(admin)/admin/users/[userId]/page.tsx
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchUserEvents,
  fetchDocumentTitles,
  groupByMonth,
  groupByDay,
  toQueryLog,
  groupByDocument,
  monthRange,
} from '@/lib/queries/admin-user-usage';

export const dynamic = 'force-dynamic';

function usd(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function AdminUserUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const { month, day } = await searchParams;

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? userId;

  const allEvents = await fetchUserEvents(userId);
  const months = groupByMonth(allEvents);

  const monthEvents = month
    ? allEvents.filter((e) => e.created_at.slice(0, 7) === month)
    : [];
  const days = month ? groupByDay(monthEvents) : [];

  const dayEvents = day
    ? allEvents.filter((e) => e.created_at.slice(0, 10) === day)
    : [];
  const queryLog = day ? toQueryLog(dayEvents) : [];

  const docIds = [
    ...new Set(allEvents.map((e) => e.document_id).filter(Boolean) as string[]),
  ];
  const titles = await fetchDocumentTitles(docIds);
  const byDocument = groupByDocument(allEvents, titles);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-primary hover:underline">
          ← All users
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{email}</h1>
      </div>

      {/* By month */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          By month
        </h2>
        <UsageTable
          headers={['Month', 'Queries', 'Tokens', 'Est. cost']}
          rows={months.map((m) => ({
            key: m.month,
            href: `/admin/users/${userId}?month=${m.month}`,
            cells: [
              m.month,
              m.queryCount,
              m.totalTokens.toLocaleString(),
              usd(m.estimatedCostUsd),
            ],
          }))}
          empty="No usage recorded."
        />
      </section>

      {/* By day (when a month is selected) */}
      {month && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {month} — by day
          </h2>
          <UsageTable
            headers={['Day', 'Queries', 'Tokens', 'Est. cost']}
            rows={days.map((d) => ({
              key: d.day,
              href: `/admin/users/${userId}?month=${month}&day=${d.day}`,
              cells: [
                d.day,
                d.queryCount,
                d.totalTokens.toLocaleString(),
                usd(d.estimatedCostUsd),
              ],
            }))}
            empty="No usage that month."
          />
        </section>
      )}

      {/* Per query (when a day is selected) */}
      {day && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {day} — per query
          </h2>
          <UsageTable
            headers={['Time (UTC)', 'Type', 'Model', 'In', 'Out', 'Est. cost']}
            rows={queryLog.map((q) => ({
              key: q.id,
              cells: [
                q.createdAt.slice(11, 19),
                q.queryType,
                q.model,
                q.inputTokens.toLocaleString(),
                q.outputTokens.toLocaleString(),
                usd(q.estimatedCostUsd),
              ],
            }))}
            empty="No queries that day."
          />
        </section>
      )}

      {/* By document */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Questions by document
        </h2>
        <UsageTable
          headers={['Document', 'Queries', 'Tokens', 'Est. cost']}
          rows={byDocument.map((d) => ({
            key: d.documentId ?? 'none',
            cells: [
              d.title,
              d.queryCount,
              d.totalTokens.toLocaleString(),
              usd(d.estimatedCostUsd),
            ],
          }))}
          empty="No document-scoped usage."
        />
      </section>
    </div>
  );
}

function UsageTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: { key: string; href?: string; cells: (string | number)[] }[];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className={
                  'px-3 py-2 font-medium' + (i === 0 ? '' : ' text-right')
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={'px-3 py-2' + (i === 0 ? '' : ' text-right')}
                >
                  {i === 0 && r.href ? (
                    <Link
                      href={r.href}
                      className="text-primary hover:underline"
                    >
                      {c}
                    </Link>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify it builds and lints**

Run: `pnpm build` (or `pnpm lint`) — confirm the new route compiles.
Expected: no type errors; `/admin/users/[userId]` route built.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/users/[userId]/page.tsx" "src/app/(admin)/admin/page.tsx"
git commit -m "feat(admin): per-user usage drill-down page (month/day/query/document)"
```

---

## Task 8: Deterministic seed for the event log

**Files:**

- Modify: `supabase/seed.sql` (append after the existing 2099-01 block, ~line 700)

The seed must reproduce the existing E2E cost of **$1.95** for `test@typenote.dev`
(flash 1M in / 0.5M out = $1.55, embedding 2M = $0.40), spread across multiple
days and documents so the drill-down has data. Reuse a seeded document id.

- [ ] **Step 1: Find a seeded document id to attribute events to**

Run: `grep -n "INSERT INTO public.documents" supabase/seed.sql`
Expected: at least one seeded document; note its `id` (call it `<DOC_ID>`). If none exists, attribute events to `NULL` document_id (the "No document" bucket still exercises `groupByDocument`).

- [ ] **Step 2: Append the seed block**

```sql
-- DETERMINISTIC AI-USAGE EVENTS (admin drill-down E2E, month 2099-01).
-- Reproduces test@typenote.dev's $1.95 cost across 2 days + 1 document so the
-- month→day→query and by-document views have stable data.
INSERT INTO public.ai_usage_events
  (user_id, query_type, model, input_tokens, output_tokens, document_id, created_at)
VALUES
  -- 2099-01-05: one chat (flash) tied to a document
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', 'chat', 'flash', 600000, 300000, '<DOC_ID>', '2099-01-05T10:00:00Z'),
  -- 2099-01-06: one chat (flash), no document
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', 'chat', 'flash', 400000, 200000, NULL, '2099-01-06T11:00:00Z'),
  -- 2099-01-06: one embedding (cost 0.40), tied to the document
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', 'embedding', 'embedding', 2000000, 0, '<DOC_ID>', '2099-01-06T11:05:00Z');
-- Totals: flash 1,000,000 in / 500,000 out = $1.55; embedding 2,000,000 = $0.40 → $1.95.
```

Replace `<DOC_ID>` with the id from Step 1, or `NULL` if no seeded document exists.

- [ ] **Step 3: Reseed and verify totals**

Run: `pnpm supabase db reset`
Expected: completes; `ai_usage_events` has 3 rows for the test user in 2099-01.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "test(seed): deterministic ai_usage_events for admin drill-down (\$1.95)"
```

---

## Task 9: E2E drill-down + registry

**Files:**

- Modify: `e2e/admin-dashboard.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

Uses the shared `loginAs` helper. No `test.skip`, no env-gating.

- [ ] **Step 1: Add the drill-down E2E test**

```ts
// append inside the existing test.describe('Admin AI Usage Dashboard', ...)
test('admin drills into a user: month → day → per-query + by-document', async ({
  page,
}) => {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin?month=2099-01');

  // Open the test user's drill-down via the roster link.
  await page.getByRole('link', { name: 'test@typenote.dev' }).click();
  await expect(page).toHaveURL(/\/admin\/users\//);
  await expect(
    page.getByRole('heading', { name: 'test@typenote.dev' }),
  ).toBeVisible();

  // By-month row for 2099-01 is present; drill in.
  await page.getByRole('link', { name: '2099-01' }).click();
  await expect(page).toHaveURL(/month=2099-01/);

  // By-day rows appear; drill into 2099-01-06 (has 2 events).
  await page.getByRole('link', { name: '2099-01-06' }).click();
  await expect(page).toHaveURL(/day=2099-01-06/);

  // Per-query list shows the embedding model row.
  await expect(page.getByText('embedding')).toBeVisible();

  // By-document section present.
  await expect(
    page.getByRole('heading', { name: 'Questions by document' }),
  ).toBeVisible();
});

test('non-admin is blocked from a user drill-down page (404)', async ({
  page,
}) => {
  await login(page);
  const res = await page.goto(
    '/admin/users/ac3be77d-4566-406c-9ac0-7c410634ad41',
  );
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Run the E2E suite for this spec**

Run: `pnpm test:e2e admin-dashboard`
Expected: all admin-dashboard tests PASS (see memory "Running tests locally" for env/ports).

- [ ] **Step 3: Update TEST_REGISTRY.md**

Add a row under the Admin section describing: "Admin user drill-down — month→day→per-query navigation + by-document breakdown; non-admin 404 on `/admin/users/[id]`."

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-dashboard.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(e2e): admin per-user usage drill-down + registry"
```

---

## Task 10: Full suite + format

**Files:** none (verification)

- [ ] **Step 1: Run the full suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green.

- [ ] **Step 2: Format check**

Run: `pnpm format:check`
Expected: clean (run `pnpm format` if not, then commit the formatting).

- [ ] **Step 3: Confirm `supabase/config.toml` is NOT staged**

Run: `git status --porcelain | grep config.toml`
Expected: shows ` M supabase/config.toml` (modified, UNSTAGED). Never `git add` it.

- [ ] **Step 4: Push + open PR to `dev`**

```bash
git push -u origin feat/ai-usage-analytics
gh pr create --base dev --title "feat(admin): AI usage analytics — event log + per-user drill-down" --body "..."
```

---

## Notes / guardrails (carried from session memory)

- **Never** `git add supabase/config.toml` or any `.env*` file — the worktree's `config.toml` carries isolated-stack port offsets and must stay local.
- Branch is `feat/ai-usage-analytics` off `dev`; PR targets `dev` (rebase-only repo — no merge commits).
- AI E2E has no Gemini key in CI — these admin tests don't call Gemini (they read seeded events), so they run unconditionally.
- Prod follow-ups (separate, with user's go-ahead): verify `auth.users` vs `profiles` gap; drop `ai_token_usage` + `record_token_usage` once the event log is proven in prod.

```

```
