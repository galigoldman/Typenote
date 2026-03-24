# Tasks: Fix LaTeX Math Direction in RTL Text

**Input**: Design documents from `/specs/027-fix-latex-rtl/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Included per constitution Principle II (Test-Driven Quality).

**Organization**: Tasks are grouped by user story. US1 and US2 share the same CSS fix in `globals.css` but are independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup needed — no new dependencies, no schema changes. All modifications target existing files.

_(No tasks in this phase)_

---

## Phase 2: Foundational

**Purpose**: No foundational/blocking infrastructure needed. The fix is CSS-only across existing rendering surfaces.

_(No tasks in this phase)_

---

## Phase 3: User Story 1 — Inline Math Renders LTR in Hebrew Text (Priority: P1) MVP

**Goal**: Inline LaTeX expressions display LTR with correct symbol orientation (e.g., `y ∈ S` not `S ∋ y`) when embedded in Hebrew/RTL text in the live editor.

**Independent Test**: Type Hebrew text in a text box, insert inline LaTeX with directional symbols (`\in`, `\to`, `\leq`), verify symbols render in standard LTR orientation.

### Tests for User Story 1

- [x] T001 [US1] Write unit test verifying KaTeX `.katex` elements get `direction: ltr` and `unicode-bidi: isolate` CSS in src/app/globals.css (check CSS rule exists and is correctly defined)

### Implementation for User Story 1

- [x] T002 [US1] Add `.katex { direction: ltr; unicode-bidi: isolate; }` CSS rule to src/app/globals.css near the existing RTL list styling section

**Checkpoint**: Inline math in the editor should now render LTR regardless of surrounding text direction. Verify manually with Hebrew text + `y \in S`.

---

## Phase 4: User Story 2 — Block/Display Math Renders LTR in RTL Context (Priority: P2)

**Goal**: Standalone display/block LaTeX equations render LTR with correct symbol orientation when the document contains Hebrew text.

**Independent Test**: Create a display-mode LaTeX equation in a Hebrew document, verify it renders LTR.

### Implementation for User Story 2

- [x] T003 [US2] Verify the `.katex` rule from T002 also covers `.katex-display` elements (`.katex-display` wraps `.katex`, so the existing rule should cascade) — no additional CSS needed, just verification

**Checkpoint**: Both inline and display math render LTR in the editor. The same `globals.css` rule covers both modes.

---

## Phase 5: User Story 3 — PDF Export Preserves LTR Math in RTL Text (Priority: P3)

**Goal**: Exported PDFs preserve correct LTR direction for all math expressions embedded in Hebrew text.

**Independent Test**: Export a Hebrew document containing inline and block LaTeX to PDF, verify math symbols have correct LTR orientation.

### Implementation for User Story 3

- [x] T004 [P] [US3] Add `.katex { direction: ltr; unicode-bidi: isolate; }` to the `PROSE_CSS` constant in src/lib/pdf/html-template.ts near the existing `.katex-display` rule
- [x] T005 [P] [US3] Add `direction: 'ltr'` style to the hidden DOM measurement container in src/lib/pdf/math-renderer.ts (also added to SVG foreignObject wrappers)

**Checkpoint**: PDF export of Hebrew documents with LaTeX shows correct LTR math symbols.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification across all rendering surfaces and regression check.

- [x] T006 Run full test suite (`pnpm test`) to verify no regressions in existing LTR math rendering — 693 tests passed
- [x] T007 Run linter (`pnpm lint`) — 0 errors (35 pre-existing warnings)
- [ ] T008 Manual verification: test all edge cases from spec (mixed LTR/RTL text, directional arrows, nested expressions like `\lim_{n \to \infty}`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Skipped — no setup needed
- **Phase 2 (Foundational)**: Skipped — no blocking prerequisites
- **Phase 3 (US1)**: Can start immediately — MVP fix
- **Phase 4 (US2)**: Depends on T002 (same CSS rule) — verification only
- **Phase 5 (US3)**: Independent of US1/US2 — different files (can run in parallel)
- **Phase 6 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies — start immediately
- **User Story 2 (P2)**: Depends on US1 (shares the same `globals.css` rule)
- **User Story 3 (P3)**: Independent — modifies different files (`html-template.ts`, `math-renderer.ts`)

### Parallel Opportunities

- T004 and T005 can run in parallel (different files)
- US1+US2 (editor) and US3 (PDF export) can be worked on in parallel

---

## Parallel Example: User Story 3

```bash
# Launch both PDF export fixes together (different files):
Task: "Add .katex LTR rule to PROSE_CSS in src/lib/pdf/html-template.ts"
Task: "Add direction: ltr to measurement container in src/lib/pdf/math-renderer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T002 (US1: editor inline math fix)
2. **STOP and VALIDATE**: Test with Hebrew text + inline LaTeX in live editor
3. This alone fixes the primary user-facing bug

### Incremental Delivery

1. US1 (T001-T002) → Editor inline math fixed → Validate
2. US2 (T003) → Editor display math verified → Validate
3. US3 (T004-T005) → PDF export fixed → Validate
4. Polish (T006-T008) → Full regression + edge case check

---

## Notes

- Total: 8 tasks (1 test, 4 implementation, 1 verification, 2 polish)
- This is a small, focused CSS fix — no new files, no schema changes, no new dependencies
- The core fix (T002) is a single 4-line CSS rule that solves the primary bug
- PDF export (T004-T005) is independently fixable from the editor fix
