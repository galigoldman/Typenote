# Implementation Plan: Fix PDF Export Page Deletion

**Branch**: `039-fix-pdf-export-page-loss` | **Date**: 2026-04-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/039-fix-pdf-export-page-loss/spec.md`

## Summary

Fix two bugs that combine to cause pages to disappear from the editor after PDF export: (1) `pageHasContent()` doesn't recognize math/LaTeX nodes as content, causing trailing math-only pages to be silently stripped during auto-save; (2) the Realtime echo guard's 5-second time window can expire during the blocking print dialog, allowing the stripped DB state to overwrite local state via `onRemotePagesUpdate`. Add a page-count guard and an E2E test that creates 6 pages, exports, waits, and verifies all pages remain.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror), KaTeX, Supabase Realtime
**Storage**: N/A — no database changes, client-side only
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop + iPad Safari)
**Project Type**: Web application
**Performance Goals**: N/A — bug fix, no performance changes
**Constraints**: Fix must not break existing auto-save, Realtime sync, or PDF export
**Scale/Scope**: 4 files modified, 2 test files (1 modified, 1 new)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status  | Notes                                                     |
| ------------------------------- | ------- | --------------------------------------------------------- |
| I. Incremental Development      | ✅ PASS | Bug fix on existing infrastructure, no new features       |
| II. Test-Driven Quality         | ✅ PASS | Adding unit tests for the fix + E2E test per user request |
| III. Protected Branches         | ✅ PASS | Feature branch off `dev`, will PR to `dev`                |
| IV. Migrations as Code          | ✅ N/A  | No database changes                                       |
| V. Interview-Ready Architecture | ✅ PASS | Race condition fix is a classic concurrency topic         |

**Post-design re-check**: ✅ All gates still pass. No new dependencies, no schema changes, no complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/039-fix-pdf-export-page-loss/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Created by /speckit.tasks
```

### Source Code (repository root)

```text
src/components/canvas/
├── page-utils.ts                          # Fix pageHasContent()
├── canvas-editor.tsx                      # Add page-count guard in onRemotePagesUpdate
└── __tests__/
    ├── page-utils.test.ts                 # Add math content tests
    └── canvas-editor-undo-export.test.ts  # Add page-count guard tests

e2e/
├── export-pdf-page-persistence.spec.ts    # New E2E test
├── TEST_REGISTRY.md                       # Update with new scenarios
└── helpers/
    └── auth.ts                            # Existing login helper (used by new test)
```

**Structure Decision**: All changes are within existing directories. One new E2E test file. No new dependencies, no new directories.
