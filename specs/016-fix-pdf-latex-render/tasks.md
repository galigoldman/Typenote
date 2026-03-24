# Tasks: Fix PDF LaTeX Rendering

**Input**: Design documents from `/specs/016-fix-pdf-latex-render/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Included — required by constitution (Principle II: "When fixing a bug, MUST write a failing test") and CLAUDE.md testing guidelines.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Modify `math-renderer.ts` to return rendered dimensions, which all user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Modify `renderMath` in `src/lib/pdf/math-renderer.ts` to return `Promise<{ width: number; height: number }>` instead of `Promise<void>` — return `finalWidth` and `finalHeight` from the SVG/raster paths, and measure dimensions via `doc.getTextDimensions()` in the text fallback path
- [x] T002 Modify `renderMathAsText` in `src/lib/pdf/math-renderer.ts` to return `{ width: number; height: number }` — use `doc.getTextDimensions(latex)` to measure the plain-text fallback dimensions and return them

**Checkpoint**: `renderMath` now returns dimensions needed by the inline cursor. All internal fallback paths (SVG → raster → text) return valid `{ width, height }`.

---

## Phase 2: User Story 1 — Inline Math Renders as Formatted Math in PDF (Priority: P1) MVP

**Goal**: Replace the plain-text LaTeX fallback in `tiptap-to-pdf.ts` with the existing `renderMath` function from `math-renderer.ts`, so math expressions render as formatted notation in exported PDFs.

**Independent Test**: Export a document containing `$\frac{1}{2} \times 5$` and verify the PDF shows rendered fraction notation, not raw LaTeX code.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T003 [US1] Add a `makeMathExpression(latex: string)` test helper and write a failing test in `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` that asserts `renderTiptapContent` calls the mocked `renderMath` (not `doc.text` with raw LaTeX) when the document contains a `mathExpression` node
- [x] T004 [US1] Write a failing test in `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` that asserts `renderTiptapContent` returns a Promise (is async) — verifying the public API signature change

### Implementation for User Story 1

- [x] T005 [US1] Make `renderInlineContent` async in `src/lib/pdf/tiptap-to-pdf.ts` — import `renderMath` from `./math-renderer` and replace the plain-text math block (lines 328-354) with `await renderMath(doc, latex, cursorX, cursorY - lineHeight * 0.8, remainingWidth, lineHeight)`, using the returned `{ width }` to advance `cursorX`
- [x] T006 [US1] Make all internal renderer functions async in `src/lib/pdf/tiptap-to-pdf.ts` — add `async` keyword and `await` to: `renderParagraph`, `renderHeading`, `renderListItem`, `renderBulletList`, `renderOrderedList`, `renderTaskList`, `renderBlockquote`, `renderNode`
- [x] T007 [US1] Make `renderTiptapContent` (public API) async in `src/lib/pdf/tiptap-to-pdf.ts` — change return type from `number` to `Promise<number>`, add `async` keyword, and `await renderNode` calls in the main loop
- [x] T008 [P] [US1] Make `renderCanvasPage` async in `src/lib/pdf/canvas-page-renderer.ts` — change return type to `Promise<void>`, add `async` keyword, and `await renderTiptapContent` calls for flow content and text boxes
- [x] T009 [P] [US1] Make `renderTextDocument` async in `src/lib/pdf/text-document-renderer.ts` — change return type to `Promise<void>`, add `async` keyword, and `await renderTiptapContent` calls in the pagination loop
- [x] T010 [US1] Add `await` to `renderCanvasPage` and `renderTextDocument` calls in `src/lib/pdf/export-pdf.ts` — these are already inside an async function, so just prefix with `await`
- [x] T011 [US1] Update all existing tests in `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` to use `await` on `renderTiptapContent` calls — mock `renderMath` from `../math-renderer` to return resolved `{ width: 50, height: 14 }`; update all test functions to be `async`
- [x] T012 [US1] Update all existing tests in `src/lib/pdf/__tests__/export-pdf.test.ts` to handle the now-async `renderCanvasPage` and `renderTextDocument` mocks — ensure mock implementations return resolved Promises

**Checkpoint**: Math expressions render as formatted notation in exported PDFs. All existing tests pass with async signatures. The core bug is fixed.

---

## Phase 3: User Story 2 — Math Text Is Selectable in PDF (Priority: P2)

**Goal**: Verify that the SVG vector rendering path produces selectable, copyable text in standard PDF readers. This is inherent to the KaTeX → SVG → `doc.svg()` approach from US1, so this phase focuses on verification and KaTeX CSS correctness.

**Independent Test**: Open an exported PDF in Chrome's viewer, click-drag over a math expression, and confirm it highlights and can be copied.

### Implementation for User Story 2

- [x] T013 [US2] Verify KaTeX CSS inlining in `src/lib/pdf/math-renderer.ts` — ensure `collectKatexStyles()` captures KaTeX font-face rules and that the `buildForeignObjectSvg` function preserves the XHTML namespace correctly for vector text embedding; add inline comment documenting why this produces selectable text
- [ ] T014 [US2] Manual verification: export a test document with math, open in Chrome PDF viewer, verify math text is selectable and copyable (document results in a code comment in `src/lib/pdf/math-renderer.ts`)

**Checkpoint**: Math in PDFs is selectable in Chrome, Adobe Acrobat, and Apple Preview.

---

## Phase 4: User Story 3 — Graceful Fallback for Rendering Failures (Priority: P3)

**Goal**: Ensure the 3-tier fallback chain (SVG vector → canvas rasterization → plain text) works correctly end-to-end when integrated into the inline rendering pipeline.

**Independent Test**: Export a document with `$\frac{1}{$` (malformed LaTeX) and verify the PDF exports successfully with visible fallback text.

### Tests for User Story 3

- [x] T015 [US3] Write a test in `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` that mocks `renderMath` to reject (throw), and asserts that `renderTiptapContent` still completes without throwing — verifying the fallback is handled gracefully at the integration layer

### Implementation for User Story 3

- [x] T016 [US3] Add error handling around the `await renderMath()` call in `renderInlineContent` in `src/lib/pdf/tiptap-to-pdf.ts` — wrap in try/catch, and on failure fall back to rendering the raw LaTeX string as monospace text (the existing plain-text logic), ensuring the cursor still advances correctly
- [x] T017 [US3] Verify that `renderMath` in `src/lib/pdf/math-renderer.ts` returns valid dimensions from all three fallback tiers — ensure the text fallback (`renderMathAsText`) returns measured dimensions via `doc.getTextDimensions()` so the inline cursor advances even on failure

**Checkpoint**: PDF export never crashes due to math rendering errors. Invalid LaTeX shows as readable fallback text.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories

- [x] T018 Run full test suite (`pnpm test`) and fix any failures in `src/lib/pdf/`
- [x] T019 Run linter (`pnpm lint`) and formatter (`pnpm format:check`) — fix any issues introduced by async changes
- [ ] T020 Run quickstart.md manual validation: export a document with mixed content (text + math + drawings) and verify correct output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Foundational (Phase 1) — CORE FIX
- **User Story 2 (Phase 3)**: Depends on US1 completion (SVG rendering must work first)
- **User Story 3 (Phase 4)**: Depends on US1 completion (must have `renderMath` integration to add error handling around it)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 1 only — delivers the MVP fix
- **User Story 2 (P2)**: Depends on US1 — verifies selectability of the SVG vector approach
- **User Story 3 (P3)**: Depends on US1 — adds error handling around the `renderMath` integration point

### Within Each User Story

- Tests written FIRST, verified to FAIL
- Implementation follows
- Existing tests updated alongside new code
- Story validated at checkpoint before proceeding

### Parallel Opportunities

- T008 and T009 can run in parallel (different files: canvas-page-renderer vs text-document-renderer)
- T001 and T002 are in the same file but independent functions — can be done together
- T003 and T004 are independent tests — can run in parallel

---

## Parallel Example: User Story 1

```bash
# After T007 completes (public API async), these can run in parallel:
Task T008: "Make renderCanvasPage async in src/lib/pdf/canvas-page-renderer.ts"
Task T009: "Make renderTextDocument async in src/lib/pdf/text-document-renderer.ts"

# Tests T003 and T004 can also run in parallel:
Task T003: "Failing test: renderMath called for mathExpression nodes"
Task T004: "Failing test: renderTiptapContent returns a Promise"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001-T002)
2. Complete Phase 2: User Story 1 (T003-T012)
3. **STOP and VALIDATE**: Export a PDF with math — verify rendered notation, not raw code
4. Run `pnpm test` — all tests must pass

### Incremental Delivery

1. Phase 1 → Foundation ready
2. Phase 2 (US1) → Core bug fixed, math renders as notation → **Deploy/Demo (MVP!)**
3. Phase 3 (US2) → Verify selectability → Deploy/Demo
4. Phase 4 (US3) → Error handling hardened → Deploy/Demo
5. Phase 5 → Polish and final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2 is primarily verification (selectability is inherent to the SVG approach)
- US3 adds defensive error handling around the US1 integration point
- The `measureNodeHeight` function in `tiptap-to-pdf.ts` does NOT need async changes — it only estimates height and doesn't call `renderMath`
- Commit after each completed phase
