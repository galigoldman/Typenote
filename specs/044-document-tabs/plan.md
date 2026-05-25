# Implementation Plan: Document Tabs

**Branch**: `044-document-tabs` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/044-document-tabs/spec.md`

## Summary

Add a browser-style tab bar to the document editor so users can open multiple documents simultaneously and switch between them instantly, without full page reloads. Tabs are managed entirely client-side via React context, persisted to localStorage, and synced to the URL. No database changes required.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, TipTap 3, Supabase SSR, shadcn/ui, Tailwind CSS 4
**Storage**: localStorage (client-side tab state only) — no Supabase schema changes
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Tab switch < 0.5s perceived latency, tab bar usable with 20+ tabs
**Constraints**: Must not break existing document save/sync, realtime, or version history
**Scale/Scope**: Affects document editor route and sidebar navigation components

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                           | Status | Notes                                                                                                                                                                                   |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Incremental Development**      | PASS   | Builds on existing document infrastructure. No new foundational work skipped. Feature is purely a UI/UX enhancement on top of solid CRUD.                                               |
| **II. Test-Driven Quality**         | PASS   | Plan includes unit tests for tab state logic, E2E tests for tab user flows.                                                                                                             |
| **III. Protected Branches**         | PASS   | Working on `044-document-tabs` branch off `dev`. PR to `dev` when complete.                                                                                                             |
| **IV. Migrations as Code**          | N/A    | No database changes. All state is client-side localStorage.                                                                                                                             |
| **V. Interview-Ready Architecture** | PASS   | Tab state management pattern (context + localStorage persistence) is a strong interview topic — demonstrates React state architecture, separation of concerns, and client-side caching. |

**Post-Phase 1 Re-check**: All gates still pass. No database changes introduced. Client-side architecture remains simple (context + localStorage).

## Project Structure

### Documentation (this feature)

```text
specs/044-document-tabs/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technical decisions
├── data-model.md        # Phase 1: client-side state model
├── quickstart.md        # Phase 1: developer onboarding
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (new and modified files)

```text
src/
├── contexts/
│   └── tabs-context.tsx           # NEW — TabsProvider, useTabsContext hook
├── components/
│   └── tabs/
│       ├── tab-bar.tsx            # NEW — horizontal tab bar component
│       └── tab-item.tsx           # NEW — individual tab (title + close button)
├── hooks/
│   └── use-tabs-persistence.ts    # NEW — localStorage read/write + validation
├── app/(dashboard)/dashboard/documents/
│   └── [docId]/
│       └── page.tsx               # MODIFIED — integrate TabsProvider, render active tab
├── components/dashboard/
│   ├── document-card.tsx          # MODIFIED — intercept navigation to open tab
│   ├── sidebar-folder-tree.tsx    # MODIFIED — intercept navigation to open tab
│   └── sidebar-layout.tsx         # MODIFIED — mount TabsProvider at layout level
└── lib/actions/
    └── documents.ts               # MODIFIED — add getDocument() server action (if not exists)

src/__tests__/
├── contexts/
│   └── tabs-context.test.ts       # Unit tests for tab state logic
└── hooks/
    └── use-tabs-persistence.test.ts # Unit tests for localStorage persistence

e2e/
└── document-tabs.spec.ts          # E2E tests for tab user flows
```

**Structure Decision**: This is a Next.js web application. New files are placed in existing `src/` directories following established conventions: contexts in `src/contexts/`, components in `src/components/tabs/`, hooks in `src/hooks/`. Tests mirror source structure.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.
