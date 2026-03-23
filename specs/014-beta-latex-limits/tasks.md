# Tasks: Beta Tester AI Limits & LaTeX Quota Separation

**Feature**: `014-beta-latex-limits`
**Branch**: `014-beta-latex-limits`
**Date**: 2026-03-23
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Implementation Strategy

**MVP scope**: US1 + US2 (Phase 1–4) — beta tier with separate chat/LaTeX quotas, deep mode lock, and token tracking. Minimum to onboard beta testers safely.

**Incremental delivery**: Each phase is a working, testable increment.

## Dependencies

```
Phase 1 (Setup) ──► Phase 2 (Foundational) ──┬──► Phase 3 (US1: Beta + Deep Mode)
                                               └──► Phase 4 (US2: LaTeX Quota)
                                                     │
                                              Phase 3+4 ──┬──► Phase 5 (US3: Course Context)
                                                           └──► Phase 6 (US4: Quota Display)
                                                                │
                                                         Phase 5+6 ──► Phase 7 (Polish)
```

**Parallel**: Phase 3 and Phase 4 can run simultaneously. Within Phase 5, T011–T013 are parallel.

---

## Phase 1: Setup

**Goal**: Database schema changes that all subsequent work depends on.

- [x] T001 Create migration in supabase/migrations/00018_beta_latex_quota_separation.sql — add `query_type TEXT NOT NULL DEFAULT 'chat'`, `total_input_tokens BIGINT NOT NULL DEFAULT 0`, `total_output_tokens BIGINT NOT NULL DEFAULT 0` columns to `ai_usage`; drop old unique index `ai_usage_user_month_idx` and create new `ai_usage_user_month_type_idx` on `(user_id, usage_month, query_type)`; update `increment_ai_usage` RPC to accept `p_query_type text DEFAULT 'chat'`, upsert keyed on `(user_id, usage_month, query_type)`, resolve limits by tier+query_type (free: 50/150, beta: 100/500, pro: 500/1500 for chat/latex); update `get_ai_quota` RPC to return one row per query_type; create `admin_user_ai_usage` VIEW joining profiles with ai_usage showing query_count + token totals. See data-model.md.

---

## Phase 2: Foundational

**Goal**: Application-layer rate limiting supports beta tier, query types, LaTeX limits, and token recording utility.

- [x] T002 Update src/lib/ai/rate-limit.ts — add `'beta': 100` to `DEFAULT_LIMITS`, add `DEFAULT_LATEX_LIMITS` map `{ free: 150, beta: 500, pro: 1500 }`, update `resolveLimitForTier` to accept optional `queryType: 'chat' | 'latex'` and check `AI_LATEX_LIMIT_{TIER}` env vars for latex, update `checkAndIncrementUsage` to accept `queryType` param and pass `p_query_type` to RPC, update `getQuota` to return `{ chat: {used, limit, remaining}, latex: {used, limit, remaining}, tier, resetsAt, deepModeAvailable }`, add `recordTokenUsage(userId: string, queryType: 'chat' | 'latex', inputTokens: number, outputTokens: number)` that does a fire-and-forget `UPDATE ai_usage SET total_input_tokens = total_input_tokens + $1, total_output_tokens = total_output_tokens + $2 WHERE user_id = $3 AND usage_month = current AND query_type = $4` — catch and log errors, never throw
- [x] T003 Update src/lib/ai/**tests**/rate-limit.test.ts — test beta tier limit (100), LaTeX limits per tier, `checkAndIncrementUsage` with `queryType='latex'`, `getQuota` returning separate chat/latex, `deepModeAvailable` per tier, env var overrides, `recordTokenUsage` calls supabase update (mock)

---

## Phase 3: US1 — Beta Tier + Deep Mode Restriction (P1)

**Goal**: Beta users can chat (Flash only, 100/month). Deep mode blocked for non-pro.
**Independent test**: Set user to beta → `mode:'deep'` returns 403. 100 chats succeed. Chat 101 returns 429.

- [x] T004 [US1] Update src/app/api/ai/ask/route.ts — after auth, fetch user tier; if `mode === 'deep'` and tier !== `'pro'`, return 403 `{ error: 'deep_mode_restricted', message: "Deep mode is available on the Pro plan.", tier }`; update `checkAndIncrementUsage` call to pass `queryType: 'chat'`; after stream completes (in the `finally` block alongside assistant message persistence), call `recordTokenUsage(user.id, 'chat', inputTokens, outputTokens)` — extract usage from the Gemini stream result if available
- [x] T005 [US1] Update src/app/api/ai/ask/rate-limit.test.ts — test beta+deep→403, pro+deep→success, beta at 100→allowed, beta at 101→429

---

