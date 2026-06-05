# AI Usage Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only, read-only dashboard showing accurate per-user AI usage (chat/latex query counts, per-model token totals, estimated switchable cost, % quota used) including per-user-attributed embedding cost.

**Architecture:** A new `ai_token_usage` cost ledger (keyed by user+month+model) feeds real token counts captured from the AI calls. Admin access is a single Supabase auth identity gated by an `is_admin` flag + `requireAdmin()` server guard; data is read via the service-role client only after the gate. Prices are env-overridable so cost-per-token is switchable without a deploy.

**Tech Stack:** Next.js 16 (App Router, Server Components), Supabase (Postgres + RPC + RLS), `@google/genai`, Vercel AI SDK, shadcn/ui, Vitest (unit/integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-04-ai-usage-admin-dashboard-design.md`

**Branch:** `feat/ai-usage-admin-dashboard` (already created)

---

## File Structure

**Layer 1 — accurate ledger**

- Create `supabase/migrations/20260604120000_ai_token_usage.sql` — new cost-ledger table, new `record_token_usage(model)` upsert RPC, drop zeroed columns, lock down the leaky view.
- Create `src/lib/ai/tokens.ts` — `estimateTokens(text)` (single source of the char→token estimate).
- Create `src/lib/ai/pricing.ts` — env-overridable per-model prices + `estimateCostUsd()`.
- Modify `src/lib/ai/embeddings.ts` — return `{ values, tokens }`.
- Modify `src/lib/ai/rate-limit.ts` — `recordTokenUsage(userId, model, input, output)` → new RPC.
- Modify `src/lib/ai/latex.ts` — return token usage.
- Modify `src/app/api/ai/ask/route.ts` — record real generation tokens.
- Modify `src/app/api/ai/latex/route.ts` — record real latex tokens.
- Modify `src/lib/actions/ai-context.ts` — record embedding tokens; add `triggeredByUserId` to the moodle `IndexSource`.
- Modify the Moodle routes that call `indexContent` — thread `triggeredByUserId`.

**Layer 2/3 — auth + dashboard**

- Create `supabase/migrations/20260604120100_profiles_is_admin.sql` — `is_admin` column.
- Modify `supabase/seed.sql` — add admin user + deterministic dashboard seed rows.
- Create `src/lib/auth/require-admin.ts` — `requireAdmin()` guard.
- Create `src/lib/queries/admin-usage.ts` — aggregate query for the dashboard.
- Create `src/app/(admin)/admin/layout.tsx` — gate.
- Create `src/app/(admin)/admin/page.tsx` — dashboard UI.
- Create `src/components/admin/month-select.tsx` — month picker (client).
- Create `e2e/admin-dashboard.spec.ts` — E2E.
- Modify `e2e/TEST_REGISTRY.md`.

---

## Task 1: Token-ledger migration (`ai_token_usage` + upsert RPC + view lockdown)

**Files:**

- Create: `supabase/migrations/20260604120000_ai_token_usage.sql`
- Test: `src/lib/queries/ai-token-usage.integration.test.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260604120000_ai_token_usage.sql`:

```sql
-- AI usage admin dashboard: accurate per-model token cost ledger.
--
-- Why a new table instead of more columns on ai_usage?
-- ai_usage is the RATE-LIMIT ledger (query_count per query_type, drives the
-- atomic quota RPC). Token COST has a different grain — it must be split by
-- model (flash/pro/embedding) so a user who mixes Flash + Pro is priced
-- correctly. Single-responsibility tables: ai_usage counts queries,
-- ai_token_usage accounts tokens.

-- 1. Cost ledger table
CREATE TABLE public.ai_token_usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_month   text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  model         text NOT NULL,            -- 'flash' | 'pro' | 'embedding'
  input_tokens  bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_token_usage_user_month_model_idx
  ON public.ai_token_usage (user_id, usage_month, model);

CREATE TRIGGER ai_token_usage_updated_at
  BEFORE UPDATE ON public.ai_token_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

-- Users may read their own token rows; admin reads bypass RLS via service role.
CREATE POLICY "Users can view their own token usage"
  ON public.ai_token_usage FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Replace record_token_usage: key by MODEL, and UPSERT (embedding rows never
-- pass through increment_ai_usage, so the row may not exist yet).
-- Param names change (p_query_type -> p_model), so DROP then CREATE.
DROP FUNCTION IF EXISTS public.record_token_usage(uuid, text, integer, integer);

CREATE FUNCTION public.record_token_usage(
  p_user_id uuid,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_token_usage (user_id, usage_month, model, input_tokens, output_tokens)
    VALUES (p_user_id, to_char(CURRENT_DATE, 'YYYY-MM'), p_model, p_input_tokens, p_output_tokens)
    ON CONFLICT (user_id, usage_month, model)
    DO UPDATE SET
      input_tokens  = public.ai_token_usage.input_tokens  + p_input_tokens,
      output_tokens = public.ai_token_usage.output_tokens + p_output_tokens,
      updated_at    = now();
END;
$$;

-- 3. Security fix + cleanup of the old zeroed columns.
-- The admin_user_ai_usage VIEW referenced these columns, so drop the view first.
-- It was created without security_invoker (RLS-bypass leak) and joined every
-- user's email — recreate it security_invoker and REVOKE from public roles.
DROP VIEW IF EXISTS public.admin_user_ai_usage;

ALTER TABLE public.ai_usage
  DROP COLUMN IF EXISTS total_input_tokens,
  DROP COLUMN IF EXISTS total_output_tokens;

CREATE VIEW public.admin_user_ai_usage
  WITH (security_invoker = true) AS
SELECT
  p.id AS user_id,
  p.display_name,
  p.email,
  p.subscription_tier,
  au.usage_month,
  au.query_type,
  au.query_count,
  au.updated_at
FROM public.profiles p
LEFT JOIN public.ai_usage au ON au.user_id = p.id
ORDER BY au.usage_month DESC, p.display_name;

REVOKE ALL ON public.admin_user_ai_usage FROM anon, authenticated;
```

- [ ] **Step 2: Reset the DB and confirm the migration applies**

Run: `pnpm supabase db reset`
Expected: completes without error; output lists `20260604120000_ai_token_usage.sql` applied.

- [ ] **Step 3: Write the failing integration test**

Create `src/lib/queries/ai-token-usage.integration.test.ts`:

```ts
/**
 * Integration test: record_token_usage upserts into ai_token_usage,
 * keyed by (user, month, model), accumulating on repeat calls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function cleanup() {
  await supabase
    .from('ai_token_usage')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('usage_month', currentMonth());
}

beforeAll(async () => {
  supabase = createAdminClient();
  await cleanup();
});

afterAll(cleanup);

describe('record_token_usage', () => {
  it('inserts a new row for a model on first call', async () => {
    const { error } = await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_input_tokens: 100,
      p_output_tokens: 40,
    });
    expect(error).toBeNull();

    const { data } = await supabase
      .from('ai_token_usage')
      .select('input_tokens, output_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('model', 'flash')
      .single();

    expect(data?.input_tokens).toBe(100);
    expect(data?.output_tokens).toBe(40);
  });

  it('accumulates on repeat calls for the same model', async () => {
    await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'flash',
      p_input_tokens: 10,
      p_output_tokens: 5,
    });

    const { data } = await supabase
      .from('ai_token_usage')
      .select('input_tokens, output_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth())
      .eq('model', 'flash')
      .single();

    expect(data?.input_tokens).toBe(110);
    expect(data?.output_tokens).toBe(45);
  });

  it('keeps separate models in separate rows', async () => {
    await supabase.rpc('record_token_usage', {
      p_user_id: TEST_USER_ID,
      p_model: 'embedding',
      p_input_tokens: 999,
      p_output_tokens: 0,
    });

    const { data } = await supabase
      .from('ai_token_usage')
      .select('model, input_tokens')
      .eq('user_id', TEST_USER_ID)
      .eq('usage_month', currentMonth());

    const embedding = data?.find((r) => r.model === 'embedding');
    expect(embedding?.input_tokens).toBe(999);
    expect(data?.length).toBe(2); // flash + embedding
  });
});
```

- [ ] **Step 4: Run the integration test**

Run: `pnpm test:integration -- ai-token-usage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260604120000_ai_token_usage.sql src/lib/queries/ai-token-usage.integration.test.ts
git commit -m "feat(ai): add ai_token_usage cost ledger + model-keyed upsert RPC

Adds per-model token ledger, replaces record_token_usage with an upsert
keyed by model, drops the zeroed ai_usage token columns, and locks down
the leaky admin_user_ai_usage view (security_invoker + REVOKE).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Token estimate helper (`tokens.ts`)

**Files:**

- Create: `src/lib/ai/tokens.ts`
- Test: `src/lib/ai/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../tokens';

describe('estimateTokens', () => {
  it('approximates ~1 token per 4 characters, rounding up', () => {
    expect(estimateTokens('12345678')).toBe(2); // 8 / 4
    expect(estimateTokens('123456789')).toBe(3); // ceil(9 / 4)
  });

  it('returns 0 for empty or whitespace-only text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
  });

  it('handles undefined/null defensively', () => {
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tokens`
Expected: FAIL ("Cannot find module '../tokens'").

- [ ] **Step 3: Implement**

Create `src/lib/ai/tokens.ts`:

```ts
/**
 * Rough token estimate from text length. The Gemini Developer API does not
 * return token counts for embeddings, and generation usage can be absent, so
 * this is the fallback. ~4 characters per token is the standard heuristic for
 * Latin-script text. Estimates are accepted — tokens are the metric we report;
 * the dollar figure derived from them is labeled an estimate.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/tokens.ts src/lib/ai/__tests__/tokens.test.ts
git commit -m "feat(ai): add estimateTokens char-based heuristic

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pricing module (`pricing.ts`)

**Files:**

- Create: `src/lib/ai/pricing.ts`
- Test: `src/lib/ai/__tests__/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/__tests__/pricing.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { estimateCostUsd, getModelPrices } from '../pricing';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('estimateCostUsd', () => {
  it('prices flash input + output per 1M tokens using defaults', () => {
    // defaults: flash input 0.30, output 2.50 per 1M
    const cost = estimateCostUsd('flash', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.3 + 2.5, 6);
  });

  it('prices embedding as input-only', () => {
    // default embedding input 0.15 per 1M, output unused
    const cost = estimateCostUsd('embedding', 2_000_000, 0);
    expect(cost).toBeCloseTo(0.3, 6);
  });

  it('returns 0 for an unknown model', () => {
    expect(estimateCostUsd('mystery', 1_000_000, 1_000_000)).toBe(0);
  });

  it('honours env overrides so prices are switchable without a deploy', () => {
    vi.stubEnv('AI_PRICE_FLASH_INPUT', '1.00');
    vi.stubEnv('AI_PRICE_FLASH_OUTPUT', '3.00');
    expect(getModelPrices().flash).toEqual({ input: 1.0, output: 3.0 });
    expect(estimateCostUsd('flash', 1_000_000, 1_000_000)).toBeCloseTo(4.0, 6);
  });

  it('ignores invalid env values and falls back to default', () => {
    vi.stubEnv('AI_PRICE_FLASH_INPUT', 'not-a-number');
    expect(getModelPrices().flash.input).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- pricing`
Expected: FAIL ("Cannot find module '../pricing'").

- [ ] **Step 3: Implement**

Create `src/lib/ai/pricing.ts`:

```ts
/**
 * Per-model AI token prices, in USD per 1,000,000 tokens.
 *
 * Prices are ENV-OVERRIDABLE so cost-per-token can be switched without a code
 * deploy (mirrors the AI_LIMIT_* rate-limit override pattern). Defaults are
 * approximate published Gemini prices and are safe to adjust.
 *
 * Tokens are the primary, accurate metric. The dollar figure is a derived,
 * switchable estimate and is labeled as such in the UI.
 */

export interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

function envPrice(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw !== undefined) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return fallback;
}

export function getModelPrices(): Record<string, ModelPrice> {
  return {
    flash: {
      input: envPrice('AI_PRICE_FLASH_INPUT', 0.3),
      output: envPrice('AI_PRICE_FLASH_OUTPUT', 2.5),
    },
    pro: {
      input: envPrice('AI_PRICE_PRO_INPUT', 1.25),
      output: envPrice('AI_PRICE_PRO_OUTPUT', 10.0),
    },
    embedding: {
      input: envPrice('AI_PRICE_EMBEDDING', 0.15),
      output: 0,
    },
  };
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = getModelPrices()[model];
  if (!price) return 0;
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- pricing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/pricing.ts src/lib/ai/__tests__/pricing.test.ts
git commit -m "feat(ai): add env-overridable per-model pricing + cost estimate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Embeddings return token estimate

**Files:**

- Modify: `src/lib/ai/embeddings.ts:16-47`
- Test: `src/lib/ai/__tests__/embeddings.test.ts` (update existing assertions)

- [ ] **Step 1: Update the failing tests first**

In `src/lib/ai/__tests__/embeddings.test.ts`, the existing `embedText`/`embedQuery` tests assert the function returns the raw array. Change them to assert the new `{ values, tokens }` shape. Replace the body of the first `embedText` test with:

```ts
it('sends text with RETRIEVAL_DOCUMENT task type and returns values + token estimate', async () => {
  const mockValues = Array.from({ length: 1536 }, () => 0.2);
  mockEmbedContent.mockResolvedValueOnce({
    embeddings: [{ values: mockValues }],
  });

  const result = await embedText('Some document text'); // 18 chars -> ceil(18/4)=5
  expect(result.values).toEqual(mockValues);
  expect(result.tokens).toBe(5);
});
```

For any other test in this file that does `const result = await embedText(...)` / `embedQuery(...)` and asserts on the array directly, change it to assert on `result.values`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- embeddings`
Expected: FAIL (result is `{values, tokens}`, not an array).

- [ ] **Step 3: Implement**

In `src/lib/ai/embeddings.ts`, add the import at the top:

```ts
import { estimateTokens } from '@/lib/ai/tokens';
```

Replace the `embedText` and `embedQuery` functions (lines 13-47) with:

```ts
export interface EmbedResult {
  values: number[];
  /** Estimated token count (Developer API returns none for embeddings). */
  tokens: number;
}

/**
 * Embed a text string for storage (document side of asymmetric retrieval).
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  });

  return {
    values: response.embeddings?.[0]?.values ?? [],
    tokens: estimateTokens(text),
  };
}

/**
 * Embed a search query (query side of asymmetric retrieval).
 */
export async function embedQuery(text: string): Promise<EmbedResult> {
  const genai = getGenAI();

  const response = await genai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_QUERY',
    },
  });

  return {
    values: response.embeddings?.[0]?.values ?? [],
    tokens: estimateTokens(text),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- embeddings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embeddings.ts src/lib/ai/__tests__/embeddings.test.ts
git commit -m "feat(ai): embeddings return token estimate alongside vector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `recordTokenUsage` keyed by model

**Files:**

- Modify: `src/lib/ai/rate-limit.ts:202-222`
- Test: `src/lib/ai/__tests__/rate-limit.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

In `src/lib/ai/__tests__/rate-limit.test.ts`, add (the file already mocks `@/lib/supabase/server`; mirror its existing `recordTokenUsage` mock setup — if none exists, add a `vi.mock` for the server client exposing an `rpc` spy). Add this test inside the file:

```ts
describe('recordTokenUsage', () => {
  it('calls record_token_usage RPC keyed by model', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await recordTokenUsage('user-1', 'pro', 123, 45);

    expect(rpc).toHaveBeenCalledWith('record_token_usage', {
      p_user_id: 'user-1',
      p_model: 'pro',
      p_input_tokens: 123,
      p_output_tokens: 45,
    });
  });

  it('never throws if the RPC errors (fire-and-forget)', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('db down'));
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await expect(
      recordTokenUsage('user-1', 'flash', 1, 1),
    ).resolves.toBeUndefined();
  });
});
```

Ensure `createClient` and `recordTokenUsage` are imported at the top of the test file (add to existing imports if missing):

```ts
import { createClient } from '@/lib/supabase/server';
import { recordTokenUsage } from '../rate-limit';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- rate-limit`
Expected: FAIL (RPC called with `p_query_type`, not `p_model`).

- [ ] **Step 3: Implement**

In `src/lib/ai/rate-limit.ts`, replace the `recordTokenUsage` function (lines ~193-222) with:

```ts
/**
 * Record token counts for cost observability. Called AFTER the AI response.
 *
 * Keyed by MODEL ('flash' | 'pro' | 'embedding') so mixed-model usage is priced
 * correctly. Fire-and-forget — never throws; a metrics-write failure must never
 * fail the user's AI response.
 */
