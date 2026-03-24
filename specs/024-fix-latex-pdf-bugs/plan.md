# Implementation Plan: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Branch**: `024-fix-latex-pdf-bugs` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-fix-latex-pdf-bugs/spec.md`

## Summary

Fix two bugs: (1) Personal-file PDF imports show empty pages because the PDF rendering hooks only query the `course_materials` table — extend hooks to also support `personal_files` with the `personal-files` storage bucket. (2) LaTeX AI input box clips long text because the `<input>` element lacks `flex-1` — add flex-grow so the input fills available space.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, pdfjs-dist, TipTap 3, KaTeX, Supabase SSR
**Storage**: PostgreSQL via Supabase (`documents`, `course_materials`, `personal_files` tables) + Supabase Storage (3 buckets: `course-materials`, `moodle-materials`, `personal-files`)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (modern browsers)
**Project Type**: Web application
**Performance Goals**: PDF pages render without perceptible delay (same performance as existing course-material PDFs)
**Constraints**: No new dependencies, no schema migrations
**Scale/Scope**: Bug fix — 6 files modified, ~50 lines changed

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                             |
| ------------------------------- | ------ | ----------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing infrastructure; no new advanced features      |
| II. Test-Driven Quality         | PASS   | Will add/update unit tests for modified hooks and component       |
| III. Protected Main Branch      | PASS   | Working on feature branch `024-fix-latex-pdf-bugs`                |
| IV. Migrations as Code          | PASS   | No schema changes needed                                          |
| V. Interview-Ready Architecture | PASS   | Fix follows existing patterns; extends hooks with a second source |

**Post-Phase 1 re-check**: PASS — No violations. The fix adds a conditional code path to existing hooks using the same patterns already established for course materials vs. moodle materials.

## Project Structure

### Documentation (this feature)

```text
specs/024-fix-latex-pdf-bugs/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── hooks/
│   ├── use-pdf-background.ts          # Add personalFileId support
│   └── use-pdf-text-layer.ts          # Add personalFileId support
├── components/
│   └── canvas/
│       ├── canvas-editor.tsx          # Accept & pass personalFileId
│       └── canvas-page.tsx            # Pass personalFileId to PdfTextLayer
├── lib/
│   └── editor/
│       └── math-input-box.tsx         # Fix input width (add flex-1, max-w)
└── app/
    └── (dashboard)/
        └── dashboard/
            └── documents/
                └── [docId]/
                    └── page.tsx       # Pass personalFileId to editor
```

## Implementation Phases

### Phase 1: Fix PDF Import Empty Page (P1)

**Why**: This is the higher-impact bug — the feature is completely non-functional.

#### Step 1.1: Extend `usePdfBackground` hook

**File**: `src/hooks/use-pdf-background.ts`

- Change function signature to accept `source: { materialId?: string | null; personalFileId?: string | null }` (or add a second parameter `personalFileId`)
- Inside the effect, determine which source to use:
  - If `materialId`: existing path — query `course_materials`, use `course-materials`/`moodle-materials` bucket
  - If `personalFileId`: new path — query `personal_files` table for `storage_path`, use `personal-files` bucket
- Exit early only when both are null/undefined

**Interview concept**: This is the **Strategy pattern** — same rendering logic, different data source resolution based on the document's origin.

#### Step 1.2: Extend `usePdfTextLayer` hook

**File**: `src/hooks/use-pdf-text-layer.ts`

- Mirror the same changes as `usePdfBackground`: accept `personalFileId`, add conditional query path for `personal_files` table with `personal-files` bucket.

#### Step 1.3: Thread `personalFileId` through the component tree

**Files**:

- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — pass `personalFileId={typedDocument.personal_file_id}` alongside `materialId`
- `src/components/canvas/canvas-editor.tsx` — accept `personalFileId` prop, pass to `usePdfBackground`
- `src/components/canvas/canvas-page.tsx` — accept `personalFileId` prop, pass to `PdfTextLayer`
- Any wrapper component (e.g., `DocumentWithAi`) that sits between the page and CanvasEditor

#### Step 1.4: Add error state for missing PDFs

When a linked PDF cannot be loaded (deleted file, corrupted, etc.), display a user-friendly error message instead of a blank page. The hooks already have error state — ensure it surfaces in the UI.

#### Step 1.5: Tests

- Update existing `use-pdf-background` tests (if any) or create new ones to verify:
  - Hook loads PDF when `personalFileId` is provided
  - Hook loads PDF when `materialId` is provided (regression)
  - Hook exits cleanly when both are null
- Update personal-files integration test to verify document creation with correct fields

### Phase 2: Fix LaTeX Input Box Cutoff (P2)

**Why**: Lower impact — feature works but UX is degraded.

#### Step 2.1: Fix input element width

**File**: `src/lib/editor/math-input-box.tsx`

- Add `flex-1` to the `<input>` className so it grows to fill the flex row
- Add `max-w-[min(400px,calc(100vw-2rem))]` to the outer container `<div>` to prevent it from growing beyond viewport
- Keep `min-w-[220px]` as a floor for when the input is empty

#### Step 2.2: Tests

- Update `src/lib/editor/math-input-box.test.tsx` to verify:
  - Input element has `flex-1` class (or renders at appropriate width)
  - Long text (500 characters) is fully visible/scrollable

## Risk Assessment

| Risk                                                               | Likelihood | Impact | Mitigation                                                          |
| ------------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------- |
| Regression in course-material PDF rendering                        | Low        | High   | Explicit regression test; no changes to course_materials query path |
| `personal_files` table RLS prevents hook from reading storage_path | Medium     | High   | Verify RLS policy allows authenticated user to read their own files |
| Input width fix causes layout overflow on mobile                   | Low        | Low    | `max-w` with viewport calc prevents overflow                        |