## Phase 4: US2 — LaTeX Quota Separation (P1)

**Goal**: LaTeX uses its own counter. Chat and LaTeX quotas are independent.
**Independent test**: Exhaust chat quota → LaTeX works. Exhaust LaTeX quota → chat works.

- [x] T006 [P] [US2] Update src/app/api/ai/latex/route.ts — change `checkAndIncrementUsage(user.id, 'quick')` to `checkAndIncrementUsage(user.id, 'flash', 'latex')`; update 429 message to "Monthly LaTeX quota exceeded"; after `convertToLatex` call, call `recordTokenUsage(user.id, 'latex', usage.promptTokens, usage.completionTokens)` from the generateText result; accept optional `courseName` in body (string, max 200 chars) to prepare for US3
- [x] T007 [P] [US2] Update src/app/api/ai/latex/route.test.ts — test queryType='latex' passed to RPC, 429 says LaTeX quota, token recording called, courseName accepted but optional

---

## Phase 5: US3 — Course Context for LaTeX (P2)

**Goal**: LaTeX queries include course name for better notation accuracy.
**Independent test**: `/api/ai/latex` with `courseName: "Linear Algebra"` → prompt includes course.

- [x] T008 [US3] Update src/lib/ai/prompts.ts — add `buildLatexPrompt(courseName?: string): string` returning LATEX_SYSTEM_PROMPT with appended `\nThe student is in the course: {courseName}. Use notation conventions appropriate for this subject.` when courseName provided
- [x] T009 [US3] Update src/lib/ai/latex.ts — change signature to `convertToLatex(text, courseName?)`, use `buildLatexPrompt(courseName)` as system prompt, return the full `generateText` result so route can access `result.usage`; update src/app/api/ai/latex/route.ts to pass `courseName` to `convertToLatex`
- [x] T010 [US3] Update tests: src/lib/ai/latex.test.ts (courseName passthrough), src/lib/ai/**tests**/prompts.test.ts (buildLatexPrompt with/without courseName)
- [x] T011 [P] [US3] Update src/components/editor/math-node-view.tsx — include `courseName` in `/api/ai/latex` fetch body; source courseName from component props or parent page context
- [x] T012 [P] [US3] Update src/components/editor/tiptap-editor.tsx — include `courseName` in `/api/ai/latex` fetch body
- [x] T013 [P] [US3] Update src/components/canvas/canvas-editor.tsx — include `courseName` in `/api/ai/latex` fetch body

---

## Phase 6: US4 — Split Quota Display + Deep Mode Lock (P2)

**Goal**: Users see separate chat/LaTeX counters. Deep mode toggle locked for non-pro.
**Independent test**: Beta user opens chat panel → sees "42 of 100 chat" + "123 of 500 LaTeX". Deep toggle disabled with lock.

- [x] T014 [US4] Update src/app/api/ai/quota/route.ts — call updated `getQuota(user.id)`, return `{ chat: {...}, latex: {...}, tier, resetsAt, deepModeAvailable }` per contracts/rate-limit-api.md
- [x] T015 [US4] Update src/components/ai/ai-chat-panel.tsx — change `QuotaInfo` type to new nested shape; replace single quota line with "Chat: X of Y" + "LaTeX: X of Y"; disable input only when chat.remaining === 0; when `deepModeAvailable === false`, disable deep button with lock icon (Lock from lucide-react), force mode to 'quick'; update optimistic decrement to touch `chat.used` only
- [x] T016 [US4] Update tests: src/app/api/ai/quota/route.test.ts (new shape, deepModeAvailable), src/components/ai/ai-chat-panel.test.tsx (split display, locked deep mode, input disabled on chat=0 only)

---

## Phase 7: Polish

- [x] T017 Update src/lib/queries/ai-usage.integration.test.ts — test RPC with query_type='latex', independent counters, beta tier, token columns updated
- [x] T018 Run full test suite (`npm test`) and fix any failures
- [x] T019 Run linter (`npx prettier --write .`) and fix formatting

---

## Summary

| Phase                     | Story | Tasks        | Parallel                  |
| ------------------------- | ----- | ------------ | ------------------------- |
| 1: Setup                  | —     | T001         | —                         |
| 2: Foundational           | —     | T002–T003    | —                         |
| 3: US1 (Beta + Deep Mode) | P1    | T004–T005    | With Phase 4              |
| 4: US2 (LaTeX Quota)      | P1    | T006–T007    | With Phase 3              |
| 5: US3 (Course Context)   | P2    | T008–T013    | T011, T012, T013 parallel |
| 6: US4 (Quota Display)    | P2    | T014–T016    | —                         |
| 7: Polish                 | —     | T017–T019    | —                         |
| **Total**                 |       | **19 tasks** |                           |
