# Implementation Plan: Reliable Text Reflow and Pagination in Type Mode

**Branch**: `035-fix-text-reflow` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-fix-text-reflow/spec.md`

## Summary

Issue #118 reports that in Type mode, text does not reliably (1) wrap at the right edge of a line, (2) flow to the next page when the current page is full, or (3) auto-create a new page when overflow happens on the last page.

Static analysis of the existing implementation (`canvas-page.tsx` lines 427–562, `text-split.ts`, `canvas-editor.tsx` lines 859–897) identified three concrete root causes for the unreliability and one independent cause for the line-wrap symptom. The fix is **purely client-side** (no DB, no API changes), **CSS + targeted TypeScript edits** in the existing overflow-detection path — not a rewrite. The existing overall architecture (per-page TipTap editors, `findOverflowSplitIndex`, `focusPage` polling) is sound; the bugs are in the details.

**The four root causes**:

1. **Measurement mismatch between the overflow-gate and the split-index** — the gate uses `editorDom.scrollHeight` (which includes `pb-4` padding-bottom), and the block loop uses `offsetTop + offsetHeight` (which does not). When content height is in the ~16px window where scrollHeight overflows but block bottoms do not, the gate is set to `true` but `splitIdx === null`, so `onTextOverflow` is never called and the gate is never reset. Every subsequent keystroke then bails out silently at the gate check. This matches the user report of "the editor stops flowing text after a certain point."

2. **Gate is not reset on any no-op path** — even when the single-block path fails to find a split position (`posInfo === null`), the gate stays `true`. There is no `finally` / cleanup.

3. **`findOverflowSplitIndex` returns `1` when block 0 itself is taller than the page**, which does not relieve overflow — it keeps the oversized block 0 on the current page. This forces a two-cycle flow (first move trailing blocks, then split block 0), which is visible as a flash on paste of a very long first paragraph.

4. **Line wrap for a word wider than the page** — the editor's attribute classes do not include `break-words` / `overflow-wrap: anywhere`. A long URL or no-space string extends past the right edge and is clipped by the text layer's `overflow-hidden`. This matches the user report of "text not wrapping at the right edge."

**Approach**: Four narrow edits, each independently testable:

- **Edit 1 (line-wrap)**: add `break-words` to the editor's `attributes.class` in `canvas-page.tsx`.
- **Edit 2 (consistent measurement)**: measure content bottom via the last child block's `offsetTop + offsetHeight` instead of `scrollHeight`, so the gate and the split index reference the same thing.
- **Edit 3 (gate cleanup)**: wrap the split logic in a `try { ... } finally { overflowNotifiedRef.current = false; }` so the gate is always reset after a pass, regardless of whether a split actually dispatched.
- **Edit 4 (block-0-too-tall)**: change `findOverflowSplitIndex` to return `null` when the overflow is caused by block 0 (so the caller falls through to the single-block `splitBlock` path to break that long block at a word boundary). Adjust existing unit test; add new unit tests.

**Test-first (constitution principle II)**: Before any code edit, add two failing tests:

- Unit test: the new expected behavior of `findOverflowSplitIndex` when block 0 overflows (returns `null`).
- Playwright e2e test: paste a 12-paragraph block into a single-page canvas document and assert the resulting document has `>= 2` pages, all paragraphs are visible somewhere, and the cursor ends on the page containing the last paragraph.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, TipTap 3 (`@tiptap/react`, `@tiptap/starter-kit`), ProseMirror (via TipTap), Tailwind CSS 4
**Storage**: N/A — purely an in-memory editing fix. The serialized `pages[i].flowContent` JSON shape is unchanged.
**Testing**: Vitest (unit — `src/lib/canvas/__tests__/overflow-utils.test.ts`), Playwright (e2e — new `e2e/canvas-type-mode-flow.spec.ts`)
**Target Platform**: Browser (Chromium, WebKit, Firefox); the existing canvas editor has no mobile-only codepath for flow content.
**Project Type**: Single Next.js web app (no backend changes)
**Performance Goals**: Overflow detection must stay within the existing `requestAnimationFrame`-based cadence — no new re-renders per keystroke. Target: a 2000-character paste completes its page cascade in under 1 second on a mid-range laptop.
**Constraints**: Must not introduce layout flashes, must not break existing drawings/strokes/PDF underlays on affected pages, must not change the `flowContent` JSON shape (no migration required).
**Scale/Scope**: The change touches 2 production files (`canvas-page.tsx`, `text-split.ts`) plus 2 test files (`overflow-utils.test.ts`, new e2e spec). Total expected line delta: < 80 lines.

## Constitution Check

| Principle                         | Gate                                                                                                                                                                                                                                      | Status  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I. Incremental Development        | Is this built on top of the existing data model and basic operations, not introducing new advanced features? Yes — it's a bug fix inside existing per-page TipTap editors. No new entities, no new services.                              | ✅ PASS |
| II. Test-Driven Quality           | Will a failing test be written first, then the code, then confirmed passing? Yes — the plan explicitly requires writing (a) a unit test for `findOverflowSplitIndex`'s new behavior and (b) an e2e test for the multi-paragraph scenario. | ✅ PASS |
| III. Protected Branches           | Is work happening on a feature branch off `dev`, with a PR to `dev` and CI required to pass? Yes — branch is `035-fix-text-reflow`, PR will target `dev`.                                                                                 | ✅ PASS |
| IV. Migrations as Code (Supabase) | Does this touch the schema? No. No migration, no seed change.                                                                                                                                                                             | ✅ PASS |
| V. Interview-Ready Architecture   | Is the "why" documented for every decision, in a way that could be explained in an interview? Yes — `research.md` (Phase 0) captures each decision as Decision / Rationale / Alternatives.                                                | ✅ PASS |

**Gate result**: All five principles pass. No violations to justify. Proceeding to Phase 0 research.

## Project Structure

### Documentation (this feature)

```text
specs/035-fix-text-reflow/
├── plan.md              # This file
├── spec.md              # Already complete
├── research.md          # Phase 0 output — root cause analysis + decisions
├── data-model.md        # N/A — no data changes (will be a one-line stub)
├── quickstart.md        # Phase 1 output — manual verification steps
├── contracts/           # N/A — no external interfaces (will not be created)
├── checklists/
│   └── requirements.md  # Already complete
└── tasks.md             # Phase 2 output — will be generated by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── components/
│   └── canvas/
│       ├── canvas-page.tsx          # EDIT 1 (break-words), EDIT 2 (measurement), EDIT 3 (gate cleanup)
│       └── canvas-editor.tsx        # unchanged — focusPage polling already works correctly
├── lib/
│   └── canvas/
│       ├── text-split.ts            # EDIT 4 (findOverflowSplitIndex behavior)
│       └── __tests__/
│           └── overflow-utils.test.ts  # UPDATE — adjust existing "block 0 overflows" assertion; add new cases
└── types/
    └── canvas.ts                    # unchanged (PAGE_WIDTH/PAGE_HEIGHT constants referenced, not modified)

