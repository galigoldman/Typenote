# Tasks: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Input**: Design documents from `/specs/024-fix-latex-pdf-bugs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Required by constitution (Principle II: "When fixing a bug, MUST write a failing test that reproduces the bug first")

**Organization**: Tasks are grouped by user story. US1 and US2 are fully independent and can be implemented in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: User Story 1 - PDF Import Renders Pages Correctly (Priority: P1) MVP

**Goal**: Documents created from personal-file PDF imports display the correct PDF content as page backgrounds, using the same rendering quality as course-material PDFs.

**Independent Test**: Upload a multi-page PDF via personal files, open the created document, and verify every page shows the correct PDF content. Also verify existing course-material PDFs still render correctly.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T001 [P] [US1] Write unit test for `usePdfBackground` hook with `personalFileId` parameter in `src/hooks/use-pdf-background.test.ts` — test that the hook queries the `personal_files` table and uses the `personal-files` storage bucket when `personalFileId` is provided; test that it still works with `materialId` (regression); test that it exits cleanly when both are null
- [x] T002 [P] [US1] Write unit test for `usePdfTextLayer` hook with `personalFileId` parameter in `src/hooks/use-pdf-text-layer.test.ts` — same scenarios as T001

### Implementation for User Story 1

- [x] T003 [P] [US1] Extend `usePdfBackground` hook in `src/hooks/use-pdf-background.ts` — add `personalFileId` parameter to function signature; add conditional branch: if `personalFileId` is set, query `personal_files` table for `storage_path` and use `personal-files` bucket; keep existing `materialId` path unchanged; exit early only when both IDs are null
- [x] T004 [P] [US1] Extend `usePdfTextLayer` hook in `src/hooks/use-pdf-text-layer.ts` — mirror the same changes as T003: add `personalFileId` parameter, add `personal_files` query path with `personal-files` bucket
- [x] T005 [US1] Add `personalFileId` prop to `CanvasEditor` in `src/components/canvas/canvas-editor.tsx` — add `personalFileId?: string | null` to `CanvasEditorProps`; pass it to `usePdfBackground(materialId ?? null, { ... }, personalFileId ?? null)` call (depends on T003)
- [x] T006 [US1] Add `personalFileId` prop to `CanvasPage` in `src/components/canvas/canvas-page.tsx` — accept `personalFileId` prop; pass it to `PdfTextLayer` component alongside `materialId` (depends on T004)
- [x] T007 [US1] Pass `personalFileId` from document page in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — add `personalFileId={typedDocument.personal_file_id}` to both the `CanvasEditor` and `DocumentWithAi` render paths (depends on T005, T006)
- [x] T008 [US1] Thread `personalFileId` through `DocumentWithAi` wrapper (if it exists between page and CanvasEditor) — ensure the prop passes through any intermediate components to reach `CanvasEditor`
- [x] T009 [US1] Ensure PDF error state renders in canvas UI — verify that when `usePdfBackground` returns an error (e.g., deleted file), the canvas page shows a user-friendly error message instead of a blank page; check existing error handling in `src/components/canvas/canvas-page.tsx` and surface `pdfError` if not already displayed

**Checkpoint**: Personal-file PDFs render correctly. Course-material PDFs still work. Failing PDF loads show an error message.

---

## Phase 2: User Story 2 - LaTeX Input Box Does Not Cut Off Content (Priority: P2)

**Goal**: The LaTeX AI input box displays the full text the user has typed without visual clipping or truncation, remaining usable on viewports as narrow as 320px.

**Independent Test**: Open the LaTeX input box, type a description of 100+ characters, and verify the entire text is visible or scrollable within the input field.

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [US2] Write unit test for `MathInputBox` input width fix in `src/lib/editor/math-input-box.test.tsx` — test that the input element has the `flex-1` class; test that the outer container has a max-width constraint

### Implementation for User Story 2

- [x] T011 [US2] Fix input element width in `src/lib/editor/math-input-box.tsx` — add `flex-1` to the `<input>` element's className (alongside existing `min-w-[220px]`); add `max-w-[min(400px,calc(100vw-2rem))]` to the outer container `<div>` className to prevent viewport overflow

**Checkpoint**: LaTeX input box displays full text up to 500 characters. Works on 320px viewports.

---

## Phase 3: Polish & Cross-Cutting Concerns

- [x] T012 Run full test suite (`pnpm test`) and fix any failures
- [x] T013 Run linter (`pnpm lint`) and fix any issues
- [ ] T014 Manual validation per `specs/024-fix-latex-pdf-bugs/quickstart.md` — test both PDF import and LaTeX input box scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)** and **Phase 2 (US2)**: Fully independent — can start in parallel
- **Phase 3 (Polish)**: Depends on both Phase 1 and Phase 2 being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on US2. Internal dependency chain: T001/T002 (tests) → T003/T004 (hooks, parallel) → T005/T006 (components, parallel) → T007/T008 (page threading) → T009 (error state)
- **User Story 2 (P2)**: No dependencies on US1. Internal dependency chain: T010 (test) → T011 (fix)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Hook changes before component prop threading
- Component prop threading before page-level wiring
- Core fix before error handling polish

### Parallel Opportunities

- T001 and T002 can run in parallel (different test files)
- T003 and T004 can run in parallel (different hook files)
- T005 and T006 can run in parallel (different component files)
- US1 and US2 are fully independent and can run in parallel on separate branches

---

## Parallel Example: User Story 1

```bash
# Launch hook tests in parallel:
Task: "T001 - Unit test for usePdfBackground with personalFileId"
Task: "T002 - Unit test for usePdfTextLayer with personalFileId"

# After tests written, launch hook implementations in parallel:
Task: "T003 - Extend usePdfBackground hook"
Task: "T004 - Extend usePdfTextLayer hook"

# After hooks done, launch component updates in parallel:
Task: "T005 - Add personalFileId to CanvasEditor"
Task: "T006 - Add personalFileId to CanvasPage"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: US1 (PDF Import Fix)
2. **STOP and VALIDATE**: Import a personal-file PDF and verify pages render
3. Deploy/demo if ready — this fixes the critical bug

### Incremental Delivery

1. US1 (PDF Import) → Test independently → Critical bug fixed
2. US2 (LaTeX Input Box) → Test independently → UX improvement shipped
3. Polish → Full test suite, lint, manual validation → PR ready

---

## Notes

- No setup or foundational phase needed — this is a bug fix in an existing codebase
- No schema migrations — purely client-side code path fixes
- Constitution Principle II requires tests before implementation (TDD for bug fixes)
- [P] tasks = different files, no dependencies
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
