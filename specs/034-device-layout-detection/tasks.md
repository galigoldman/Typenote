---
description: 'Task list for feature 034-device-layout-detection — device-aware document editor layout'
---

# Tasks: Device-Aware Document Editor Layout

**Input**: Design documents from `/specs/034-device-layout-detection/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, quickstart.md ✅
**Tests**: Required by constitutional principle II (bug-fix rule) — write a failing test first.

**Organization**: Tasks are grouped by user story. **All three user stories in this feature share the same code change** (one CSS-only refactor that satisfies US1, US2, and US3 simultaneously). Phases 4 and 5 are therefore verification-only — they confirm that the same change satisfies US2 and US3 with no additional code.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3); omitted for Setup, Foundational, and Polish
- All file paths are relative to repository root (`/Users/glygwldmn/Typenote/.claude/worktrees/tranquil-marinating-graham/`)

## Path Conventions

- **Web app (Next.js, single project)**: `src/components/canvas/...`, `e2e/...`, `playwright.config.ts` at repo root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the Playwright test infrastructure capable of emulating a tablet so the regression test in Phase 2 can run against both a desktop-pointer and a tablet-pointer browser context.

- [ ] T001 Add a `chromium-tablet` Playwright project entry to `playwright.config.ts` that uses `devices['iPad Pro 11']` (which sets `hasTouch: true` and `isMobile: true`, both of which cause Chromium to report `pointer: coarse`). Keep the existing `chromium` project untouched. Both projects should share the same `baseURL` and `webServer` config.

**Checkpoint**: After T001, `pnpm test:e2e --project=chromium-tablet` should be a runnable command (even though there is no test for it yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Write the failing regression test FIRST, per constitutional principle II's bug-fix rule. This phase blocks all user-story phases.

**⚠️ CRITICAL**: No className edits may be made until T003 has been run and the test has been confirmed to fail in the expected way.

- [ ] T002 Create new file `e2e/editor-device-layout.spec.ts` with one Playwright `test.describe` block containing the assertions enumerated in `plan.md` → "Test contract":
  1. **Sanity check** — `await page.evaluate(() => matchMedia('(pointer: coarse)').matches)` returns the expected value for each project (`false` on `chromium`, `true` on `chromium-tablet`). If this fails, the test should error with a clear message ("Playwright project is not emulating the expected pointer media feature — check playwright.config.ts").
  2. **Desktop header bar visibility** — locate the title `<input>` (only the desktop header has an editable title input); assert visible on `chromium`, hidden on `chromium-tablet`.
  3. **Mobile title cluster visibility** — locate the truncated title `<span>` inside the toolbar; assert hidden on `chromium`, visible on `chromium-tablet`.
  4. **Scroll-container computed background** — `getComputedStyle(scrollContainer).backgroundColor` is `rgb(243, 244, 246)` (Tailwind `bg-gray-100`) on `chromium` and `rgb(255, 255, 255)` (`bg-white`) on `chromium-tablet`.
  5. **The bug repro** — only on `chromium`: resize the viewport to 800×600 (well below the old 1280px breakpoint) and re-run assertions 2 and 3. They must still hold. _This is the assertion that reproduces issue #114._

  The test should navigate to the same editor route the existing `e2e/editor-toolbar.spec.ts` uses (`/test/editor`). Use the same helpers as that file where reasonable.

- [ ] T003 Run the new test against the **unchanged** code: `pnpm test:e2e e2e/editor-device-layout.spec.ts`. Confirm it **fails** in the expected way — specifically, assertions 2 and 5 should fail on `chromium` (because the current `xl:` rule hides the desktop header bar at narrow widths), and the `chromium-tablet` project's assertions should largely pass already (since the current `xl:` rule does correctly hide the desktop header at iPad's 834px viewport width by accident). Record the exact failure output in the PR description so reviewers can see the bug being reproduced. **Do NOT proceed to Phase 3 until this failure has been observed.**

**Checkpoint**: Failing test exists and has been observed to fail. The bug is now reproducible on demand.

---

## Phase 3: User Story 1 — Desktop user with a narrow browser window (Priority: P1) 🎯 MVP

**Goal**: A desktop user with a mouse or trackpad sees the page-mode layout (centered page, gray background, shadow, vertical padding, AND the desktop header bar with editable title input, sidebar toggle, save button, connection indicator) at every browser window width.

**Independent Test**: On the `chromium` Playwright project, the e2e test from T002 passes — including the 800×600 resize assertion. Manually: open a document, drag the browser window narrower than 1280px, observe the layout does not change.

**Important**: The five className edits in this phase ALSO satisfy User Stories 2 and 3 (verified in Phases 4 and 5). They are listed under US1 because US1 is the highest-priority story driving the change.

### Implementation for User Story 1

- [ ] T004 [US1] Apply four className edits in `src/components/canvas/canvas-editor.tsx`. The rule for every edit: the **default** className (no variant prefix) represents page mode; the `pointer-coarse:` prefix represents the tablet override. Specifically:
  - **Line ~1503** (desktop header bar): change `hidden xl:flex items-center justify-between border-b px-4 py-2` → `flex pointer-coarse:hidden items-center justify-between border-b px-4 py-2`
  - **Line ~1587** (mobile title cluster inside the toolbar): change `flex items-center gap-1 mr-2 xl:hidden shrink-0` → `hidden pointer-coarse:flex items-center gap-1 mr-2 shrink-0`
  - **Line ~1853** (scroll container background): change `flex-1 bg-white xl:bg-gray-100` → `flex-1 bg-gray-100 pointer-coarse:bg-white`
  - **Line ~1872** (page wrapper padding): change `py-8 max-xl:py-0` → `py-8 pointer-coarse:py-0`

  Apply all four edits in a single pass (or one Edit tool call per className for traceability). Do not change any other lines, props, JSX structure, or behavior.

- [ ] T005 [P] [US1] Apply one className edit in `src/components/canvas/canvas-page.tsx` at **line ~677** (page element shadow): change `relative bg-white shadow-md mx-auto max-xl:shadow-none` → `relative bg-white shadow-md mx-auto pointer-coarse:shadow-none`. Different file from T004, so safe to run in parallel.

- [ ] T006 [US1] Run the regression test only on the desktop project: `pnpm test:e2e --project=chromium e2e/editor-device-layout.spec.ts`. All US1 assertions (1, 2, 3, 4, 5) must now pass. If any still fail, do not proceed — investigate which className edit was missed or applied incorrectly, fix it, and re-run.

**Checkpoint**: User Story 1 is fully fixed. The bug from issue #114 is resolved. The MVP is complete — you could ship just this (and the necessary verification in later phases) and call the bug closed.

---

## Phase 4: User Story 2 — Tablet user opens a document (Priority: P2)

**Goal**: A tablet user (touch as primary input) continues to see the full-width / tablet layout in both portrait and landscape, regardless of viewport dimensions.

**Independent Test**: On the `chromium-tablet` Playwright project, the e2e test from T002 passes for tablet-side assertions (header bar hidden, mobile title cluster visible, white background).

**No new code** — Phase 3 already satisfies this story; this phase is verification only.

- [ ] T007 [US2] Run the regression test only on the tablet project: `pnpm test:e2e --project=chromium-tablet e2e/editor-device-layout.spec.ts`. All assertions must pass. If any fail, the most likely cause is that one of the Phase 3 className edits got the cascade direction wrong (e.g. forgot the `pointer-coarse:` override on one of the tablet variants). Investigate, fix, re-run T006 AND T007.

**Checkpoint**: User Stories 1 and 2 both verified passing.

---

## Phase 5: User Story 3 — Touchscreen laptop and tablet-with-keyboard edge cases (Priority: P3)

**Goal**: A touchscreen laptop (mouse/trackpad as primary input) shows page mode; a tablet with an attached keyboard (touch still primary) shows full-width mode.

**Independent Test**: Manual verification — Playwright does not have built-in device descriptors for "touchscreen laptop" or "iPad with keyboard," so this story is verified by hand.

**No new code** — same as Phase 4.

- [ ] T008 [US3] Manual smoke test: open Chrome DevTools' device toolbar, set the device emulation to "Surface Pro 7" (or any touchscreen-laptop preset). Open a document in the editor at `/test/editor`. Verify the editor shows **page mode** (gray background, centered page with shadow, desktop header bar with editable title input visible). Then switch the emulation to "iPad Pro" and verify the editor switches to **full-width mode**. Document the result in the PR description with a one-sentence note ("verified Surface Pro 7 → page mode, iPad Pro → full-width mode in DevTools device emulation").

  _If the Surface Pro 7 emulation reports `pointer: coarse` (which would give the wrong layout), it's likely because Chromium's mobile-emulation flag overrides the pointer feature. In that case, do the smoke test on a real touchscreen laptop instead, or accept that the automated coverage from T006 + T007 is sufficient and document the limitation in the PR description._

**Checkpoint**: All three user stories are verified. The fix is complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Make sure nothing else broke and the change is ready for review.

- [ ] T009 [P] Run `pnpm lint` from the repo root. Must pass with zero errors and zero warnings on the modified files.
- [ ] T010 [P] Run `pnpm format:check` from the repo root. If it fails, run `pnpm format` and re-check.
- [ ] T011 [P] Run `pnpm test` (full Vitest unit test suite). Must pass — there should be no impact on unit tests since this change is CSS-only.
- [ ] T012 [P] Run `pnpm test:e2e` (full Playwright suite, both `chromium` and `chromium-tablet` projects). Must pass — including the existing tests in `editor-toolbar.spec.ts`, `export-pdf-dashboard.spec.ts`, `export-pdf-editor.spec.ts`, and `realtime-sync.spec.ts`, plus the new `editor-device-layout.spec.ts`. **Critical**: this is where you'd catch any unintended regression in the toolbar or PDF export caused by the className changes.
- [ ] T013 [P] Run `pnpm build` to confirm the production build still succeeds.
- [ ] T014 Manually run through the **bug reproduction** steps in `specs/034-device-layout-detection/quickstart.md` ("Manual verification" section). Confirm: opening a document on desktop, dragging the window narrower than 1280px, the layout does NOT change. Take a before/after screenshot if helpful for the PR description.
- [ ] T015 Stage and commit the changes with a clear message: `fix(editor): use pointer media feature for device layout (#114)`. Include the closing reference to the issue. Do not commit `node_modules`, `.next`, `playwright-report`, or any other generated files.
- [ ] T016 Push the branch (`git push -u origin 034-device-layout-detection`) and open a Pull Request against `main`. The PR description should:
  - Link to issue #114
  - Quote the failing test output captured in T003 (proof of repro)
  - Quote the passing test output after the fix (proof of fix)
  - Note the manual smoke test result from T008
  - Link to `specs/034-device-layout-detection/spec.md`, `plan.md`, and `research.md` for reviewers who want full context

**Checkpoint**: PR is open and CI is running. Wait for green CI and reviewer approval before merging.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on T001 (needs the tablet project to exist). Blocks all user-story phases.
- **User Story 1 (Phase 3)**: Depends on T003 having been run and the failing test having been observed. Cannot start before that.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (the code change is what makes the tablet assertions still pass). Verification only.
- **User Story 3 (Phase 5)**: Depends on Phase 3. Verification only.
- **Polish (Phase 6)**: Depends on Phases 3, 4, 5 being complete.

### Within Phases

- **Phase 2**: T002 → T003 (sequential — must observe failure before continuing).
- **Phase 3**: T004 and T005 are different files and can run in parallel; T006 must run after both are complete.
- **Phase 6**: T009–T013 are independent commands and can run in parallel; T014 is manual; T015 must run after all of T009–T014 succeed; T016 must run after T015.

### Parallel Opportunities

- T004 (canvas-editor.tsx) and T005 (canvas-page.tsx) — different files, both in Phase 3, both `[P]` candidates. The tasks above mark T005 as [P]; T004 is sequential because all four of its edits are within a single file and should not race against themselves.
- T009, T010, T011, T012, T013 — five independent shell commands in Phase 6.

---

## Parallel Example: User Story 1 implementation

```bash
# In Phase 3, after T003 has been confirmed failing, launch the two file edits in parallel:
Task: "Apply four className edits in src/components/canvas/canvas-editor.tsx (T004)"
Task: "Apply one className edit in src/components/canvas/canvas-page.tsx (T005)"
# Then sequentially:
Task: "Run pnpm test:e2e --project=chromium e2e/editor-device-layout.spec.ts (T006)"
```

## Parallel Example: Polish phase

```bash
# In Phase 6, launch the five independent verification commands in parallel:
Task: "pnpm lint (T009)"
Task: "pnpm format:check (T010)"
Task: "pnpm test (T011)"
Task: "pnpm test:e2e (T012)"
Task: "pnpm build (T013)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

For this fix, "MVP" and "the entire fix" are essentially the same thing because the same code change satisfies all three user stories. The recommended order is:

1. Phase 1 (Setup) — add the tablet Playwright project
2. Phase 2 (Foundational) — write the failing test, confirm it fails
3. Phase 3 (US1) — apply the five className edits, confirm desktop assertions pass
4. **STOP and validate**: at this point, the bug from issue #114 is fixed. You could merge here in principle.
5. Phase 4 (US2) — verify tablet assertions still pass (no extra work; just running the test against the other project)
6. Phase 5 (US3) — manual verification of the hybrid-device case
7. Phase 6 (Polish) — run the full verification suite, commit, push, open PR

### Why all three stories collapse into one code change

All three user stories ultimately ask the same question: "Does the editor's layout follow device input type?" The fix to `pointer-fine:` / `pointer-coarse:` answers that question for ALL devices simultaneously, because the CSS media query is evaluated by the browser per-user, regardless of which "story" the user matches. The story-by-story phasing is preserved here for traceability with the spec, but the underlying work is unified.

---

## Notes

- **Constitution principle II (TDD for bug fixes)** is enforced by Phase 2 → Phase 3 sequencing. Do not skip T003.
- **No new dependencies** are added in any task. Tailwind 4's `pointer-fine:` and `pointer-coarse:` variants are already built-in.
- **No DOM structure changes** — only className strings change. JSX remains identical.
- **Same-file edits are not parallelizable** — T004 covers all four edits in `canvas-editor.tsx` precisely because parallel edits to the same file would race.
- **Commit cadence**: a single commit at the end of Phase 6 (T015) is fine for this size of change. If you prefer two commits, split as: (1) add Playwright project + failing test, (2) apply className fix + verification. Either is acceptable to the constitution.
