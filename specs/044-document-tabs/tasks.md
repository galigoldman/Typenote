# Tasks: Document Tabs

**Input**: Design documents from `/specs/044-document-tabs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — required by project constitution (Vitest unit + Playwright E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the tab infrastructure skeleton — files, directories, basic types.

- [x] T001 Create TypeScript types for tab state (OpenTab, TabSession) in `src/types/tabs.ts`
- [x] T002 [P] Create `TabsProvider` context skeleton with empty state and placeholder actions in `src/contexts/tabs-context.tsx`
- [x] T003 [P] Create `TabBar` component skeleton (empty container) in `src/components/tabs/tab-bar.tsx`
- [x] T004 [P] Create `TabItem` component skeleton (title + close button) in `src/components/tabs/tab-item.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core tab state logic that ALL user stories depend on. Must complete before any story work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Implement `TabsProvider` full state logic — `openTab()`, `closeTab()`, `switchTab()`, `getTabs()` in `src/contexts/tabs-context.tsx` (depends on T001, T002)
- [x] T006 Add `getDocument()` server action for client-side document fetching in `src/lib/actions/documents.ts` (or verify it exists and returns full document data)
- [x] T007 Mount `TabsProvider` in the dashboard layout so it wraps document pages in `src/app/(dashboard)/layout.tsx` or `src/components/dashboard/sidebar-layout.tsx`
- [ ] T008 [P] Write unit tests for `TabsProvider` state transitions (open, close, switch, deduplicate) in `src/__tests__/contexts/tabs-context.test.ts`

**Checkpoint**: Tab context is available throughout the app. State logic works correctly. No UI yet.

---

## Phase 3: User Story 1 — View and Switch Between Open Documents (Priority: P1) MVP

**Goal**: Users can open multiple documents as tabs and click tabs to switch instantly.

**Independent Test**: Open two documents, verify both appear as tabs, click each tab to confirm instant document switch.

### Tests for User Story 1

