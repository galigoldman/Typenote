# Tasks: Math Expression Copy & Paste

**Input**: Design documents from `/specs/036-math-copy-paste/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Included per constitution Principle II (Test-Driven Quality). Unit tests written first, E2E tests in final phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Changes)

**Purpose**: Add `renderText` to the math extension — needed by both US1 (copy produces LaTeX plain text) and US2 (paste rules depend on the node type being fully configured).

- [x] T001 Add `renderText` method to `MathExpression` node returning `node.attrs.latex` in `src/lib/editor/math-extension.ts`
- [x] T002 Add unit test for `renderText` verifying it returns the LaTeX attribute value in `src/lib/editor/math-extension.test.ts`

**Checkpoint**: `renderText` works — native Ctrl+C on a selected math node now copies LaTeX as plain text.

---

## Phase 2: User Story 1 - Select and Copy a Math Expression (Priority: P1) MVP

**Goal**: Click a math expression to select it, see an action menu with Edit + Copy, and copy it to clipboard in dual format (HTML for round-trip, LaTeX for external apps).

**Independent Test**: Create a math expression via `:{`, click it to select, click Copy, paste elsewhere in the same document — the pasted result is an identical editable math node.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T003 [P] [US1] Unit test: `MathNodeView` renders selection highlight when `selected` prop is `true` in `src/components/editor/math-node-view.test.tsx`
- [x] T004 [P] [US1] Unit test: `MathNodeView` shows Edit and Copy buttons when `selected` is `true` in `src/components/editor/math-node-view.test.tsx`
- [x] T005 [P] [US1] Unit test: clicking Edit button opens the edit panel (existing behavior preserved) in `src/components/editor/math-node-view.test.tsx`
- [x] T006 [P] [US1] Unit test: clicking Copy button calls `navigator.clipboard.write` with both `text/html` and `text/plain` MIME types in `src/components/editor/math-node-view.test.tsx`

### Implementation for User Story 1

- [x] T007 [US1] Refactor click handler in `MathNodeView` — remove direct `openEditor` on click, let ProseMirror handle `NodeSelection` natively in `src/components/editor/math-node-view.tsx`
- [x] T008 [US1] Add selection state UI — use `selected` prop to show visual highlight (border/background) on the math span in `src/components/editor/math-node-view.tsx`
- [x] T009 [US1] Add action menu (Edit + Copy buttons) — render conditionally when `selected` is `true`, positioned below the math span in `src/components/editor/math-node-view.tsx`
- [x] T010 [US1] Wire Edit button to existing `openEditor` function in `src/components/editor/math-node-view.tsx`
- [x] T011 [US1] Implement `handleCopy` function — use `editor.view.serializeForClipboard(slice)` for HTML and `node.attrs.latex` for plain text, write via `navigator.clipboard.write()` with `ClipboardItem` in `src/components/editor/math-node-view.tsx`
- [x] T012 [US1] Add brief "Copied!" visual feedback after successful copy in `src/components/editor/math-node-view.tsx`
- [x] T013 [US1] Verify all T003–T006 tests pass and no existing math-node-view tests regress

**Checkpoint**: User Story 1 is fully functional — click to select, Edit works as before, Copy writes dual-format to clipboard, paste within Typenote recreates the math node.

---

## Phase 3: User Story 2 - Paste Math from External Sources (Priority: P2)

**Goal**: Recognize math content in pasted HTML (KaTeX/MathJax/MathML) and in pasted plain text (LaTeX delimiters like `$...$`) and convert them into editable math nodes.

**Independent Test**: Copy rendered math from a KaTeX demo page and paste into Typenote — a math node appears. Copy `$\frac{1}{2}$` from a text editor and paste — a rendered math node appears.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US2] Unit test: `parseHTML` matches `<span class="katex">` with `<annotation encoding="application/x-tex">` and extracts LaTeX in `src/lib/editor/math-extension.test.ts`
- [x] T015 [P] [US2] Unit test: `parseHTML` matches `<math>` element with `<annotation encoding="application/x-tex">` and extracts LaTeX in `src/lib/editor/math-extension.test.ts`
- [x] T016 [P] [US2] Unit test: `parseHTML` returns `false` (skip) for `<span class="katex">` without annotation in `src/lib/editor/math-extension.test.ts`
- [x] T017 [P] [US2] Unit test: paste rule converts `$\frac{1}{2}$` in plain text to a `mathExpression` node in `src/lib/editor/math-extension.test.ts`
- [x] T018 [P] [US2] Unit test: paste rule converts `\(\frac{1}{2}\)` in plain text to a `mathExpression` node in `src/lib/editor/math-extension.test.ts`
- [x] T019 [P] [US2] Unit test: paste rule converts `$$\sum_{i=0}^{n}$$` (display math) to a `mathExpression` node in `src/lib/editor/math-extension.test.ts`
- [x] T020 [P] [US2] Unit test: paste rule does NOT convert text without LaTeX delimiters (no false positives) in `src/lib/editor/math-extension.test.ts`
- [x] T021 [P] [US2] Unit test: mixed content paste `"The formula $x^2$ equals..."` preserves text and converts only the math portion in `src/lib/editor/math-extension.test.ts`

### Implementation for User Story 2

- [x] T022 [US2] Add `parseHTML` rule for KaTeX rendered HTML — match `span.katex`, extract LaTeX from nested `annotation[encoding="application/x-tex"]`, return `false` if no annotation found in `src/lib/editor/math-extension.ts`
- [x] T023 [US2] Add `parseHTML` rule for MathML — match `math` element, extract LaTeX from nested `annotation[encoding="application/x-tex"]`, return `false` if no annotation found in `src/lib/editor/math-extension.ts`
- [x] T024 [US2] Add `addPasteRules()` with `nodePasteRule` for inline LaTeX: `$...$` (not `$$`) and `\(...\)` delimiters in `src/lib/editor/math-extension.ts`
- [x] T025 [US2] Add `nodePasteRule` for display LaTeX: `$$...$$` and `\[...\]` delimiters in `src/lib/editor/math-extension.ts`
- [x] T026 [US2] Verify all T014–T021 tests pass and no existing math-extension tests regress

**Checkpoint**: User Story 2 is fully functional — pasting KaTeX HTML, MathML, or LaTeX-delimited text produces editable math nodes. Mixed content preserves both text and math.

---

## Phase 4: User Story 3 - Cursor and Interaction Polish (Priority: P3)

**Goal**: Fix cursor to show text-selection instead of pointer, verify atomic selection behavior in text ranges.

**Independent Test**: Hover over a math expression and verify the cursor is a default/text cursor, not a hand pointer. Select a text range spanning a math node and verify it's included as a whole unit.

### Tests for User Story 3

- [x] T027 [P] [US3] Unit test: math expression span does NOT have `cursor: pointer` style in `src/components/editor/math-node-view.test.tsx`
- [x] T028 [P] [US3] Unit test: math expression span renders with default cursor style in `src/components/editor/math-node-view.test.tsx`

### Implementation for User Story 3

- [x] T029 [US3] Change `cursor: 'pointer'` to `cursor: 'default'` on the rendered math span in `src/components/editor/math-node-view.tsx`
- [x] T030 [US3] Verify atomic selection behavior — with `atom: true` already set, text range selection should include math nodes as whole units (test manually, document in checkpoint)
- [x] T031 [US3] Verify T027–T028 tests pass

**Checkpoint**: Cursor shows correct style, selection feels consistent with other content.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, edge case handling, and final verification across both editor modes.

- [ ] T032 [P] Create E2E test: create math via `:{`, select it, copy via action menu, paste elsewhere — verify round-trip fidelity in `e2e/math-copy-paste.spec.ts`
- [ ] T033 [P] Create E2E test: paste `$\frac{1}{2}$` plain text — verify rendered math node appears in `e2e/math-copy-paste.spec.ts`
- [ ] T034 Verify math copy-paste works in both canvas page mode (text boxes) and text-only editor mode
- [x] T035 Run full test suite (`pnpm test`) and fix any regressions
- [x] T036 Run linter (`pnpm lint`) and formatter (`pnpm format:check`) — fix any issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 (`renderText` needed for copy plain text)
- **User Story 2 (Phase 3)**: Depends on Phase 1 only — can run in parallel with US1
- **User Story 3 (Phase 4)**: No dependencies on US1 or US2 — can run in parallel
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 (renderText). Modifies `math-node-view.tsx` only.
- **User Story 2 (P2)**: Depends on T001 (renderText). Modifies `math-extension.ts` only.
- **User Story 3 (P3)**: No dependencies. Modifies `math-node-view.tsx` (different section than US1).

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks are sequential within a story (each builds on the previous)
- Story complete before moving to Polish phase

### Parallel Opportunities

- **T003–T006** (US1 tests): All target different test cases in same file — run in parallel
- **T014–T021** (US2 tests): All target different test cases in same file — run in parallel
- **T027–T028** (US3 tests): Both test tasks can run in parallel
- **US1 and US2 implementation**: Modify different files (`math-node-view.tsx` vs `math-extension.ts`) — can run in parallel after Phase 1
- **US3**: Can run in parallel with US1 or US2 (touches different section of `math-node-view.tsx`)
- **T032–T033** (E2E tests): Different test files, can run in parallel

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task: "Unit test: parseHTML matches <span class='katex'>" (T014)
Task: "Unit test: parseHTML matches <math> element" (T015)
Task: "Unit test: parseHTML returns false without annotation" (T016)
Task: "Unit test: paste rule converts $...$ to math node" (T017)
Task: "Unit test: paste rule converts \(...\) to math node" (T018)
Task: "Unit test: paste rule converts $$...$$ to math node" (T019)
Task: "Unit test: no false positives" (T020)
Task: "Unit test: mixed content preserves text" (T021)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001–T002)
2. Complete Phase 2: User Story 1 (T003–T013)
3. **STOP and VALIDATE**: Select a math expression, copy it, paste it — verify round-trip works
4. This alone resolves the core of GitHub issue #120

### Incremental Delivery

1. Complete Foundational → `renderText` ready
2. Add User Story 1 → Select + Copy works → Demo (MVP!)
3. Add User Story 2 → External paste works → Demo
4. Add User Story 3 → Cursor polish → Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files or different test cases, no dependencies
- [Story] label maps task to specific user story for traceability
- Total: 36 tasks (2 foundational, 15 US1, 14 US2, 5 US3, 5 polish)
- No new npm dependencies needed
- No database changes needed
- Only 2 source files modified: `math-extension.ts` and `math-node-view.tsx`
- Commit after each task or logical group
