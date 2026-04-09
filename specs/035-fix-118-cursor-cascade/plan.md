# Implementation Plan: Fix Cursor Jumps in Multi-Page Reflow Cascade (#118 follow-up)

**Branch**: `035-fix-118-cursor-cascade` | **Date**: 2026-04-09 | **Spec**: [./spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-fix-118-cursor-cascade/spec.md`

## Summary

The branch `fix/118-reflow-surgical` already lands content correctly when text overflows from one page's text box to the next. The remaining bugs are entirely about **where the cursor ends up** after a multi-page cascade. The current code:

1. Always tries to put the cursor on "the next page", even when the user's edit was in the **middle** of a page (in which case the cursor should stay where the user is typing).
2. Restores the cursor 300 ms after the cascade starts via a `setTimeout` heuristic — which fires _during_ the cascade in long documents, causing the cursor to land on whichever page the cascade has reached at that instant (often the last page).

**Technical approach**: refactor `handleTextBoxOverflow` so that, on the **outermost (user-initiated) hop only**, it computes the cursor's final position **synchronously, before** the inner cascade ripples through downstream pages. The decision is based on whether the user's edited block survives the split (cursor stays in this text box) or is itself part of the overflow (cursor follows the overflow into the next page's text box). On all subsequent **inner** hops — fired by the `ResizeObserver` of downstream pages as the cascade ripples — the overflow handler runs as a pure "push content forward, do not touch any editor's focus or selection" pass. The 300 ms `setTimeout`, the `cascadeCursorTargetRef` mechanism, and the related "restore cursor after the cascade settles" code path are deleted.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror), `perfect-freehand` (unrelated, kept), Playwright (E2E), Vitest (unit/integration). **No new dependencies.**
**Storage**: N/A — purely a client-side editor change. No database, no migrations, no API surface.
**Testing**: Vitest for unit tests, Playwright for E2E. New tests live in `src/components/canvas/__tests__/cursor-target.test.ts` (unit, pure function) and `e2e/canvas-editor-cursor-cascade.spec.ts` (browser).
**Target Platform**: Web (Chromium, Safari, Firefox; iPadOS Safari is the primary touch target — **must not break pen/touch input** in the canvas editor).
**Project Type**: Web application (Next.js single project — no separate backend in this feature). Frontend changes only.
**Performance Goals**: Cursor must reach its final visible position within **100 ms** of the keydown that triggered the cascade, measured end-to-end in a real browser, for all document lengths up to 9 pages.
**Constraints**: Must not regress the partial reflow walk-around already on the branch (53-block browser scenario from commit `381bd6b` must still pass). Must not break the legacy `canvas-page.tsx` flow editor's own onUpdate overflow path (which is dormant on migrated documents but still exists). Must not introduce any new `setTimeout`-based cascade-settling heuristic.
**Scale/Scope**: ~150–250 lines of changes concentrated in `src/components/canvas/canvas-editor.tsx` (`handleTextBoxOverflow`, `handleTextBoxHeightMeasured`, `focusPage`), plus new tests. No new files in `src/components/canvas/` other than the unit-test file. The fix is intentionally surgical — it sits on top of the existing 3-commit reflow walk-around and does not rewrite the per-page editor model.

## Constitution Check

| Principle                           | Compliance | Notes                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Incremental Development**      | ✅ Pass    | This is a follow-up bugfix on top of an already-shipped partial fix. No new infrastructure, no new advanced features. The change is the smallest possible delta that satisfies the spec.                                                                                                                                                             |
| **II. Test-Driven Quality**         | ✅ Pass    | Write a failing E2E test (`e2e/canvas-editor-cursor-cascade.spec.ts`) that reproduces both the end-of-page and middle-of-page bugs **before** writing the fix. Add a pure-function unit test for the cursor-target decision so the rule itself can be tested without a DOM. Run `pnpm test && pnpm test:integration && pnpm test:e2e` after the fix. |
| **III. Protected Branches**         | ✅ Pass    | Working on `035-fix-118-cursor-cascade`, branched off `fix/118-reflow-surgical`. Will PR into `fix/118-reflow-surgical` (and from there into `dev`) once CI passes. No direct push to `main` or `dev`.                                                                                                                                               |
| **IV. Migrations as Code**          | ✅ N/A     | No database changes.                                                                                                                                                                                                                                                                                                                                 |
| **V. Interview-Ready Architecture** | ✅ Pass    | The plan and the research doc explain _why_ the "compute target up front, then move first, then cascade silently" approach is correct (and why the previous "wait for cascade to settle then restore" approach is fundamentally broken). The trade-offs vs. the architectural rewrite alternative are documented in research.md.                     |

**Verdict**: All gates pass. No constitutional violations to justify in the Complexity Tracking section.

## Project Structure

### Documentation (this feature)

```text
specs/035-fix-118-cursor-cascade/
├── plan.md              # This file
├── spec.md              # Feature specification (already written)
├── research.md          # Phase 0 output — design rationale + alternatives
├── data-model.md        # Phase 1 output — N/A entry only (no data model)
├── quickstart.md        # Phase 1 output — how to run the failing test, apply the fix, verify
├── contracts/           # Phase 1 output — N/A (no public API surface)
└── checklists/
    └── requirements.md  # Spec quality checklist (already written)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── canvas/
│       ├── canvas-editor.tsx          # MODIFY — refactor handleTextBoxOverflow + remove 300ms setTimeout
│       ├── canvas-page.tsx            # NO CHANGE — legacy flow editor path is dormant on migrated docs
│       ├── text-box.tsx               # NO CHANGE — text box editor stays as-is; cursor capture happens in canvas-editor.tsx via the editor refs map
│       └── __tests__/
│           └── cursor-target.test.ts  # NEW — pure-function unit test for the cursor-target decision
└── lib/
    └── canvas/
        └── cursor-target.ts           # NEW — pure function: given (cursorBlockIndex, cursorOffset, splitIndex, overflowNodes) → returns "stay" or "move-with-offset"

e2e/
├── canvas-editor-cursor-cascade.spec.ts  # NEW — E2E reproduction + verification of all SCs
└── helpers/
    └── canvas-fill-pages.ts            # NEW — helper that fills N pages with near-full content via the editor's API (so tests can build a 9-page doc deterministically)
```

**Structure Decision**: Single Next.js project; the change is scoped to `src/components/canvas/canvas-editor.tsx` plus a new pure helper in `src/lib/canvas/cursor-target.ts`. The pure helper exists so the cursor-target _rule_ can be unit-tested in isolation (the rule is the part most likely to have edge-case bugs, and isolating it as a pure function makes it trivially testable). Separating the rule from the DOM-touching code is the same Hexagonal-Architecture-style separation already used elsewhere in the project (e.g., `src/lib/canvas/text-split.ts`, `src/lib/canvas/zoom-physics.ts`).

## Phase Breakdown

> **Note**: This plan stops at Phase 2 design. The actual implementation tasks are generated by `/speckit.tasks` from this plan and the spec, then executed by `/speckit.implement`.

### Phase 0: Research & Design Decisions

See [research.md](./research.md) for the full write-up. Key decisions:

1. **Cursor target is computed once, on the outermost hop, synchronously.** Inner cascade hops never touch focus or selection.
2. **The signal that distinguishes "outermost" from "inner" hop is _which text box originated the user's edit_** — captured at the call site, not via a wall-clock timer. We use a `Set<textBoxId>` of "this text box is currently a downstream cascade target; treat its overflow handler as inner" — populated by the outermost hop when it hands content off, and consumed (then propagated) by each inner hop.
3. **The cursor target rule** (extracted as a pure function in `src/lib/canvas/cursor-target.ts`):
   - **If** `cursorBlockIndex < splitIndex` → cursor **stays** in the current text box at its current position. (User edit is in the middle of the page.)
   - **If** `cursorBlockIndex >= splitIndex` → cursor **moves with the overflow** to the next page. The cursor's new block index in the next page's editor is `cursorBlockIndex - splitIndex` (since the overflow nodes are prepended at index 0). The within-block offset is preserved.
4. **The cursor is set on the next page editor _immediately_ after the merge in the same synchronous block** as the content move — not via a delayed timer. The `focus()` call is wrapped in a `requestAnimationFrame` only when the next page is brand-new and its editor is still mounting (the existing `focusPageRef` polling pattern handles that case).
5. **The 300 ms `setTimeout`, the `cascadeCursorTargetRef`, and the `__NEW__` sentinel are deleted.** They are replaced by the pure-function rule above plus the `Set<textBoxId>` cascade-target tracker.

### Phase 1: Design Artifacts

- **[research.md](./research.md)** — full design rationale, alternatives considered, ProseMirror selection-mapping notes, "why not approach X" for each rejected alternative, and an interview-style write-up of the underlying root cause.
- **[data-model.md](./data-model.md)** — N/A (no data model). The file exists only to satisfy the spec-kit convention; its content is a single line stating "no schema changes".
- **[quickstart.md](./quickstart.md)** — exact commands to reproduce the bugs, run the failing test, apply the fix, and verify. Designed so a future contributor (or future me) can pick this up and finish it in one sitting.
- **[contracts/](./contracts/)** — N/A. There is no public API surface in this change. The pure function in `src/lib/canvas/cursor-target.ts` has a TypeScript signature that _acts_ as a contract; it's documented in `research.md` rather than as a separate contract file.

### Phase 2: Implementation Outline (consumed by /speckit.tasks)

The implementation will be broken into the following ordered task groups by `/speckit.tasks`. Listed here for context, not as a substitute for the tasks file:

1. **Failing tests first** (TDD per Constitution Principle II):
   - Unit test for `decideCursorTarget(cursorBlockIndex, splitIndex, overflowNodeCount)` covering: middle-of-page, end-of-page, single-block-overflow, empty overflow, cursor at boundary block.
   - E2E test that reproduces Bug A (end-of-last-page Enter on 9-page doc) and asserts cursor lands on the new page within 100 ms.
   - E2E test that reproduces Bug B (boundary-of-pages-1-2 Enter on 9-page doc) and asserts cursor lands on page 2 within 100 ms.
   - E2E test for the middle-of-page Enter case (cursor stays on page 1, no jump to page 2).
   - E2E test for the RTL variant (Hebrew document, same scenarios).
   - All five tests must FAIL on the current branch state (proving they reproduce the bugs).

2. **Extract the pure cursor-target rule**:
   - Create `src/lib/canvas/cursor-target.ts` with the `decideCursorTarget` pure function.
   - Make the unit test pass.

3. **Refactor `handleTextBoxOverflow`**:
   - Capture the editor's selection at the start of the function.
   - Compute cursor block index and offset from the selection.
   - Call `decideCursorTarget` to get the target.
   - Apply the move (delete from this editor, hand off to `handleTextOverflow`).
   - If target is "stay", do nothing extra — the editor selection survives the deleteRange because the cursor is before the deleted range.
   - If target is "move", set the next page's editor selection at the computed position and focus it (using the existing `focusPage` polling pattern when the next page is brand-new).
   - Tag the next page's text box ID into the `cascadeTargetTextBoxIds` set so its `handleTextBoxHeightMeasured` knows to treat itself as an inner hop.

4. **Refactor `handleTextBoxHeightMeasured`**:
   - At entry, check `cascadeTargetTextBoxIds.has(textBoxId)`. If yes, this is an inner hop:
     - Run the same content-split-and-move logic, but pass an `isInnerHop: true` flag through to `handleTextBoxOverflow`.
     - Inside `handleTextBoxOverflow`, the `isInnerHop` flag suppresses all focus and selection mutations. It still propagates the cascade by adding the _next_ downstream text box ID to `cascadeTargetTextBoxIds`.
     - Remove this text box ID from `cascadeTargetTextBoxIds` after the synchronous part of the inner hop completes.
   - The set's lifecycle is fully tied to the cascade — there is no wall-clock timer.

5. **Delete dead code**:
   - `cascadeCursorTargetRef` and all references to it.
   - The `__NEW__` sentinel.
   - The `setTimeout(..., 300)` block in `handleTextBoxOverflow`.
   - The "isOutermostHop" logic that was only meaningful for the old guard.

6. **Run all tests**:
   - All five new tests must now PASS.
   - `pnpm test` (all unit), `pnpm test:integration` (all integration), `pnpm test:e2e` (all E2E) must pass on a clean machine.

7. **Manual smoke test**:
   - Open a real document in the dev server.
   - Repeat the spec's reproduction steps. Verify zero visible flicker, instant cursor response, correct cursor position in all 6 acceptance scenarios.

## Complexity Tracking

> No constitutional violations to justify. Section retained per template, but intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | _(none)_   | _(none)_                             |
