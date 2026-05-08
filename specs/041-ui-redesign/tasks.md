# Tasks: UI Redesign

**Input**: Design documents from `/specs/041-ui-redesign/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: No new test files needed — this is a CSS restyling feature. Existing tests must continue to pass. Test fix tasks included for any broken assertions.

**Organization**: Tasks grouped by user story. US5 (Color Scheme) is foundational and done first since all other stories depend on the updated CSS variables.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Global Color Scheme (US5)

**Purpose**: Update CSS custom properties that cascade to all components. Must complete before component-level restyling.

**Goal**: Warm off-white backgrounds, cream sidebar, correct border radius for ~12px card corners

- [x] T001 [US5] Update light-mode CSS variables in `src/app/globals.css`: shift `--background` hue from cool 293 to warm cream (~60-80), add/update `--sidebar` variable to cream/beige tone, increase `--radius` base to 0.75rem (~12px) for rounder card corners
- [x] T002 [US5] Update dark-mode CSS variables in `src/app/globals.css`: adjust dark `--background` and `--sidebar` to complementary warm-dark tones, verify contrast ratios remain accessible
- [x] T003 [US5] Verify global CSS changes render correctly: run `pnpm dev` and visually confirm the background warmth, sidebar color, and card radius changes propagate across dashboard and editor pages

**Checkpoint**: Background should be visibly warmer (cream tint), sidebar slightly darker cream, cards more rounded

---

## Phase 2: User Story 1 — Sidebar Restyling (Priority: P1)

**Goal**: Restyle the sidebar logo, folder tree, and sign-out button with updated colors, spacing, and hover states

**Independent Test**: Open sidebar on dashboard, expand folders, verify styling. Open on mobile, verify sheet still works.

### Implementation for User Story 1

- [x] T004 [US1] Restyle sidebar logo/title area in `src/app/(dashboard)/layout.tsx`: update "Typenote" heading to use `text-primary` color, increase font weight, add subtle purple branding accent
- [x] T005 [US1] Update sidebar container background in `src/components/dashboard/sidebar-layout.tsx`: apply the new `--sidebar` background color via `bg-sidebar` class, ensure border styling matches mockup's softer dividers
- [x] T006 [US1] Restyle folder tree items in `src/components/dashboard/sidebar-folder-tree.tsx`: update hover states to `hover:bg-primary/10`, active item states to `bg-primary/10 text-primary font-medium`, adjust item padding/spacing for more breathing room
- [x] T007 [US1] Restyle sign-out button in `src/app/(dashboard)/layout.tsx`: ensure it matches the new color scheme with appropriate hover state
- [x] T008 [US1] Verify mobile sidebar sheet behavior: open the app on mobile/narrow viewport, confirm the sidebar sheet opens/closes correctly with updated styling, no layout breaks

**Checkpoint**: Sidebar should have cream background, purple-accented active states, and refined spacing. All navigation works.

---

## Phase 3: User Story 2 — Dashboard Card Restyling (Priority: P1)

**Goal**: Restyle course, folder, and document cards with elevated card design, add document top border bars, polish Moodle banner

**Independent Test**: Log in, verify dashboard shows elevated cards with shadows, document cards have colored top borders, Moodle prompt looks polished.

### Implementation for User Story 2

- [x] T009 [P] [US2] Restyle course cards in `src/components/dashboard/course-card.tsx`: replace current inline list-item styling (`rounded-lg border p-4`) with elevated card appearance (`rounded-xl bg-card shadow-sm p-5`), keep existing GraduationCap icon with course color, ensure hover state shows `shadow-md` transition
- [x] T010 [P] [US2] Restyle folder cards in `src/components/dashboard/folder-card.tsx`: apply same elevated card treatment as course cards (`rounded-xl bg-card shadow-sm p-5`), keep existing folder icon with color
- [x] T011 [P] [US2] Add colored top border bars to document cards in `src/components/dashboard/document-card.tsx`: add a 4px top border using the existing subject color from `SUBJECT_COLORS` mapping (e.g., `border-t-4` with inline `style={{ borderTopColor }}` derived from the subject), ensure cards maintain `rounded-xl` with the border visible above the rounded corners (use `overflow-hidden` on the card wrapper)
- [x] T012 [P] [US2] Restyle Moodle sync prompt in `src/components/dashboard/moodle-sync-prompt.tsx`: increase card padding, make the sync button larger and more prominent with `variant="default"` (purple primary), add a descriptive icon (e.g., `RefreshCw` or keep existing), match mockup's banner-card appearance
- [x] T013 [US2] Update dashboard section headers in `src/app/(dashboard)/dashboard/page.tsx`: restyle "Courses" and "Documents" labels with larger, bolder typography (`text-lg font-semibold` or similar), adjust spacing between sections
- [x] T014 [US2] Verify dashboard functionality: click course cards, document cards, folder cards — confirm navigation works. Open create dialogs — confirm they still function. Verify Moodle prompt renders correctly.

**Checkpoint**: Dashboard should show polished elevated cards with shadows, document cards have colored top accents, Moodle banner is prominent. All clicks and dialogs work.

---

## Phase 4: User Story 3 — Document Editor Restyling (Priority: P2)

**Goal**: Restyle course breadcrumb as pill badge, update title typography, refine toolbar styling

**Independent Test**: Open a document within a course, verify pill badge, large purple title, and polished toolbar.

### Implementation for User Story 3

- [x] T015 [P] [US3] Restyle course breadcrumb as pill badge in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`: update the existing `Link` element's classes from current `rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary` to an uppercase pill style (`uppercase text-xs tracking-wider font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full px-3 py-1`), keep it as a clickable link
- [x] T016 [P] [US3] Update document title styling in `src/components/editor/tiptap-editor.tsx`: increase title input size from `text-2xl` to `text-3xl` or `text-4xl`, ensure it uses `text-primary` for purple tint, adjust padding around the header area
- [x] T017 [P] [US3] Refine editor toolbar styling in `src/components/editor/editor-toolbar.tsx`: ensure toolbar buttons have consistent sizing, update hover states to use purple accent (`hover:bg-primary/10`), verify active state styling (`bg-accent text-accent-foreground`) looks correct with new color scheme
- [x] T018 [US3] Verify editor functionality: open documents with and without courses, type content, use toolbar buttons (bold, italic, headings, lists), verify all formatting still works correctly