e2e/
├── canvas-type-mode-flow.spec.ts    # NEW — paste-based overflow e2e test
└── TEST_REGISTRY.md                 # UPDATE — register the new test
```

**Structure Decision**: Standard single-project Next.js layout (Option 1). All changes live inside `src/` and `e2e/`; no new directories.

## Complexity Tracking

Not applicable — no constitution violations, no complexity needing justification.

## Test contract

Before ANY production code change, the following tests must exist and fail against `main`:

1. **Unit** (`src/lib/canvas/__tests__/overflow-utils.test.ts`):
   - **Change existing assertion** (currently `expect(findOverflowSplitIndex([1500], PAGE_HEIGHT)).toBe(1)`): change to expect `null`. Rationale: a single oversized block cannot be split by block-index — the caller must fall through to the word-boundary path. This is a deliberate behavior change to fix the root cause #3 above.
   - **Change existing assertion** (currently `expect(findOverflowSplitIndex([1200, 1500, 1800], PAGE_HEIGHT)).toBe(1)`): change to expect `null` for the same reason (block 0 is already overflowing; no valid multi-block split exists). The caller will re-route to the single-block path which will split block 0 at a word boundary, then on the next frame detect the remaining trailing blocks as separately overflowing.
   - **Add new assertion**: `expect(findOverflowSplitIndex([600, 1500, 1800], PAGE_HEIGHT)).toBe(1)` — block 0 fits, block 1 overflows, valid multi-block split at index 1. (Regression: make sure the change to block-0 handling doesn't break the "block 1+ overflows" case.)

2. **E2E** (`e2e/canvas-type-mode-flow.spec.ts`):
   - Sign in via `e2e/helpers/auth.ts`.
   - Create a new canvas-backed document via the UI (or navigate to a known seeded canvas doc).
   - Switch to Text mode.
   - Paste a 12-paragraph block (each paragraph a non-trivial length so that total height > 1 page).
   - Assert: `pageLocator` count `>= 2` after the paste settles.
   - Assert: the first paragraph's text is visible on page 1 and the last paragraph's text is visible on the last page.
   - Assert: no paragraph is missing (join all visible text and compare to the pasted content).
   - Assert: the cursor ends on the page containing the last paragraph (via `document.activeElement` ancestry checks).

Both the unit test delta and the new e2e spec must be committed and verified FAILING against the current `canvas-page.tsx` / `text-split.ts` before any edit to those files.