- [ ] T009 [P] [US1] Write E2E test: open document → verify tab appears in tab bar in `e2e/document-tabs.spec.ts`
- [ ] T010 [P] [US1] Write E2E test: open second document → verify both tabs visible → click first tab → verify switch in `e2e/document-tabs.spec.ts`
- [ ] T011 [P] [US1] Write E2E test: open same document twice → verify no duplicate tab created in `e2e/document-tabs.spec.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement `TabBar` component — render list of open tabs, highlight active tab, horizontal layout in `src/components/tabs/tab-bar.tsx` (depends on T005)
- [x] T013 [US1] Implement `TabItem` component — document title display, active/inactive styling, click handler for switching in `src/components/tabs/tab-item.tsx`
- [x] T014 [US1] Integrate `TabBar` into the document page layout — render above the editor area in `src/components/dashboard/sidebar-layout.tsx` (depends on T012)
- [x] T015 [US1] Modify `DocumentCard` to call `openTab()` from tabs context instead of `router.push()` in `src/components/dashboard/document-card.tsx`
- [x] T016 [US1] Modify all document navigation to call `openTab()` instead of `router.push()` in `week-section.tsx`, `material-item.tsx`, `personal-file-item.tsx`, `create-document-dialog.tsx`
- [x] T017 [US1] Implement `TabRegistrar` — auto-registers current document as a tab on page load in `src/components/tabs/tab-registrar.tsx`
- [x] T018 [US1] URL stays in sync via `router.push()` in `openTab()`/`switchTab()` — uses Next.js client-side navigation (fast RSC)
- [ ] T019 [US1] Cache document data in tab context so re-switching to a previously opened tab is instant (no re-fetch) in `src/contexts/tabs-context.tsx`
- [ ] T020 [US1] Ensure auto-save flushes when switching away from a tab (call `flushSave()` before deactivating) in `src/contexts/tabs-context.tsx`

**Checkpoint**: User Story 1 fully functional — open multiple docs as tabs, click to switch instantly, no duplicates.

---

## Phase 4: User Story 2 — Close Document Tabs (Priority: P2)

**Goal**: Users can close tabs via X button, with intelligent adjacent-tab switching.

**Independent Test**: Open 3 documents, close the middle tab, verify it's removed and active tab switches to an adjacent one. Close last remaining tab and verify redirect to dashboard.

### Tests for User Story 2

- [ ] T021 [P] [US2] Write E2E test: close a non-active tab → verify removal, active tab unchanged in `e2e/document-tabs.spec.ts`
- [ ] T022 [P] [US2] Write E2E test: close the active tab → verify switch to right neighbor in `e2e/document-tabs.spec.ts`
- [ ] T023 [P] [US2] Write E2E test: close the last remaining tab → verify redirect to dashboard in `e2e/document-tabs.spec.ts`

### Implementation for User Story 2

- [x] T024 [US2] Add close (X) button to `TabItem` component with click handler that calls `closeTab(docId)` in `src/components/tabs/tab-item.tsx` (depends on T013)
- [x] T025 [US2] Implement `closeTab()` adjacent-tab selection logic — prefer right neighbor, fall back to left in `src/contexts/tabs-context.tsx`
- [x] T026 [US2] Implement last-tab-close behavior — redirect to `/dashboard` when closing the final tab in `src/contexts/tabs-context.tsx`
- [ ] T027 [US2] Ensure `flushSave()` is called for the closed tab's editor before unmounting in `src/contexts/tabs-context.tsx`

**Checkpoint**: User Story 2 fully functional — close tabs with X, proper adjacent switching, dashboard redirect on last close.

---

## Phase 5: User Story 3 — Persist Open Tabs Across Sessions (Priority: P3)

**Goal**: Open tabs survive page refresh and browser close/reopen.

**Independent Test**: Open 3 documents as tabs, refresh the page, verify all 3 tabs are restored with the same active tab.

### Tests for User Story 3

- [ ] T028 [P] [US3] Write unit test: localStorage write on tab state change in `src/__tests__/contexts/tabs-context.test.ts`
- [ ] T029 [P] [US3] Write unit test: localStorage restore with valid data in `src/__tests__/contexts/tabs-context.test.ts`
- [ ] T030 [P] [US3] Write unit test: localStorage restore removes stale (deleted) document tabs in `src/__tests__/contexts/tabs-context.test.ts`
- [ ] T031 [P] [US3] Write E2E test: open tabs → refresh page → verify tabs restored in `e2e/document-tabs.spec.ts`

### Implementation for User Story 3

- [x] T032 [US3] Persistence via lazy `useState` initializer reads from localStorage on mount in `src/contexts/tabs-context.tsx`
- [x] T033 [US3] `useEffect` saves to localStorage on every tab/activeTabId change in `src/contexts/tabs-context.tsx`
- [x] T034 [US3] Added `getDocumentsBatch()` server action for batch-validating tab document IDs in `src/lib/actions/documents.ts`
- [ ] T035 [US3] Handle edge case: restored active tab was deleted → select first remaining tab or redirect to dashboard in `src/contexts/tabs-context.tsx`

**Checkpoint**: User Story 3 fully functional — tabs persist across refresh, deleted documents cleaned up automatically.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, visual polish, mobile support, and overflow handling.

- [x] T036 [P] Implement tab bar horizontal scroll/overflow when many tabs are open (> visible width) in `src/components/tabs/tab-bar.tsx`
- [x] T037 [P] Implement title truncation with ellipsis for long document titles in `src/components/tabs/tab-item.tsx`
- [x] T038 [P] Touch-friendly tab sizing ensured via min-w/max-w on tab items in `src/components/tabs/tab-item.tsx`
- [x] T039 Handle document deletion (from sidebar or elsewhere) — remove corresponding tab if open in `src/components/dashboard/document-card.tsx`
- [x] T040 Tab bar only shows on document pages via conditional render in `src/components/dashboard/sidebar-layout.tsx`
- [x] T041 Visual styling — active tab distinguished, consistent with app design system (shadcn/ui, Tailwind) in `src/components/tabs/tab-bar.tsx` and `tab-item.tsx`
- [ ] T042 Update `e2e/TEST_REGISTRY.md` with document tabs feature test scenarios
- [ ] T043 Run full test suite: `pnpm test && pnpm test:integration && pnpm test:e2e` — all must pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion — this is the MVP
- **User Story 2 (Phase 4)**: Depends on Phase 3 (needs tab bar + switching to exist before close can work)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (needs tab context) — can run in parallel with US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational only — **MVP standalone**
- **User Story 2 (P2)**: Depends on US1 (close button needs tab bar to exist)
- **User Story 3 (P3)**: Depends on Foundational only — can run in parallel with US1/US2 (persistence is additive)

### Within Each User Story

- Tests written first (must fail before implementation)
- UI components before integration logic
- Core behavior before edge cases
- Commit after each logical group

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 are all independent files — run in parallel
- **Phase 2**: T008 (tests) can run parallel with T006 (server action)
- **Phase 3**: T009, T010, T011 (E2E tests) can be written in parallel; T015 and T016 (navigation changes) can run in parallel
- **Phase 4**: T021, T022, T023 (E2E tests) can be written in parallel
- **Phase 5**: T028, T029, T030, T031 (tests) can all run in parallel; US3 itself can start alongside US2
- **Phase 6**: T036, T037, T038 are independent component changes — run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (skeleton files)
2. Complete Phase 2: Foundational (tab context + server action)
3. Complete Phase 3: User Story 1 (open docs as tabs, switch instantly)
4. **STOP and VALIDATE**: Test tab opening/switching independently
5. Deploy/demo the MVP

### Incremental Delivery

1. Setup + Foundational → Tab infrastructure ready
2. Add User Story 1 → Test → Deploy (MVP: open and switch tabs)
3. Add User Story 2 → Test → Deploy (close tabs with X)
4. Add User Story 3 → Test → Deploy (persist across sessions)
5. Polish phase → Final deployment
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No database migrations needed — purely client-side feature
- Two editor types (TipTap + Canvas) must both work under tabs
- Auto-save must flush before tab switch/close to prevent data loss
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