**Checkpoint**: Documents show uppercase course pill badge, larger purple title, and polished toolbar. All editing features work.

---

## Phase 5: User Story 4 — AI Chat Panel Restyling (Priority: P2)

**Goal**: Update AI panel icon color, add message role labels, change user bubble color to teal

**Independent Test**: Open AI panel, send a message, verify green header icon, "AI ASSISTANT"/"YOU" labels, teal user bubbles.

### Implementation for User Story 4

- [x] T019 [US4] Update AI panel header icon color in `src/components/ai/ai-chat-panel.tsx`: change the Sparkles icon class from `text-[#6355C0]` (purple) to a green/teal color (`text-emerald-600` or `text-teal-600`) to match the mockup's green "AI Tutor" icon
- [x] T020 [US4] Add role labels to chat messages in `src/components/ai/ai-chat-panel.tsx`: add a small `"AI ASSISTANT"` label (e.g., `text-[10px] uppercase tracking-wider text-muted-foreground font-medium`) above assistant message bubbles, and a `"YOU"` label above user message bubbles, right-aligned
- [x] T021 [US4] Change user message bubble color in `src/components/ai/ai-chat-panel.tsx`: update user message bubble from `bg-primary` (purple) to teal/green (`bg-teal-600 text-white` or `bg-emerald-600 text-white`), keep `rounded-2xl rounded-br-md` shape
- [x] T022 [US4] Update AI input placeholder and send button in `src/components/ai/ai-chat-panel.tsx`: ensure placeholder reads "Ask anything about your course materials...", ensure send button uses purple accent color (`bg-primary text-primary-foreground` or similar rounded style)
- [x] T023 [US4] Verify AI panel functionality: open the panel, send a test message, verify response renders correctly, toggle between Quick/Deep modes, close and reopen the panel

**Checkpoint**: AI panel shows green icon, distinct role labels on messages, teal user bubbles, purple send button. All chat functionality works.

---

## Phase 6: Polish & Test Fixes

**Purpose**: Fix any broken tests and do final cross-page consistency check

