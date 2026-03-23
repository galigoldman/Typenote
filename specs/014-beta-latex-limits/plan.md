# Implementation Plan: Beta Tester AI Limits & LaTeX Quota Separation

**Branch**: `014-beta-latex-limits` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-beta-latex-limits/spec.md`

## Summary

Add a "beta" subscription tier (100 chat/month, 500 LaTeX/month, Flash-only), separate LaTeX from chat quota tracking, pass course name to LaTeX prompts for better accuracy, and lock deep mode to pro tier only. Admin observability via SQL view showing per-user query counts + token totals. Token counts stored via fire-and-forget UPDATE after each AI call (non-blocking, not used for enforcement).

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+ / Next.js 16 (App Router)
**Primary Dependencies**: `@google/genai` (chat streaming), `@ai-sdk/google` + `ai` (LaTeX via generateText), `@supabase/ssr`
**Storage**: PostgreSQL via Supabase — modifying `ai_usage` table, `increment_ai_usage` and `get_ai_quota` RPC functions
**Testing**: Vitest (unit + integration), existing test suite for rate-limit, latex route, quota route, chat panel
**Target Platform**: Vercel (serverless)
**Project Type**: Web application (Next.js App Router)
**Constraints**: Fail-closed rate limiting. No new infrastructure. Token tracking is fire-and-forget (non-blocking).
**Scale/Scope**: ~50 beta users initially. ~100-500 AI queries/user/month.

## Constitution Check

_No constitution file found. Skipping gate check._

## Project Structure

### Documentation (this feature)

```text
specs/014-beta-latex-limits/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Schema changes and entity relationships
├── quickstart.md        # Implementation guide and file map
├── contracts/
│   └── rate-limit-api.md  # API contract changes
├── checklists/
│   └── requirements.md    # Spec quality checklist
└── tasks.md             # Task list
```

### Source Code (files affected)

```text
supabase/migrations/
└── 00018_beta_latex_quota_separation.sql    # NEW — schema + RPC changes + admin view

src/lib/ai/
├── rate-limit.ts              # MODIFY — beta tier, query_type, LaTeX limits
├── latex.ts                   # MODIFY — accept courseName
└── prompts.ts                 # MODIFY — buildLatexPrompt helper

src/app/api/ai/
├── latex/route.ts             # MODIFY — courseName param, LaTeX quota type, token recording
├── ask/route.ts               # MODIFY — deep mode restriction, token recording
└── quota/route.ts             # MODIFY — per-type response shape

src/components/ai/
└── ai-chat-panel.tsx          # MODIFY — split quota display, lock deep mode

src/components/editor/
├── math-node-view.tsx         # MODIFY — pass courseName to /api/ai/latex
└── tiptap-editor.tsx          # MODIFY — pass courseName to /api/ai/latex

src/components/canvas/
└── canvas-editor.tsx          # MODIFY — pass courseName to /api/ai/latex
```

**Structure Decision**: No new directories. All changes extend existing files and patterns. One new migration file.

## Design Decisions

### 1. Query Type Separation (see [research.md](./research.md#2-query-type-separation-strategy))

Add `query_type` column to `ai_usage` with values `'chat'` and `'latex'`. Update unique index to include it. Single table, separate counters.

### 2. Fire-and-Forget Token Tracking (see [research.md](./research.md#3-observability--fire-and-forget-token-tracking))

Token counts (input + output) stored via async `UPDATE` after each AI call. Not in the atomic rate-limit RPC — separate, non-blocking. If it fails, the query still succeeds. LaTeX: from `generateText` result. Chat: captured after stream completes. Gives admins visibility into actual token consumption per user.

### 3. Deep Mode Restriction (see [research.md](./research.md#4-deep-mode-restriction))

Server-side: `/api/ai/ask` checks tier before processing `mode: 'deep'`. Returns 403 for non-pro.
Client-side: Chat panel reads `deepModeAvailable` from quota response, disables toggle with lock icon.

### 4. Course Context for LaTeX (see [research.md](./research.md#5-course-context-for-latex))

`courseName` passed as optional body param to `/api/ai/latex`. Appended to user prompt text. ~10-15 extra tokens.

### 5. Quota API Response Shape (see [contracts/rate-limit-api.md](./contracts/rate-limit-api.md))

Breaking change from flat `{ used, limit, remaining }` to nested `{ chat: {...}, latex: {...}, tier, resetsAt, deepModeAvailable }`. Chat panel component updated in same PR.

## Tier Limits Summary

| Tier | Chat | LaTeX | Deep Mode |
| ---- | ---- | ----- | --------- |
| free | 50   | 150   | blocked   |
| beta | 100  | 500   | blocked   |
| pro  | 500  | 1500  | allowed   |

All limits configurable via environment variables without redeployment.