export async function recordTokenUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('record_token_usage', {
      p_user_id: userId,
      p_model: model,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    });
  } catch (err) {
    console.error('[rate-limit] Failed to record token usage:', err);
  }
}
```

(Leave `QueryType`, `checkAndIncrementUsage`, `getQuota`, and `resolveLimitForTier` unchanged — `QueryType` is still used by the rate-limit path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- rate-limit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/rate-limit.ts src/lib/ai/__tests__/rate-limit.test.ts
git commit -m "feat(ai): recordTokenUsage keyed by model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Capture real generation tokens in the ask route

**Files:**

- Modify: `src/app/api/ai/ask/route.ts:319-382`

- [ ] **Step 1: Add the estimate import**

At the top of `src/app/api/ai/ask/route.ts`, add:

```ts
import { estimateTokens } from '@/lib/ai/tokens';
```

- [ ] **Step 2: Capture usageMetadata in the stream loop**

In the `ReadableStream`'s `start`, before the `for await` loop, add accumulators next to `let fullResponse = '';`:

```ts
let fullResponse = '';
let usageInput = 0;
let usageOutput = 0;
```

Inside the loop, after the `if (text) { ... }` block, capture usage from each chunk (the final chunk carries cumulative `usageMetadata`):

```ts
for await (const chunk of streamResult) {
  const text = chunk.text ?? '';
  if (text) {
    fullResponse += text;
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`),
    );
  }
  const usage = chunk.usageMetadata;
  if (usage) {
    usageInput = usage.promptTokenCount ?? usageInput;
    usageOutput = usage.candidatesTokenCount ?? usageOutput;
  }
}
```

- [ ] **Step 3: Record real tokens (with estimate fallback)**

Replace the existing fire-and-forget line:

```ts
// Fire-and-forget token recording for admin observability
recordTokenUsage(user.id, 'chat', 0, 0).catch(() => {});
```

with:

```ts
// Fire-and-forget token recording for cost observability.
// Prefer the model's reported usage; fall back to a char estimate so
// we never silently record zeros.
const inputTokens =
  usageInput || estimateTokens(`${systemPrompt}\n${question}`);
const outputTokens = usageOutput || estimateTokens(fullResponse);
recordTokenUsage(user.id, modelLabel, inputTokens, outputTokens).catch(
  () => {},
);
```

(`modelLabel` is already defined at line 325 as `mode === 'deep' ? 'pro' : 'flash'`.)

- [ ] **Step 4: Update the debug-mode token line**

In debug mode the route returns early without a Gemini call. Leave the debug branch as-is (it does not record tokens), so CI's keyless runs record nothing rather than zeros. No change needed here — just confirm no other `recordTokenUsage(... 'chat' ...)` call remains:

Run: `grep -n "recordTokenUsage" src/app/api/ai/ask/route.ts`
Expected: exactly one call, using `modelLabel`.

- [ ] **Step 5: Typecheck + existing route tests**

Run: `pnpm test -- ask && pnpm typecheck`
Expected: PASS (existing ask tests still green; no type errors). If `chunk.usageMetadata` types complain, the `@google/genai` `GenerateContentResponse` exposes `usageMetadata?` — no cast needed; if a type error appears, narrow with `const usage = chunk.usageMetadata;` as written.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/ask/route.ts
git commit -m "feat(ai): record real chat tokens by model in ask route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Capture real latex tokens

**Files:**

- Modify: `src/lib/ai/latex.ts`
- Modify: `src/app/api/ai/latex/route.ts:83-88`
- Test: `src/lib/ai/latex.test.ts` (update return-shape assertions)

- [ ] **Step 1: Update the latex unit test**

In `src/lib/ai/latex.test.ts`, the existing tests expect `convertToLatex` to resolve to a string. Update them to the new object shape. For each `expect(await convertToLatex(...)).toBe('...')`, change to:

```ts
const result = await convertToLatex('five times a half');
expect(result.latex).toBe('5 \\times \\frac{1}{2}');
expect(result.inputTokens).toBeGreaterThan(0);
expect(result.outputTokens).toBeGreaterThan(0);
```

If the test mocks `generateText`, make the mock return `{ text: '...', usage: { inputTokens: 12, outputTokens: 7 } }` and assert `result.inputTokens === 12`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- latex`
Expected: FAIL (result is a string).

- [ ] **Step 3: Implement in `latex.ts`**

Replace `src/lib/ai/latex.ts` with:

```ts
import { generateText } from 'ai';
import { getModel } from './provider';
import { buildLatexPrompt } from './prompts';
import { estimateTokens } from './tokens';

export interface LatexResult {
  latex: string;
  inputTokens: number;
  outputTokens: number;
}

export async function convertToLatex(
  text: string,
  courseName?: string,
): Promise<LatexResult> {
  const system = buildLatexPrompt(courseName);
  const result = await generateText({
    model: getModel(),
    system,
    prompt: text,
    temperature: 0,
  });

  const latex = result.text.trim();
  // AI SDK usage field naming has varied across versions; read both, then
  // fall back to a char estimate so we never record zeros.
  const usage = result.usage as
    | {
        inputTokens?: number;
        promptTokens?: number;
        outputTokens?: number;
        completionTokens?: number;
      }
    | undefined;
  const inputTokens =
    usage?.inputTokens ??
    usage?.promptTokens ??
    estimateTokens(`${system}\n${text}`);
  const outputTokens =
    usage?.outputTokens ?? usage?.completionTokens ?? estimateTokens(latex);

  return { latex, inputTokens, outputTokens };
}
```

- [ ] **Step 4: Update the latex route**

In `src/app/api/ai/latex/route.ts`, replace lines 83-90:

```ts
const latex = await convertToLatex(text.trim(), courseName || undefined);

// Fire-and-forget token recording
// convertToLatex returns just the string for now; token recording
// will be enhanced when we update latex.ts to return usage in US3
recordTokenUsage(user.id, 'latex', 0, 0).catch(() => {});

return NextResponse.json({ latex });
```

with:

```ts
const { latex, inputTokens, outputTokens } = await convertToLatex(
  text.trim(),
  courseName || undefined,
);

// Fire-and-forget token recording (latex always runs on Flash).
recordTokenUsage(user.id, 'flash', inputTokens, outputTokens).catch(() => {});

return NextResponse.json({ latex });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm test -- latex && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/latex.ts src/app/api/ai/latex/route.ts src/lib/ai/latex.test.ts
git commit -m "feat(ai): record real latex tokens (Flash) from generateText usage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Attribute embedding tokens per user

**Files:**

- Modify: `src/lib/actions/ai-context.ts` (IndexSource type L37-40; indexContent L118-336; searchContext L353-358)
- Modify: `src/app/api/moodle/upload/route.ts`, `src/app/api/moodle/upload-finalize/route.ts`, `src/app/api/moodle/import-existing/route.ts` (thread triggering user)
- Test: `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts` (extend) — see Step 6

- [ ] **Step 1: Add `triggeredByUserId` to the moodle IndexSource**

In `src/lib/actions/ai-context.ts`, change the `IndexSource` union (lines 37-40):

```ts
export type IndexSource =
  | {
      type: 'moodle_file';
      fileId: string;
      courseId: string;
      /** User who triggered the one-time shared embed (for cost attribution). */
      triggeredByUserId?: string;
    }
  | { type: 'course_material'; materialId: string; courseId: string }
  | { type: 'personal_file'; fileId: string; courseId: string };
```

- [ ] **Step 2: Track a cost-attribution user id in indexContent**

In `indexContent`, add a cost-attribution variable next to the existing `let userId` declaration (line 124):

```ts
let userId: string | null = null;
let costUserId: string | null = null; // who pays for the embed (may differ from row owner)
```

In the `moodle_file` branch (after `userId = null;` at line 134) add:

```ts
userId = null;
costUserId = source.triggeredByUserId ?? null; // shared vector, attributed cost
```

In the `course_material` branch (after `userId = await getAuthUserId();` ~line 190) add `costUserId = userId;`. Do the same in the `personal_file` branch (after line 222): `costUserId = userId;`.

- [ ] **Step 3: Accumulate and record embedding tokens**

In the chunk loop (lines 294-314), accumulate tokens. Replace:

```ts
    const rows: EmbeddingRow[] = [];
    for (const chunk of chunks) {
      const embedding = await embedText(chunk.text);
      // embedText returns [] only on a malformed embeddings API response.
      if (!embedding.length) continue;
```

with:

```ts
    const rows: EmbeddingRow[] = [];
    let embedTokens = 0;
    for (const chunk of chunks) {
      const { values: embedding, tokens } = await embedText(chunk.text);
      embedTokens += tokens;
      // embedText returns [] only on a malformed embeddings API response.
      if (!embedding.length) continue;
```

After `await upsertEmbeddings(rows);` (line 334), record the cost:

```ts
await upsertEmbeddings(rows);

// Fire-and-forget embedding cost attribution. The vector is shared
// (user_id may be null for Moodle); the COST belongs to whoever triggered it.
if (costUserId && embedTokens > 0) {
  await recordTokenUsage(costUserId, 'embedding', embedTokens, 0).catch(
    () => {},
  );
}

return { success: true, segmentsIndexed: rows.length, skipped: false };
```

Add the import at the top of the file:

```ts
import { recordTokenUsage } from '@/lib/ai/rate-limit';
```

- [ ] **Step 4: Record query-embedding cost in searchContext**

In `searchContext` (line ~356-358), replace:

```ts
  const userId = await getAuthUserId();
  ...
  const queryEmbedding = await embedQuery(params.query);
```

so the embed call destructures and records:

```ts
const userId = await getAuthUserId();
```

…and where `embedQuery` is called:

```ts
const { values: queryEmbedding, tokens: queryTokens } = await embedQuery(
  params.query,
);
recordTokenUsage(userId, 'embedding', queryTokens, 0).catch(() => {});
```

(Confirm `queryEmbedding` is still used by the downstream similarity call unchanged.)

- [ ] **Step 5: Thread `triggeredByUserId` from the Moodle routes**

In each of `src/app/api/moodle/upload/route.ts`, `src/app/api/moodle/upload-finalize/route.ts`, and `src/app/api/moodle/import-existing/route.ts`, every `indexContent({ type: 'moodle_file', fileId: ..., courseId: ... })` call gains `triggeredByUserId: user.id` (each route already authenticates a `user` before reaching the indexing call — use that variable; if it is named differently, e.g. `userId`, pass that). Example edit:

```ts
await indexContent({
  type: 'moodle_file',
  fileId: file.id,
  courseId,
  triggeredByUserId: user.id,
});
```

Run to find every call site to update:

Run: `grep -rn "type: 'moodle_file'" src/app/api/moodle`
Expected: update each listed call to include `triggeredByUserId`.

- [ ] **Step 6: Extend the embedding integration test**

In `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts`, add an assertion that after indexing a personal file, an `ai_token_usage` row with `model='embedding'` exists for the user with `input_tokens > 0`. Mirror the file's existing setup; add:

```ts
it('records embedding token cost for the indexing user', async () => {
  // (after the existing indexContent personal_file call in this suite)
  const { data } = await supabase
    .from('ai_token_usage')
    .select('input_tokens')
    .eq('user_id', TEST_USER_ID)
    .eq('model', 'embedding')
    .eq('usage_month', currentMonth())
    .maybeSingle();

  expect(data?.input_tokens ?? 0).toBeGreaterThan(0);
});
```

Add a cleanup of `ai_token_usage` for `TEST_USER_ID` in this file's `afterAll`/`beforeAll` (mirror the `ai-token-usage.integration.test.ts` cleanup helper) and a local `currentMonth()` if the file lacks one.

- [ ] **Step 7: Run unit + integration + typecheck**

Run: `pnpm test -- ai-context && pnpm test:integration -- personal-file-embedding && pnpm typecheck`
Expected: PASS. Then run the broader AI unit suite to catch the changed `embedText` return shape in any other caller: `pnpm test -- embeddings ai-context`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/ai-context.ts src/app/api/moodle src/lib/actions/__tests__/personal-file-embedding.integration.test.ts
git commit -m "feat(ai): attribute embedding token cost to the triggering user

Vector ownership stays shared (Moodle user_id=null); embedding cost is
attributed to whoever triggered the one-time embed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `is_admin` migration + seed admin user + deterministic dashboard seed

**Files:**

- Create: `supabase/migrations/20260604120100_profiles_is_admin.sql`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260604120100_profiles_is_admin.sql`:

```sql
-- Admin authorization flag. Authentication stays Supabase Auth (single identity);
-- this flag is the authorization gate for the /admin area. Default false so no
-- existing user becomes an admin implicitly.
ALTER TABLE public.profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Add the admin user to the seed**

In `supabase/seed.sql`, after the existing `test-b@typenote.dev` block, add an admin auth user. Mirror the existing `test@typenote.dev` `auth.users` + `auth.identities` insert (around lines 5-66), changing the id, email, and password. Use a fixed UUID `00000000-0000-4000-a000-000000000001`:

```sql
-- Admin user (local/CI only): admin@typenote.dev / Admin1234
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-a000-000000000001',
  'authenticated', 'authenticated', 'admin@typenote.dev',
  crypt('Admin1234', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"email":"admin@typenote.dev","email_verified":true,"full_name":"Admin User"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  '{"sub":"00000000-0000-4000-a000-000000000001","email":"admin@typenote.dev","email_verified":true}',
  'email', now(), now(), now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- The handle_new_user trigger creates the profile row; flip the admin flag.
UPDATE public.profiles SET is_admin = true
  WHERE id = '00000000-0000-4000-a000-000000000001';
```

(Match the exact column list of the existing `auth.users`/`auth.identities` inserts in this file — if they differ from the above, copy that block's columns verbatim and only change id/email/password/meta.)

- [ ] **Step 3: Add deterministic dashboard seed rows (fixed month `2099-01`)**

Append to `supabase/seed.sql` so the E2E has known values independent of the real date:

```sql
-- Deterministic AI-usage rows for the admin dashboard E2E (month 2099-01).
INSERT INTO public.ai_usage (user_id, usage_month, query_type, query_count, last_model)
VALUES
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', '2099-01', 'chat', 12, 'flash'),
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', '2099-01', 'latex', 30, 'flash')
ON CONFLICT (user_id, usage_month, query_type) DO NOTHING;

INSERT INTO public.ai_token_usage (user_id, usage_month, model, input_tokens, output_tokens)
VALUES
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', '2099-01', 'flash', 1000000, 500000),
  ('ac3be77d-4566-406c-9ac0-7c410634ad41', '2099-01', 'embedding', 2000000, 0)
ON CONFLICT (user_id, usage_month, model) DO NOTHING;
```

(`ac3be77d-...` is the seeded `test@typenote.dev` id, from `supabase/seed.sql:56`.)

- [ ] **Step 4: Reset DB and confirm seed applies**

Run: `pnpm supabase db reset`
Expected: completes; both new migrations applied; no seed errors.

- [ ] **Step 5: Confirm the admin flag and rows exist**

Run:

```bash
pnpm supabase db reset >/dev/null 2>&1; \
psql "$(pnpm -s supabase status | grep 'DB URL' | awk '{print $NF}')" \
  -c "select email, is_admin from profiles where email in ('admin@typenote.dev','test@typenote.dev');"
```

Expected: `admin@typenote.dev | t` and `test@typenote.dev | f`.
(If the worktree uses isolated Supabase ports, source `.env.worktree.sh` first per project memory.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260604120100_profiles_is_admin.sql supabase/seed.sql
git commit -m "feat(admin): add is_admin flag, seed admin user + deterministic usage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `requireAdmin()` guard

**Files:**

- Create: `src/lib/auth/require-admin.ts`
- Test: `src/lib/auth/__tests__/require-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/require-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound }));

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { requireAdmin } from '../require-admin';

function mockProfile(is_admin: boolean | null) {
  from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: is_admin === null ? null : { is_admin },
          error: null,
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAdmin', () => {
  it('returns the user id for an admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockProfile(true);
    await expect(requireAdmin()).resolves.toBe('admin-1');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('calls notFound for a logged-in non-admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile(false);
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- require-admin`
Expected: FAIL ("Cannot find module '../require-admin'").

- [ ] **Step 3: Implement**

Create `src/lib/auth/require-admin.ts`:

```ts
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-only authorization gate for the /admin area.
 *
 * Authentication is handled upstream by middleware (an unauthenticated /admin
 * hit is redirected to /login before any layout runs). This enforces
 * AUTHORIZATION: only an is_admin profile may proceed. Non-admins get a 404 so
 * the admin area is not discoverable. Returns the admin user id.
 */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    notFound();
  }

  return user.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- require-admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/require-admin.ts src/lib/auth/__tests__/require-admin.test.ts
git commit -m "feat(admin): add requireAdmin authorization guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Admin usage aggregate query

**Files:**

- Create: `src/lib/queries/admin-usage.ts`
- Test: `src/lib/queries/admin-usage.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/queries/admin-usage.integration.test.ts`:

```ts
/**
 * Integration test: getAdminUsage aggregates per-user usage + token cost for a
 * given month against the seeded deterministic rows (month 2099-01).
 */
import { describe, it, expect } from 'vitest';
import { getAdminUsage } from './admin-usage';

const TEST_USER_ID = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

describe('getAdminUsage (2099-01 seed)', () => {
  it('returns the seeded user with correct counts and a positive cost', async () => {
    const { users, totals } = await getAdminUsage('2099-01');
    const row = users.find((u) => u.userId === TEST_USER_ID);

    expect(row).toBeDefined();
    expect(row!.chatCount).toBe(12);
    expect(row!.latexCount).toBe(30);
    expect(row!.tokensByModel.flash).toEqual({
      input: 1000000,
      output: 500000,
    });
    expect(row!.tokensByModel.embedding.input).toBe(2000000);
    // flash 1M in*0.30 + 0.5M out*2.50 + embedding 2M*0.15 = 0.30 + 1.25 + 0.30
    expect(row!.estimatedCostUsd).toBeCloseTo(1.85, 4);
    expect(totals.estimatedCostUsd).toBeGreaterThanOrEqual(1.85);
  });

  it('returns no rows for a month with no activity', async () => {
    const { users } = await getAdminUsage('1999-01');
    expect(users).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- admin-usage`
Expected: FAIL ("Cannot find module './admin-usage'").

- [ ] **Step 3: Implement**

Create `src/lib/queries/admin-usage.ts`:

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
  /** Chat queries used as a percentage of the tier's chat limit (0-100+). */
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

const EMPTY_MODEL: ModelTokens = { input: 0, output: 0 };

/**
 * Aggregate per-user AI usage + cost for one month. Reads via the service-role
 * client (bypasses RLS) — call ONLY after requireAdmin() in a Server Component.
 */
export async function getAdminUsage(month: string): Promise<AdminUsage> {
  const admin = createAdminClient();

  const [{ data: profiles }, { data: usage }, { data: tokens }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, email, display_name, subscription_tier'),
      admin
        .from('ai_usage')
        .select('user_id, query_type, query_count')
        .eq('usage_month', month),
      admin
        .from('ai_token_usage')
        .select('user_id, model, input_tokens, output_tokens')
        .eq('usage_month', month),
    ]);

  const byUser = new Map<string, AdminUserUsage>();
  for (const p of profiles ?? []) {
    byUser.set(p.id, {
      userId: p.id,
      email: p.email,
      displayName: p.display_name ?? null,
      tier: p.subscription_tier ?? 'free',
      chatCount: 0,
      latexCount: 0,
      tokensByModel: {},
      estimatedCostUsd: 0,
      chatQuotaPct: 0,
    });
  }

  for (const u of usage ?? []) {
    const row = byUser.get(u.user_id);
    if (!row) continue;
    if (u.query_type === 'chat') row.chatCount = u.query_count;
    else if (u.query_type === 'latex') row.latexCount = u.query_count;
  }

  for (const t of tokens ?? []) {
    const row = byUser.get(t.user_id);
    if (!row) continue;
    row.tokensByModel[t.model] = {
      input: t.input_tokens,
      output: t.output_tokens,
    };
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

  // Only surface users with activity this month (sorted by cost desc — top
  // spenders first). Zero-activity users add noise; totals already exclude them
  // since their contribution is zero.
  const users = [...byUser.values()]
    .filter(
      (u) =>
        u.chatCount > 0 ||
        u.latexCount > 0 ||
        Object.keys(u.tokensByModel).length > 0,
    )
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  return { users, totals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- admin-usage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/admin-usage.ts src/lib/queries/admin-usage.integration.test.ts
git commit -m "feat(admin): add per-user usage+cost aggregate query

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Month selector component

**Files:**

- Create: `src/components/admin/month-select.tsx`

- [ ] **Step 1: Implement (no unit test — thin client wrapper, covered by E2E)**

Create `src/components/admin/month-select.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

/** Last 12 months as 'YYYY-MM', most recent first, plus any current selection. */
function recentMonths(selected: string): string[] {
  const months = new Set<string>([selected]);
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    months.add(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }
  return [...months].sort().reverse();
}

export function MonthSelect({ selected }: { selected: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Usage month"
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={selected}
      onChange={(e) => router.push(`/admin?month=${e.target.value}`)}
    >
      {recentMonths(selected).map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/month-select.tsx
git commit -m "feat(admin): add month selector component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Admin layout (gate) + dashboard page

**Files:**

- Create: `src/app/(admin)/admin/layout.tsx`
- Create: `src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Implement the gated layout**

Create `src/app/(admin)/admin/layout.tsx`:

```tsx
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // 404s for non-admins; redirects handled by middleware
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">AI Usage</h1>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Implement the dashboard page**

Create `src/app/(admin)/admin/page.tsx`:

```tsx
import { getAdminUsage } from '@/lib/queries/admin-usage';
import { MonthSelect } from '@/components/admin/month-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function tokensFor(
  tokensByModel: Record<string, { input: number; output: number }>,
  model: string,
): number {
  const t = tokensByModel[model];
  return t ? t.input + t.output : 0;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const selectedMonth = month ?? currentMonth();
  const { users, totals } = await getAdminUsage(selectedMonth);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Source-of-truth usage from the token ledger. Cost is an estimate
          (switchable via per-model price env vars).
        </p>
        <MonthSelect selected={selectedMonth} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chat queries
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.chatCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              LaTeX queries
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.latexCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.totalTokens.toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Est. cost
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {usd(totals.estimatedCostUsd)}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Chat</th>
              <th className="px-3 py-2 text-right font-medium">LaTeX</th>
              <th className="px-3 py-2 text-right font-medium">Flash tok</th>
              <th className="px-3 py-2 text-right font-medium">Pro tok</th>
              <th className="px-3 py-2 text-right font-medium">Embed tok</th>
              <th className="px-3 py-2 text-right font-medium">Est. cost</th>
              <th className="px-3 py-2 text-right font-medium">Chat quota</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.tier}</td>
                <td className="px-3 py-2 text-right">{u.chatCount}</td>
                <td className="px-3 py-2 text-right">{u.latexCount}</td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'flash').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'pro').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {tokensFor(u.tokensByModel, 'embedding').toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {usd(u.estimatedCostUsd)}
                </td>
                <td
                  className={
                    'px-3 py-2 text-right ' +
                    (u.chatQuotaPct >= 100
                      ? 'font-semibold text-destructive'
                      : u.chatQuotaPct >= 80
                        ? 'font-medium text-amber-600'
                        : '')
                  }
                >
                  {u.chatQuotaPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Confirm the shadcn Card component exists**

Run: `ls src/components/ui/card.tsx`
Expected: file exists. If missing, run `pnpm dlx shadcn@latest add card` and commit it.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (route `/admin` compiles).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)"
git commit -m "feat(admin): read-only AI usage dashboard page + gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: E2E coverage + test registry

**Files:**

- Modify: `e2e/TEST_REGISTRY.md`
- Create: `e2e/admin-dashboard.spec.ts`

- [ ] **Step 1: Update the test registry first**

In `e2e/TEST_REGISTRY.md`, add an "Admin AI Usage Dashboard" section listing:

- Admin logs in and views the usage dashboard for a seeded month (asserts totals + a seeded user row + cost).
- Non-admin is blocked from `/admin` (404).

- [ ] **Step 2: Write the E2E spec**

Create `e2e/admin-dashboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers/auth';

const ADMIN_EMAIL = process.env.ADMIN_USER_EMAIL ?? 'admin@typenote.dev';
const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD ?? 'Admin1234';

test.describe('Admin AI Usage Dashboard', () => {
  test('admin sees seeded usage for a given month', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Navigate to the deterministic seeded month (2099-01).
    await page.goto('/admin?month=2099-01');

    await expect(page.getByRole('heading', { name: 'AI Usage' })).toBeVisible();

    // Seeded test user row is present with its email.
    await expect(page.getByText('test@typenote.dev')).toBeVisible();

    // Seeded totals: 12 chat, 30 latex. Summary cards show them.
    await expect(page.getByText('Chat queries')).toBeVisible();
    await expect(page.getByText('LaTeX queries')).toBeVisible();

    // Seeded cost for the test user is $1.85 (see admin-usage seed).
    await expect(page.getByText('$1.85')).toBeVisible();
  });

  test('non-admin is blocked from /admin (404)', async ({ page }) => {
    await login(page); // seeded non-admin test@typenote.dev
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'AI Usage' })).toHaveCount(
      0,
    );
  });
});
```

- [ ] **Step 3: Run the E2E spec**

Run: `pnpm test:e2e -- admin-dashboard`
Expected: PASS (2 tests). (Requires a DB reset so the new seed rows exist: `pnpm supabase db reset` first if the local DB predates Task 9.)

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-dashboard.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(e2e): admin dashboard view + non-admin lockout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Full-suite verification

- [ ] **Step 1: Run the complete suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green. (Per project memory, run a fresh `pnpm supabase db reset` beforehand so integration + E2E see the new migrations and seed rows.)

- [ ] **Step 2: Lint + format + build**

Run: `pnpm lint && pnpm format:check && pnpm build`
Expected: PASS. `format:check` is a separate CI gate — run it before pushing.

- [ ] **Step 3: Push and open the PR to `dev`**

```bash
git push -u origin feat/ai-usage-admin-dashboard
gh pr create --base dev --title "feat: AI usage admin dashboard + accurate token ledger" \
  --body "Implements docs/superpowers/specs/2026-06-04-ai-usage-admin-dashboard-design.md.

- Accurate per-model token ledger (ai_token_usage) replacing the zeroed columns
- Real token capture for chat, latex, and per-user-attributed embeddings
- Env-overridable per-model pricing (switchable cost/token)
- Admin-only, read-only dashboard gated by is_admin + requireAdmin()
- Security fix: locked down the leaky admin_user_ai_usage view

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Notes for the implementer

- **Env vars (document in your env example / Vercel):** `AI_PRICE_FLASH_INPUT`, `AI_PRICE_FLASH_OUTPUT`, `AI_PRICE_PRO_INPUT`, `AI_PRICE_PRO_OUTPUT`, `AI_PRICE_EMBEDDING`. All optional; defaults are approximate Gemini prices.
- **Prod:** the admin user is seeded for local/CI only. In production, set `is_admin=true` on the real owner account via SQL once.
- **AI E2E has no Gemini key in CI** — the dashboard E2E deliberately asserts against _seeded_ rows, never live AI calls.
- **Worktree Supabase:** if running in an isolated worktree with its own stack, source the worktree env (`.env.worktree.sh`) before `supabase`/test commands.
