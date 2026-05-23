# Implementation Plan: Homework AI Context

**Branch**: `046-homework-ai-context` | **Date**: 2026-05-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/046-homework-ai-context/spec.md`

## Summary

Add a "Start Homework" flow to courses that lets students select an exercise document and reference materials, then creates a homework document where the AI chat automatically has full context of the exercise questions and selected materials. Requires two new database tables (`homework_sessions`, `homework_session_materials`), a selection dialog, server actions for creating/reading homework sessions, and extensions to the AI context pipeline to inject exercise + material content into conversations.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, Supabase SSR, TipTap 3, shadcn/ui, `@google/genai`
**Storage**: PostgreSQL via Supabase — new `homework_sessions` and `homework_session_materials` tables
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web (desktop + tablet browsers)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Homework session creation < 2s, AI context injection adds < 500ms to first response
**Constraints**: Subject to existing AI rate limits and quotas; exercise content must fit within Gemini context window
**Scale/Scope**: Typical course has 5-30 documents and 10-50 materials

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
| --- | --- | --- |
| I. Incremental Development | PASS | Feature builds on existing document creation, AI chat, and course materials infrastructure. DB schema first, then server actions, then UI, then AI integration. |
| II. Test-Driven Quality | PASS | Plan includes unit tests for server actions, integration tests for DB operations + RLS, and E2E tests for the full user flow. |
| III. Protected Branches | PASS | Working on `046-homework-ai-context` branch. Will PR to `dev`. |
| IV. Migrations as Code | PASS | New tables created via `supabase migration new`. Seed data updated. |
| V. Interview-Ready Architecture | PASS | Normalized relational model (junction table), polymorphic associations, server-side context injection — all strong interview topics. |

**Post-Phase 1 re-check**: All gates still pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/046-homework-ai-context/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: design decisions
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: implementation guide
├── contracts/
│   ├── api.md           # Server action & API contracts
│   └── ui.md            # Component prop contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
supabase/migrations/
└── YYYYMMDDHHMMSS_create_homework_sessions.sql   # New tables + RLS

src/types/
└── database.ts                    # + HomeworkSession, HomeworkSessionMaterial, HomeworkContext types

src/lib/actions/
└── homework.ts                    # NEW: createHomeworkSession, getHomeworkContext server actions

src/lib/ai/
└── prompts.ts                     # MODIFIED: add isHomeworkMode to buildSystemPrompt

src/app/api/ai/ask/
└── route.ts                       # MODIFIED: handle homeworkSessionId, fetch + inject context

src/components/dashboard/
└── start-homework-dialog.tsx      # NEW: exercise + materials selection dialog

src/components/ai/
├── homework-context-badges.tsx    # NEW: shows linked context in chat panel
├── ai-chat-panel.tsx              # MODIFIED: accept + display homework context
├── ai-chat-wrapper.tsx            # MODIFIED: pass through homework props
└── document-with-ai.tsx           # MODIFIED: pass through homework props

src/app/(dashboard)/dashboard/
├── courses/[courseId]/page.tsx     # MODIFIED: add StartHomeworkDialog button
└── documents/[docId]/page.tsx     # MODIFIED: fetch homework context, pass to DocumentWithAi

src/lib/actions/
└── homework.integration.test.ts   # NEW: integration tests

e2e/
└── homework.spec.ts               # NEW: E2E test for full homework flow
```

**Structure Decision**: Follows the existing project structure — server actions in `src/lib/actions/`, components in `src/components/`, API routes in `src/app/api/`. No new directories or structural patterns introduced.