- [x] T024 Run full test suite: execute `pnpm test && pnpm test:integration` and identify any failures caused by changed text, labels, or CSS classes
- [x] T025 Fix broken unit/integration tests: update any assertions that reference old text (e.g., if tests check for specific class names or label text that changed), ensure all tests pass
- [x] T026 Run E2E tests: execute `pnpm test:e2e` and identify any Playwright failures from visual or text changes
- [x] T027 Fix broken E2E tests: update selectors or text assertions in Playwright tests if needed, ensure all E2E tests pass
- [x] T028 Final cross-page visual verification: navigate through dashboard → course page → document editor → AI panel → mobile view, verify consistent styling throughout, no visual regressions or layout breaks
- [x] T029 Run full CI-equivalent check: execute `pnpm lint && pnpm format:check && pnpm test && pnpm test:integration && pnpm test:e2e` — all must pass

**Checkpoint**: All tests pass, styling is consistent across all pages, ready for PR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational/US5)**: No dependencies — start immediately
- **Phase 2 (US1 Sidebar)**: Depends on Phase 1 (needs updated CSS variables)
- **Phase 3 (US2 Dashboard)**: Depends on Phase 1 (needs updated CSS variables)
- **Phase 4 (US3 Editor)**: Depends on Phase 1 (needs updated CSS variables)
- **Phase 5 (US4 AI Panel)**: Depends on Phase 1 (needs updated CSS variables)
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US5 (Color Scheme)**: Foundational — must complete first
- **US1 (Sidebar)**: Independent after US5 — no dependency on other stories
- **US2 (Dashboard)**: Independent after US5 — no dependency on other stories
- **US3 (Editor)**: Independent after US5 — no dependency on other stories
- **US4 (AI Panel)**: Independent after US5 — no dependency on other stories

### Parallel Opportunities

After Phase 1 completes, **all four user stories (US1-US4) can run in parallel** since they modify different files:

- US1: `layout.tsx`, `sidebar-layout.tsx`, `sidebar-folder-tree.tsx`
- US2: `course-card.tsx`, `folder-card.tsx`, `document-card.tsx`, `moodle-sync-prompt.tsx`, `dashboard/page.tsx`
- US3: `documents/[docId]/page.tsx`, `tiptap-editor.tsx`, `editor-toolbar.tsx`
- US4: `ai-chat-panel.tsx`

Within each story, tasks marked [P] can also run in parallel.

---

## Parallel Example: After Phase 1

```bash
# All four stories can start simultaneously:
# Agent 1 (US1): Sidebar restyling
Task: "T004 Restyle sidebar logo in layout.tsx"
Task: "T005 Update sidebar background in sidebar-layout.tsx"
Task: "T006 Restyle folder tree in sidebar-folder-tree.tsx"

# Agent 2 (US2): Dashboard cards
Task: "T009 Restyle course cards in course-card.tsx"
Task: "T010 Restyle folder cards in folder-card.tsx"
Task: "T011 Add document card top borders in document-card.tsx"
Task: "T012 Restyle Moodle prompt in moodle-sync-prompt.tsx"

# Agent 3 (US3): Editor
Task: "T015 Restyle breadcrumb in [docId]/page.tsx"
Task: "T016 Update title styling in tiptap-editor.tsx"
Task: "T017 Refine toolbar in editor-toolbar.tsx"

# Agent 4 (US4): AI Panel
Task: "T019-T022 All in ai-chat-panel.tsx (sequential within file)"
```

---

## Implementation Strategy

### MVP First (Phase 1 + US1 + US2)

1. Complete Phase 1: Global CSS variables
2. Complete US1: Sidebar restyling
3. Complete US2: Dashboard cards
4. **STOP and VALIDATE**: Dashboard and sidebar should look polished
5. Continue with US3 + US4 for complete coverage

### Incremental Delivery

1. Phase 1 → Foundation ready (warm backgrounds, rounded corners)
2. US1 → Sidebar looks polished
3. US2 → Dashboard looks polished (biggest visual impact)
4. US3 → Editor looks polished
5. US4 → AI panel looks polished
6. Phase 6 → All tests pass, ready for PR

---

## Notes

- All changes are CSS/styling only — zero functional changes
- No new files created — only modifications to ~12 existing files
- No database migrations needed
- Constraint: Do NOT add new features from the mockup that don't exist (search bar, FAB, starred toggle, etc.)
- Constraint: Keep all existing buttons and features that the mockup doesn't show (Sign Out, etc.)
- The primary color is already purple — only backgrounds and specific accent colors change
- The AI panel already says "AI Tutor" — main changes are icon color, message labels, and bubble color
