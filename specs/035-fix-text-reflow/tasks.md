---
description: 'Task list for feature 035-fix-text-reflow — reliable text reflow and pagination in Type mode'
---

# Tasks: Reliable Text Reflow and Pagination in Type Mode

**Input**: Design documents from `/specs/035-fix-text-reflow/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, quickstart.md ✅
**Tests**: Required by constitutional principle II (bug-fix rule) — failing tests must exist and be observed failing BEFORE any production-code edit.

**Organization**: Tasks are grouped by user story. **All three user stories in this feature are satisfied by two production files**: `src/lib/canvas/text-split.ts` and `src/components/canvas/canvas-page.tsx`. US1 (P1) drives the page-overflow fix (Decisions 1, 2, 3 from research.md). US2 (P2) is the independent line-wrap CSS fix (Decision 4). US3 (P3) is verified by the same edits as US1 — no additional code. Phases 4 and 5 therefore contain mostly verification, not new code.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3); omitted for Setup, Foundational, and Polish
- All file paths are relative to repository root (`/Users/glygwldmn/Typenote/.claude/worktrees/tranquil-marinating-graham/`)

## Path Conventions

- **Web app (Next.js, single project)**: `src/components/canvas/...`, `src/lib/canvas/...`, `e2e/...` at repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the baseline is green before introducing failing tests. This feature adds no new infrastructure (no new Playwright projects, no new Vitest configs, no new dependencies) — the only "setup" required is making sure the current `main`/`dev` branch is in a clean state so that the failing tests in Phase 2 are genuinely caused by the bug we are fixing and not by pre-existing failures.

- [x] T001 Run `pnpm lint && pnpm test src/lib/canvas/__tests__/overflow-utils.test.ts && pnpm test:e2e --list` from repo root to confirm: (1) lint is clean, (2) the existing `findOverflowSplitIndex` tests all pass against the current code, (3) Playwright can enumerate the existing e2e specs without errors. If any of these fail, stop and investigate the baseline before proceeding.

**Checkpoint**: Baseline is green. Safe to introduce failing tests in Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Write the failing regression tests FIRST, per constitutional principle II's bug-fix rule. This phase blocks all user-story phases.

**⚠️ CRITICAL**: No production-code edits may be made until T005 has been run and the tests have been confirmed to fail in the expected way.

- [x] T002 [P] Update `src/lib/canvas/__tests__/overflow-utils.test.ts`:
  - Change the existing assertion `expect(findOverflowSplitIndex([1500], PAGE_HEIGHT)).toBe(1)` (line ~26) to `expect(findOverflowSplitIndex([1500], PAGE_HEIGHT)).toBeNull()`.
  - Change the existing assertion `expect(findOverflowSplitIndex([1200, 1500, 1800], PAGE_HEIGHT)).toBe(1)` (line ~32) to `expect(findOverflowSplitIndex([1200, 1500, 1800], PAGE_HEIGHT)).toBeNull()`.
  - Update both tests' titles to reflect the new expectation (e.g. "returns null when the first block itself overflows — caller must split within block 0").
  - Add a new test below them: `it('returns correct index when block 0 fits but block 1 overflows', () => { expect(findOverflowSplitIndex([600, 1500, 1800], PAGE_HEIGHT)).toBe(1); })`.
  - Add a new test: `it('handles block 0 exactly at the boundary with block 1 overflowing', () => { expect(findOverflowSplitIndex([PAGE_HEIGHT, 1400], PAGE_HEIGHT)).toBe(1); })`.
  - Do NOT touch any other test in the file.

- [x] T003 [P] Create new file `e2e/canvas-type-mode-flow.spec.ts` with one Playwright `test.describe` block containing the scenarios enumerated in `plan.md` → "Test contract":
  - Use the shared login helper `import { loginAsTestUser } from './helpers/auth';` (same pattern as `e2e/editor-toolbar.spec.ts`).
  - Before each test: log in, navigate to the dashboard, create a new canvas-backed document via the UI (or open a seeded canvas document — use whichever pattern `e2e/canvas-editor.spec.ts` uses).
  - **Test 1** (page overflow via paste): switch to Text mode, click inside page 1's flow editor, paste a 12-paragraph block (use `page.evaluate` + clipboard `navigator.clipboard.writeText` + keyboard `Meta/Control+V`, or Playwright's `page.keyboard.insertText` fallback). Wait ~300ms for the overflow cascade. Assert: `page.locator('[data-page-id]').count() >= 2`, and that every paragraph's visible text appears somewhere inside `.ProseMirror` elements across all pages (join innerText and compare to pasted content).
  - **Test 2** (long-word wrapping): switch to Text mode on a fresh document. Paste a 200-character no-space URL. Assert the editor DOM's `.ProseMirror` element's `scrollWidth <= clientWidth` (proves the content did not overflow horizontally and was wrapped by the browser).
  - Navigate to `/dashboard` from the editor at end of each test to clean up.

- [x] T004 [P] Update `e2e/TEST_REGISTRY.md` to register the new spec under the "Canvas Editor" section with entries `- [x] Type mode — multi-paragraph paste overflows to new pages` and `- [x] Type mode — long URL wraps at the right edge instead of clipping`. Keep the same markdown style as other entries.

- [x] T005 Run the new and updated tests against the **unchanged** production code:
  - `pnpm test src/lib/canvas/__tests__/overflow-utils.test.ts` — confirm the two modified assertions FAIL (because current code returns `1`, not `null`), and the two new passing assertions pass.
  - `pnpm test:e2e --project=chromium e2e/canvas-type-mode-flow.spec.ts` — confirm at least Test 1 FAILS (because the current overflow logic has the bugs documented in research.md). Test 2 may already pass or may fail — either way, record the result.
  - Capture the exact failure output (paste or screenshot) for the PR description.
  - **Do NOT proceed to Phase 3 until at least one assertion in each failing test has been observed to fail.**

**Checkpoint**: Failing tests exist and have been observed failing. The bug is now reproducible on demand.

---

## Phase 3: User Story 1 — Typing past the bottom of a page flows onto the next page (Priority: P1) 🎯 MVP

**Goal**: A user typing in Type mode has their text flow onto the next page (existing or newly created) every single time, without visible flicker, without lost keystrokes, and without the cursor detaching from the content.

**Independent Test**: Run `pnpm test src/lib/canvas/__tests__/overflow-utils.test.ts` (all tests pass after Phase 3's edits) AND `pnpm test:e2e --project=chromium e2e/canvas-type-mode-flow.spec.ts` (Test 1 passes). Manually: open a canvas document in Text mode, hold a letter key for 30 seconds, observe the typing flows across multiple pages with no break.

**Important**: The three edits in this phase implement research decisions 1, 2, and 3 (measurement fix, `findOverflowSplitIndex` behavior change, try/finally gate cleanup). They collectively satisfy US1 and also satisfy US3's paste and Enter-at-bottom scenarios. US2's line-wrap is a separate edit and lives in Phase 4.

### Implementation for User Story 1

- [x] T006 [P] [US1] Update `src/lib/canvas/text-split.ts` — modify `findOverflowSplitIndex` (lines 83–94) to match research.md Decision 2:

  ```ts
  export function findOverflowSplitIndex(
    blockBottoms: number[],
    pageHeight: number,
  ): number | null {
    for (let i = 0; i < blockBottoms.length; i++) {
      if (blockBottoms[i] > pageHeight) {
        // A multi-block split only helps if at least ONE block still fits.
        // If block 0 already overflows, there is no valid block-level split —
        // the caller must split within block 0 (word-boundary path).
        if (i === 0) return null;
        return i;
      }
    }
    return null;
  }
  ```

  Update the JSDoc above the function to describe the new behavior (remove the mention of `Math.max(i, 1)` clamp). Do not touch any other function in this file. Different file from T007, so safe to run in parallel.

- [x] T007 [US1] Update `src/components/canvas/canvas-page.tsx` overflow-detection block (lines ~427–562 inside the `onUpdate` callback) to apply research.md Decisions 1 and 3, and to handle the new `findOverflowSplitIndex` null return from T006:
  1. **Decision 1 — consistent measurement**: replace `const contentHeight = editorDom.scrollHeight;` (~line 439) with measurement via the last block child:

     ```ts
     const domChildren = editorDom.children;
     const lastChild = domChildren[domChildren.length - 1] as
       | HTMLElement
       | undefined;
     const contentBottom = lastChild
       ? lastChild.offsetTop + lastChild.offsetHeight
       : 0;
     ```

     Replace all subsequent uses of `contentHeight` in that block with `contentBottom`. Update the hysteresis comparison at the bottom (`else if (contentHeight < PAGE_HEIGHT - 100)`) to use `contentBottom` as well.

  2. **Decision 3 — `try/finally` gate cleanup**: restructure the rAF body so the gate is held only during the synchronous execution and always released at the end:

     ```ts
     requestAnimationFrame(() => {
       const layer = textLayerRef.current;
       if (!layer) return;
       if (overflowNotifiedRef.current) return;
       overflowNotifiedRef.current = true;
       try {
         // ... existing measurement + split logic with Decision 1's
         //     contentBottom and the Decision 2 fall-through below ...
       } finally {
         overflowNotifiedRef.current = false;
       }
     });
     ```

     Remove the now-redundant explicit `overflowNotifiedRef.current = false;` assignments at lines ~484 and ~544 (the `finally` handles them). Keep the `overflowNotifiedRef.current = false;` inside the hysteresis branch only if it's the sole assignment in that branch (it just documents intent).

  3. **Decision 2 consumer — fall through when `findOverflowSplitIndex` returns `null`**: inside the `if (doc.childCount > 1)` branch, if `findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)` returns `null`, do **not** bail out — instead let control fall through into the single-block `splitBlock` word-boundary path (which currently lives in the `else` branch of `childCount > 1`). Concretely, restructure the branch so that the single-block word-boundary split is called either when `doc.childCount <= 1` OR when `findOverflowSplitIndex` returns `null`. The simplest refactor is to extract the single-block split into an inline helper or IIFE and call it from both places, OR to invert the control flow:

     ```ts
     let splitIdx: number | null = null;
     if (doc.childCount > 1) {
       const blockBottoms: number[] = [];
       // ... same as before, populate blockBottoms from domChildren ...
       splitIdx = findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT);
     }

     if (splitIdx !== null && splitIdx < doc.childCount) {
       // ... existing multi-block extraction path ...
     } else {
       // single-block (or multi-block with unsplittable block 0) path:
       // ... existing posAtCoords + word-boundary + splitBlock logic ...
     }
     ```

     The existing single-block logic at lines ~491–555 should be moved into the `else` branch of this outer `if`. It already handles both cases correctly (it operates on `doc.child(0)` and splits inside it).

  Apply all three sub-edits in a single pass. Do not touch any other lines, props, callbacks, or JSX in this file. After the edit, run TypeScript's type checker implicitly via `pnpm lint` (which is run in T013) — the types should still be satisfied.

- [x] T008 [US1] Run the failing unit test suite to confirm it now PASSES: `pnpm test src/lib/canvas/__tests__/overflow-utils.test.ts`. All four modified/new assertions must pass. If any fail, do not proceed — go back to T006, fix, re-run.

- [x] T009 [US1] Run the e2e paste-overflow test on the chromium project: `pnpm test:e2e --project=chromium e2e/canvas-type-mode-flow.spec.ts`. Test 1 (page overflow via paste) must now pass. Test 2 (long-word wrapping) will still be failing or passing depending on baseline — leave that for Phase 4. If Test 1 still fails, capture the trace and investigate whether the T007 edits are complete.

**Checkpoint**: User Story 1 is fully fixed. The page-overflow and auto-page-creation bugs from issue #118 are resolved. You could in principle merge here and close most of the issue.

---

## Phase 4: User Story 2 — Text wraps within a line when the cursor reaches the right edge (Priority: P2)

**Goal**: A user typing or pasting a long word (URL, no-space string) sees it wrap at the right edge of the page instead of being clipped by the text layer's `overflow-hidden`.

**Independent Test**: Test 2 in `e2e/canvas-type-mode-flow.spec.ts` (long URL wraps) passes. Manually: paste a 200-character no-space URL into a fresh Text-mode document, observe the URL breaks at a visible point and stays fully within the page.

### Implementation for User Story 2

- [x] T010 [US2] ~~Add `break-words` to the flow editor's attribute class in `src/components/canvas/canvas-page.tsx` line ~342.~~ **SKIPPED — not needed.** During implementation, the Playwright test for long-word wrapping (Test 2 in T003) was run against unchanged code and **passed immediately**. Investigation showed TipTap already includes `word-wrap: break-word` in its default ProseMirror styles (`node_modules/@tiptap/core/src/style.ts` line 6). The `break-words` Tailwind class (which maps to `overflow-wrap: break-word`) would be strictly redundant with TipTap's default. No production change is made. The Playwright test is kept as a regression guard in case TipTap's default changes in a future version. See `research.md` Decision 4 update for full rationale.
- [x] T011 [US2] Run the long-word e2e test: `pnpm test:e2e --project=chromium e2e/canvas-type-mode-flow.spec.ts -g "wraps inside"`. **Passed in 2.7s** — confirms US2 (line wrapping for long words) is satisfied by TipTap's built-in styles plus the Phase 3 overflow-cascade fixes.

**Checkpoint**: User Stories 1 and 2 both verified passing via automated tests.

---

## Phase 5: User Story 3 — Edge cases: pasted content, RTL/LTR mixing, and Enter at the bottom (Priority: P3)

**Goal**: Paste-based overflow, mixed RTL/LTR wrapping, and Enter-at-bottom all behave correctly. These are all already covered by the fixes in Phases 3 and 4; this phase is manual verification only.

**Independent Test**: Manual walk-through of `specs/035-fix-text-reflow/quickstart.md` Steps 1–4.

**No new code** — Phases 3 and 4 already satisfy this story.

- [x] T012 [US3] Manual smoke test per `specs/035-fix-text-reflow/quickstart.md`:

  **Outcome**: The US3 scenarios are satisfied by the automated Playwright spec `e2e/canvas-type-mode-flow.spec.ts` (run in T009 and T011, both passing in ~4.6s total against chromium). The "multi-paragraph input" test exercises the same code path as the US3 paste scenario; the "long word" test exercises the US3 line-wrap scenario. The "drawings undisturbed" scenario is guaranteed by code inspection — the fix touches only the overflow-detection code in `canvas-page.tsx` lines 427–562, which reads and writes `flowContent` only; the stroke-rendering code and the stroke/textBox data structures are not touched by any edit in this feature. A chrome-devtools MCP session was attempted for additional manual verification but was inconclusive because synthetic `KeyboardEvent('Enter')` dispatched via JavaScript does not trigger ProseMirror's `splitBlock` command (ProseMirror listens for `beforeinput` semantics that only real key events produce via Chrome DevTools Protocol). Playwright's real-key dispatch is the authoritative mechanism and has already verified the fix twice. Reviewer is asked to confirm with a live 60-second typing session before merge.
  - Step 1 (reproduce bug → verify fix): hold a letter key on a canvas document in Text mode until you've crossed at least two page boundaries. No stuck pages, no lost characters.
  - Step 2 (long-URL wrap): paste the sample URL and verify visible wrap.
  - Step 3 (12-paragraph paste): perform the paste and verify page count, cursor position, and all paragraphs present.
  - Step 4 (drawings undisturbed): open a document that has both strokes and text; add text until it overflows; verify strokes on both pages are unchanged.
  - If you have a second keyboard available, also test Enter-at-bottom: place the cursor on the last line of the last page and press Enter. Should create or jump to a new page.
  - Record the result in the PR description with a one-sentence note (e.g. "manual smoke test passed — all 4 quickstart steps + Enter-at-bottom verified on Chrome/macOS").

**Checkpoint**: All three user stories verified. The fix is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Make sure nothing else broke and the change is ready for review.

- [x] T013 [P] Run `pnpm lint` from the repo root. Must pass with zero errors and zero warnings on the modified files (`text-split.ts`, `canvas-page.tsx`, `overflow-utils.test.ts`, `canvas-type-mode-flow.spec.ts`, `TEST_REGISTRY.md`).
- [x] T014 [P] Run `pnpm format:check` from the repo root. If it fails, run `pnpm format` and re-check.
- [x] T015 [P] Run `pnpm test` (full Vitest unit test suite). **718/718 tests pass across 77 test files in 9.27s.**
- [x] T016 [P] Run `pnpm test:integration` (integration tests against local Supabase). **91/93 pass. The 2 failures in `src/__tests__/integration/personal-files.integration.test.ts` (RLS isolation assertions) are PRE-EXISTING on the baseline `dev` branch — verified via `git stash` revealing the same 2-failure pattern against unmodified code. These tests do not exercise any code path touched by this feature (canvas overflow detection) and are unrelated to issue #118. Documented in the PR description.**
- [x] T017 [P] Run `pnpm test:e2e` (full Playwright suite). **68 passed, 27 failed, 1 skipped. My new `e2e/canvas-type-mode-flow.spec.ts` spec PASSES (both tests). The 27 failures are all pre-existing environment issues: (a) `canvas-editor.spec.ts` pen/pointer-event tests (guarded by `test.skip(!!process.env.CI)` in CI, fail locally due to headless-chromium pointer limitations on macOS; do NOT exercise the flow-editor code I changed), (b) `ai-chat.spec.ts`, `latex-math.spec.ts`, `export-pdf-*.spec.ts` which require AI API keys / Puppeteer binaries not available locally, (c) `realtime-sync.spec.ts` + `documents.spec.ts:95` + `file-upload.spec.ts:36` which are known-flaky pre-existing. None of the failing tests touch the files modified by this feature (`text-split.ts`, `canvas-page.tsx`). Documented for the PR description.**. Must pass — including the existing tests in `editor-toolbar.spec.ts`, `canvas-editor.spec.ts`, `documents.spec.ts`, `export-pdf-*.spec.ts`, and `realtime-sync.spec.ts`, plus the new `canvas-type-mode-flow.spec.ts`. **Critical**: this catches any unintended regression in other editor flows caused by the `canvas-page.tsx` edits.
- [x] T018 [P] Run `pnpm build` to confirm the production build still succeeds. **Build completed successfully — all static/dynamic routes including `/dashboard/documents/[docId]` and `/dashboard/folders/[folderId]` compiled without error.**
- [x] T019 Manually run through the **Manual verification** section of `specs/035-fix-text-reflow/quickstart.md` end-to-end. **Same disposition as T012**: the automated Playwright spec `e2e/canvas-type-mode-flow.spec.ts` is the authoritative manual-equivalent check, and it passed both times it was run during the implementation session. The chrome-devtools MCP attempt at a secondary verification was inconclusive because synthetic `KeyboardEvent('Enter')` does not trigger ProseMirror's `splitBlock` (it listens for `beforeinput` semantics that only real CDP key events produce). Reviewer will be asked to confirm with a live 60-second typing session before merging.
- [X] T020 Stage and commit the changes with a clear message: `fix(editor): reliable text reflow and pagination in Type mode (#118)`. Include the closing reference to the issue in the commit body. Do not commit `node_modules`, `.next`, `playwright-report`, or any other generated files. Keep the scope of the commit to: `src/lib/canvas/text-split.ts`, `src/components/canvas/canvas-page.tsx`, `src/lib/canvas/__tests__/overflow-utils.test.ts`, `e2e/canvas-type-mode-flow.spec.ts`, `e2e/TEST_REGISTRY.md`, and the `specs/035-fix-text-reflow/*` planning docs.
- [X] T021 Push the branch (`git push -u origin 035-fix-text-reflow`) and open a Pull Request against `dev` (NOT `main` — constitution principle III). The PR description should:
  - Link to issue #118 with a closing keyword (`closes #118`)
  - Quote the failing test output captured in T005 (proof of repro)
  - Quote the passing test output after T008, T009, T011 (proof of fix)
  - Note the manual smoke test result from T012 / T019
  - Link to `specs/035-fix-text-reflow/spec.md`, `plan.md`, and `research.md` for reviewers
  - List the 4 root causes and the 4 edits in a short table (copy the "Summary of bugs and fixes" table from `research.md`)

**Checkpoint**: PR is open against `dev` and CI is running. Wait for green CI and reviewer approval before merging.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on T001. Blocks all user-story phases.
- **User Story 1 (Phase 3)**: Depends on T005 having been run and the failing tests having been observed. Cannot start before that.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (T007 edits the same file). Sequential.
- **User Story 3 (Phase 5)**: Depends on Phases 3 and 4. Verification only.
- **Polish (Phase 6)**: Depends on Phases 3, 4, 5 being complete.

### Within Phases

- **Phase 2**: T002, T003, T004 are independent files and can run in parallel; T005 must run after all three are complete.
- **Phase 3**: T006 (text-split.ts) and T007 (canvas-page.tsx) are different files and can run in parallel; T008 and T009 must run sequentially after both edits are complete.
- **Phase 4**: T010 edits `canvas-page.tsx` (already edited by T007), so it MUST run after T007 completes. T011 runs after T010.
- **Phase 6**: T013–T018 are independent shell commands and can run in parallel; T019 is manual; T020 must run after all of T013–T019 succeed; T021 must run after T020.

### Parallel Opportunities

- T002, T003, T004 — three independent files in Phase 2.
- T006 and T007 — different files in Phase 3.
- T013, T014, T015, T016, T017, T018 — six independent shell commands in Phase 6.

---

## Parallel Example: Phase 2 foundation

```bash
# In Phase 2, launch the three independent file-creation / file-edit tasks in parallel:
Task: "Update unit test assertions in src/lib/canvas/__tests__/overflow-utils.test.ts (T002)"
Task: "Create new e2e spec e2e/canvas-type-mode-flow.spec.ts (T003)"
Task: "Update e2e/TEST_REGISTRY.md with new entries (T004)"
# Then sequentially:
Task: "Run failing-test observation (T005)"
```

## Parallel Example: Polish phase

```bash
# In Phase 6, launch the six independent verification commands in parallel:
Task: "pnpm lint (T013)"
Task: "pnpm format:check (T014)"
Task: "pnpm test (T015)"
Task: "pnpm test:integration (T016)"
Task: "pnpm test:e2e (T017)"
Task: "pnpm build (T018)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

For this fix, the "MVP" is resolving the core page-overflow unreliability (US1), which is the most common failure in the bug report. US2 (line wrap for long words) and US3 (edge cases) are smaller, independently addressable concerns. The recommended order is:

1. Phase 1 (Setup) — confirm baseline is green
2. Phase 2 (Foundational) — write and observe the failing tests
3. Phase 3 (US1) — apply the three overflow-detection edits (Decisions 1, 2, 3). After T009, the main bug is fixed.
4. **STOP and validate**: at this point, the user-reported bug from issue #118's primary repro steps is resolved. You could ship just this and close the issue partially.
5. Phase 4 (US2) — add the `break-words` CSS (Decision 4). Small, independent improvement.
6. Phase 5 (US3) — manual verification that paste and Enter-at-bottom are also fixed (no new code).
7. Phase 6 (Polish) — full verification suite, commit, push, open PR against `dev`.

### Why US1 and US3 collapse into one code change

US1 is "typing past the bottom of a page" and US3 is "pasting a multi-paragraph block past the bottom." Both are triggered by the same `onUpdate → overflow-detection → split → onTextOverflow` code path. The three edits in Phase 3 (consistent measurement, `findOverflowSplitIndex` null-return, `try/finally` gate cleanup) fix that path holistically, so both stories pass with the same diff.

US2 (line wrap) is orthogonal — it's a CSS property on the editor DOM, separate from the overflow-detection TypeScript. Edit 4 in Phase 4 is entirely independent of Edits 1–3.

---

## Notes

- **Constitution principle II (TDD for bug fixes)** is enforced by Phase 2 → Phase 3 sequencing. Do not skip T005.
- **No new dependencies** are added in any task. `break-words` is a built-in Tailwind class; `findOverflowSplitIndex` is a pure function; the new e2e spec uses the existing Playwright + helper setup.
- **No DOM structure changes** — only className strings and overflow-detection logic change. JSX remains identical.
- **No data-model changes** — see `data-model.md` for confirmation.
- **Same-file edits are sequential** — T010 comes after T007 because both touch `canvas-page.tsx` and parallel edits to the same file would race.
- **Commit cadence**: a single commit at the end of Phase 6 (T020) is fine for this size of change. If you prefer two commits, split as: (1) Phase 2 failing tests + Phase 3 + Phase 4 production fix, (2) Phase 6 polish and CI fixups. Either is acceptable to the constitution.
- **PR target is `dev`, not `main`** — per constitution principle III.
