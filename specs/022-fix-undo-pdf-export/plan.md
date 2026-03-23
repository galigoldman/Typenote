# Implementation Plan: Fix Undo Content Persisting in PDF Export

**Branch**: `022-fix-undo-pdf-export` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-fix-undo-pdf-export/spec.md`

## Summary

When a user undoes an action and exports to PDF, the undone content still appears in the export. The root cause is that `onRemotePagesUpdate` in canvas-editor.tsx unconditionally overwrites the local React `pages` state with database content via `setPages(remote.pages)`. When a Supabase realtime UPDATE event arrives (from the user's own prior save or a multi-tab scenario) during the 800ms auto-save debounce window after an undo, the undone content gets re-injected into the React state. The PDF export then renders this re-injected state.

The fix: make `onRemotePagesUpdate` skip overwriting when there are local unsaved changes (i.e., when the save status is `unsaved` or a save is in-flight). This preserves the user's local undo state as the source of truth until it has been successfully persisted.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+
**Primary Dependencies**: React 19, Next.js 16 (App Router), jsPDF, Supabase Realtime
**Storage**: PostgreSQL via Supabase (documents table, `pages` JSONB column)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: 60 fps canvas rendering, instant undo/redo response
**Constraints**: Must not break multi-tab realtime sync, must not introduce race conditions
**Scale/Scope**: Single-user per document (collaborative editing not yet supported)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix builds on existing undo/save infrastructure. No new foundational features.          |
| II. Test-Driven Quality         | PASS   | Will write failing test reproducing the bug first, then fix. Unit test for the guard logic. |
| III. Protected Main Branch      | PASS   | Work on feature branch `022-fix-undo-pdf-export`, PR to main.                               |
| IV. Migrations as Code          | N/A    | No database schema changes needed.                                                          |
| V. Interview-Ready Architecture | PASS   | Will document the race condition and why the guard approach was chosen over alternatives.   |

## Project Structure

### Documentation (this feature)

```text
specs/022-fix-undo-pdf-export/
├── plan.md              # This file
├── research.md          # Root cause analysis and design decisions
├── data-model.md        # State flow diagrams
├── quickstart.md        # Developer guide for the fix
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── canvas/
│       └── canvas-editor.tsx       # Primary fix: onRemotePagesUpdate guard
├── hooks/
│   ├── use-auto-save.ts            # Expose save status for guard check
│   ├── use-document-sync.ts        # Pass save status to realtime sync
│   └── use-realtime-sync.ts        # No changes needed (guard is upstream)
└── lib/
    └── pdf/
        └── export-pdf.ts           # No changes needed (reads from React state correctly)
```

## Complexity Tracking

No constitution violations. The fix is minimal and targeted.
