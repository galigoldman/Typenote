# Tasks: LaTeX Onboarding Tooltip

**Input**: Design documents from `/specs/050-latex-onboarding-tooltip/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — CLAUDE.md requires unit tests (Vitest), integration tests, and E2E tests (Playwright) for every feature.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared assets and hooks needed by both user stories

- [x] T001 [P] Create before/after illustration SVG in `public/images/latex-before-after.svg` showing typed text `x^2 + y^2 = r^2` on the left and a rendered equation on the right — lightweight, theme-neutral design
- [x] T002 [P] Create `useLocalDismissal` hook in `src/hooks/use-local-dismissal.ts` that reads/writes a boolean flag to localStorage under the key `typenote:latex-onboarding-dismissed` — returns `[isDismissed, dismiss]` tuple, reads on mount via `useState` initializer to avoid flash
- [x] T003 [P] Write unit tests for `useLocalDismissal` hook in `src/hooks/use-local-dismissal.test.ts` — test: returns false when key absent, returns true when key present, `dismiss()` writes key and updates state, handles SSR (no window)

**Checkpoint**: Hook and assets ready — user story implementation can begin

---

## Phase 2: User Story 1 - First-Time LaTeX Discovery (Priority: P1) MVP

**Goal**: New users automatically see a short, enticing onboarding popover with illustration and "Got it" button when they first open the editor.

**Independent Test**: Open editor with no localStorage key → popover auto-appears with message, illustration, and "Got it" button → click "Got it" → popover closes → reload → popover does NOT auto-appear.

### Implementation for User Story 1

- [x] T004 [US1] Create `LaTeXOnboarding` component in `src/components/editor/latex-onboarding.tsx` — accepts `isFirstTime: boolean`, `isOpen: boolean`, `onDismiss: () => void`, `onToggle: () => void` props. Renders: Sigma icon button (Lucide `Sigma`), and when `isOpen` is true, an absolutely-positioned popover with heading "Math made easy", body "Type `:{` to instantly convert text into beautiful equations", the SVG illustration from `public/images/latex-before-after.svg`, and a "Got it" button (only when `isFirstTime` is true). Use the same outside-click pattern as `HighlightButton` in `editor-toolbar.tsx`.
- [x] T005 [US1] Add `LaTeXOnboarding` to the editor toolbar in `src/components/editor/editor-toolbar.tsx` — place in the "Insert" section (after Blockquote, before the Export PDF separator). Wire up `useLocalDismissal` hook: auto-open popover on mount when `!isDismissed`, pass `dismiss` to `onDismiss`.
- [x] T006 [P] [US1] Write unit tests for `LaTeXOnboarding` component in `src/components/editor/latex-onboarding.test.tsx` — test: renders Sigma icon, shows popover with message and illustration when `isOpen=true`, shows "Got it" button when `isFirstTime=true`, hides "Got it" when `isFirstTime=false`, calls `onDismiss` when "Got it" clicked
- [x] T007 [US1] Update existing toolbar tests in `src/components/editor/editor-toolbar.test.tsx` — add test: LaTeX icon (Sigma) is rendered in the toolbar

**Checkpoint**: First-time onboarding flow is fully functional and testable independently

---

## Phase 3: User Story 2 - On-Demand LaTeX Help (Priority: P2)

**Goal**: Returning users can click the LaTeX icon anytime to re-see the shortcut explanation (without "Got it" button). Popover closes on outside click or re-clicking the icon.

**Independent Test**: Set localStorage dismissal key → open editor → click Sigma icon → popover appears without "Got it" → click outside → popover closes.

### Implementation for User Story 2

- [x] T008 [US2] Add toggle behavior to `LaTeXOnboarding` in `src/components/editor/latex-onboarding.tsx` — clicking the Sigma icon when popover is open closes it, clicking when closed opens it. Outside click also closes. Ensure no "Got it" button when `isFirstTime=false`.
- [x] T009 [P] [US2] Add unit tests for on-demand toggle in `src/components/editor/latex-onboarding.test.tsx` — test: clicking icon toggles popover open/closed, outside click closes popover, no "Got it" button for returning users

**Checkpoint**: Both user stories work independently — first-time auto-show and on-demand toggle

---

## Phase 4: E2E Tests & Polish

**Purpose**: End-to-end browser tests covering real user flows, plus cross-cutting polish

- [x] T010 [P] Write E2E tests in `e2e/latex-onboarding.spec.ts` — use shared login helper from `e2e/helpers/auth.ts`. Test scenarios: (1) First-time flow: clear localStorage, open a document, verify popover auto-appears with message and "Got it" button, click "Got it", verify popover closes, reload, verify popover does NOT auto-appear. (2) On-demand flow: with dismissal key set, click Sigma icon, verify popover appears without "Got it", click outside, verify popover closes.
- [x] T011 [P] Update `e2e/TEST_REGISTRY.md` with LaTeX onboarding tooltip test scenarios
- [x] T012 Verify popover renders correctly in compact toolbar mode (mobile/tablet) — check `src/components/editor/editor-toolbar.tsx` `compact` prop path, ensure LaTeX icon and popover are not hidden
- [x] T013 Run full test suite: `pnpm test && pnpm test:integration && pnpm test:e2e` — fix any failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001, T002, T003 all run in parallel
- **US1 (Phase 2)**: Depends on T001 (SVG) and T002 (hook). T004 → T005 sequential; T006 and T007 parallel after T004
- **US2 (Phase 3)**: Depends on T004 (component exists). T008 → T009
- **Polish (Phase 4)**: Depends on US1 and US2 complete. T010, T011 parallel; T012 after T010; T013 last

### User Story Dependencies

- **User Story 1 (P1)**: Needs Phase 1 complete (hook + SVG). No dependency on US2.
- **User Story 2 (P2)**: Needs US1's component (T004) to extend with toggle behavior. Can be tested independently once T008 is done.

### Parallel Opportunities

```text
Phase 1 (all parallel):
  T001 (SVG)  |  T002 (hook)  |  T003 (hook tests)

Phase 2 (after Phase 1):
  T004 → T005 (sequential)
  T006 (parallel after T004)  |  T007 (parallel after T005)

Phase 3 (after T004):
  T008 → T009

Phase 4 (after US1 + US2):
  T010 (E2E)  |  T011 (registry)
  T012 (after T010)
  T013 (last)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (hook + SVG + hook tests)
2. Complete Phase 2: User Story 1 (component + toolbar + unit tests)
3. **STOP and VALIDATE**: Test first-time onboarding independently
4. If ready, continue to US2 and E2E

### Incremental Delivery

1. Phase 1 → Shared infrastructure ready
2. Phase 2 (US1) → First-time onboarding works → Testable MVP
3. Phase 3 (US2) → On-demand help works → Full feature
4. Phase 4 → E2E tests + polish → Production ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- The spec requires tests (CLAUDE.md mandates Vitest + Playwright for every feature)
- Commit after each task or logical group
- The popover pattern follows the existing `HighlightButton` approach — no new dependencies needed
