# Tasks: Homework AI Context

**Input**: Design documents from `/specs/046-homework-ai-context/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema, TypeScript types, and seed data for homework sessions

- [x] T001 Create Supabase migration for `homework_sessions` and `homework_session_materials` tables with RLS policies in `supabase/migrations/YYYYMMDDHHMMSS_create_homework_sessions.sql` — see `data-model.md` for full schema. Tables: `homework_sessions` (id, document_id UNIQUE FK→documents, exercise_document_id FK→documents, course_id FK→courses, user_id FK→profiles, created_at) and `homework_session_materials` (id, session_id FK→homework_sessions, material_type CHECK IN ('course_material','personal_file','document'), material_id uuid, created_at). RLS: users can SELECT/INSERT/DELETE their own rows on `homework_sessions`; `homework_session_materials` uses EXISTS subquery on parent session's user_id. Unique constraint on (session_id, material_type, material_id). Run `supabase db reset` to verify.
- [x] T002 [P] Add `HomeworkSession`, `HomeworkSessionMaterial`, and `HomeworkContext` TypeScript types to `src/types/database.ts` — see `data-model.md` TypeScript Types section for exact interfaces.
- [x] T003 [P] Update `supabase/seed.sql` with test homework session data — create a homework session for User A linking one of the existing CS101 documents as the exercise, and link one course material as a reference. This lets integration and E2E tests verify the full flow.

**Checkpoint**: Run `supabase db reset` — migration replays cleanly, seed data populates homework tables.

---

## Phase 2: Foundational (Server Actions)

**Purpose**: Server-side logic for creating and reading homework sessions — MUST complete before any UI work

- [x] T004 Implement `createHomeworkSession` server action in `src/lib/actions/homework.ts` — see `contracts/api.md` for full contract. Accepts `{ courseId, exerciseDocumentId, materialRefs }`. Validates course + exercise ownership via Supabase auth. Creates a new document with `course_id`, `purpose: 'homework'`, `title: 'HW — {exercise title}'`. Inserts `homework_sessions` row. Inserts `homework_session_materials` rows for each material ref. Returns `{ documentId, sessionId }`.
- [x] T005 [P] Implement `getHomeworkContext` server action in `src/lib/actions/homework.ts` — see `contracts/api.md`. Accepts `{ documentId }`. Queries `homework_sessions` by document_id. If no session, returns `null`. Fetches exercise document title. For each material in `homework_session_materials`, fetches display name from the appropriate source table based on `material_type` (course_materials.file_name, personal_files.display_name, documents.title). Returns assembled `HomeworkContext`.
- [x] T006 Write integration tests in `src/lib/actions/homework.integration.test.ts` — test `createHomeworkSession` (creates document + session + materials, validates RLS prevents cross-user access), test `getHomeworkContext` (returns correct context, returns null for non-homework doc), test cascade deletion (deleting exercise document cascades to session).

**Checkpoint**: Run `pnpm test:integration` — all homework integration tests pass. Server actions work correctly with RLS.

---

## Phase 3: User Story 1 — Start a Homework Session (Priority: P1)

**Goal**: Student can click "Start Homework" on a course page, select an exercise and materials, and be navigated to a new homework document.

**Independent Test**: Click "Start Homework" → select exercise → optionally select materials → confirm → verify new document is created and user navigates to it.

### Implementation for User Story 1

- [x] T007 [US1] Create `StartHomeworkDialog` component in `src/components/dashboard/start-homework-dialog.tsx` — see `contracts/ui.md` for props. Dialog with two sections: (1) "Select Exercise" — radio-button list of course documents (single-select, required), (2) "Select Reference Materials" — checkbox list of course materials + personal files grouped by week (multi-select, optional). Shows empty state message when no documents exist (FR-012). "Start" button disabled until exercise selected. On confirm: calls `createHomeworkSession`, navigates to new document via `router.push`, fires `trackEvent('document_created', ...)`.
- [x] T008 [US1] Add "Start Homework" button to course page in `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — render `<StartHomeworkDialog>` wrapping a `<Button variant="outline" size="sm">Start Homework</Button>` in the button row next to "New Document". Pass `courseId`, `typedDocuments`, `allMaterials`, combined personal files, and `typedWeeks` as props.
- [ ] T009 [US1] Write E2E test in `e2e/homework.spec.ts` — test the start homework flow: log in → navigate to CS101 course → click "Start Homework" → select an exercise document → select a reference material → click "Start" → verify navigation to new document → verify document title starts with "HW —". Use shared auth helper from `e2e/helpers/auth.ts`. Also test edge case: dialog shows message when course has no documents.

**Checkpoint**: Student can start a homework session from the course page and land on a new document. E2E test passes.

---

## Phase 4: User Story 2 — AI Understands Exercise Questions in Context (Priority: P2)

**Goal**: When the student asks the AI about exercise questions in a homework document, the AI has full context of the exercise content and selected reference materials.

**Independent Test**: Open a homework document → open AI chat → ask about a specific exercise question → verify AI response demonstrates awareness of the exercise content.

### Implementation for User Story 2

- [x] T010 [US2] Extend `buildSystemPrompt` in `src/lib/ai/prompts.ts` — add optional `isHomeworkMode: boolean` parameter to `SystemPromptContext`. When true, append homework-specific instructions: "The student is working on a homework exercise. You have been given the full exercise text and relevant course materials. When the student references specific questions (e.g., 'question 2'), refer to the exercise content provided. Help the student understand the concepts and questions — guide them toward comprehension rather than providing direct solutions. Reference the relevant course material when explaining concepts."
- [x] T011 [US2] Extend `/api/ai/ask` route in `src/app/api/ai/ask/route.ts` — accept optional `homeworkSessionId` in request body. When present: (1) fetch homework session + exercise document content + material content server-side using `getHomeworkContext` and direct DB queries, (2) extract text from exercise document's `content` JSON and `pages` JSON, (3) for file-based materials (course_materials, personal_files), extract text from storage using existing extraction utilities, (4) inject exercise content as a synthetic user/model turn: "Here is the homework exercise the student is working on: [content]", (5) inject material content as another synthetic turn: "Here are the relevant course materials: [content]", (6) prepend these before existing RAG results and conversation history, (7) pass `isHomeworkMode: true` to `buildSystemPrompt`.
- [x] T012 [US2] Fetch homework context on document page and thread props — in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`: import and call `getHomeworkContext({ documentId: docId })` server-side, pass `homeworkSessionId` and `homeworkContext` to `<DocumentWithAi>`. In `src/components/ai/document-with-ai.tsx`: accept new optional props `homeworkSessionId?: string` and `homeworkContext?: HomeworkContext`, pass through to `<AiChatWrapper>`. In `src/components/ai/ai-chat-wrapper.tsx`: accept and pass through the same props to `<AiChatPanel>`.
- [x] T013 [US2] Include `homeworkSessionId` in AI chat API calls — in `src/components/ai/ai-chat-panel.tsx`: accept new optional prop `homeworkSessionId?: string`. In the `handleSend` function, include `homeworkSessionId` in the POST body to `/api/ai/ask` when it's defined.

**Checkpoint**: Open a homework document → ask the AI about an exercise question → AI responds with awareness of the exercise and linked materials.

---

## Phase 5: User Story 3 — View and Manage Homework Context (Priority: P3)

**Goal**: Student can see which exercise and materials are linked as context in their homework document's AI chat panel.

**Independent Test**: Open a homework document → open AI chat → verify the linked exercise name and material names are visible.

### Implementation for User Story 3

- [x] T014 [P] [US3] Create `HomeworkContextBadges` component in `src/components/ai/homework-context-badges.tsx` — see `contracts/ui.md`. Accepts `{ context: HomeworkContext }`. Renders a collapsible section: collapsed shows "Homework: {exercise name} + {N} materials", expanded shows the exercise document name and each material name as badges. Use shadcn/ui `Collapsible` or a simple toggle with `ChevronDown`/`ChevronUp` icons. Style consistently with existing AI panel elements.
- [x] T015 [US3] Render `HomeworkContextBadges` in `AiChatPanel` — in `src/components/ai/ai-chat-panel.tsx`: accept new optional prop `homeworkContext?: HomeworkContext`. When provided, render `<HomeworkContextBadges context={homeworkContext} />` above the message list area (after the conversation list header, before messages). Only visible when a homework session exists.

**Checkpoint**: Open a homework document → open AI chat → linked exercise and materials are displayed as badges. Close and reopen → context persists.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, comprehensive E2E coverage, and final validation

- [ ] T016 Add comprehensive E2E test scenarios to `e2e/homework.spec.ts` — add tests for: (1) starting homework without selecting materials (exercise only — FR-011), (2) homework context persists across page reloads (SC-004), (3) homework context badges visible in AI panel (FR-010). Update `e2e/TEST_REGISTRY.md` with all homework test scenarios.
- [x] T017 Handle edge cases in `StartHomeworkDialog` and `HomeworkContextBadges` — (1) in dialog: when course has no documents, show "Create a document first to use as the exercise" message and disable Start button, (2) in badges: when exercise document has been deleted (getHomeworkContext returns a session but exercise title fetch fails), show "Exercise unavailable" gracefully, (3) in `getHomeworkContext`: handle orphaned material references (material was deleted) by filtering them out and showing remaining materials.
- [x] T018 Run full test suite and verify — run `pnpm test && pnpm test:integration && pnpm test:e2e` to confirm all tests pass. Verify no regressions in existing AI chat, document creation, or course page functionality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001 (migration) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 (server actions)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (server actions) — can run in parallel with US1 but needs createHomeworkSession to test
- **User Story 3 (Phase 5)**: Depends on Phase 2 (getHomeworkContext) — can run in parallel with US1/US2 for the component, but full integration needs prop threading from US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — fully independent
- **US2 (P2)**: Depends on Phase 2. T012 (prop threading) can start independently. T011 (API route) needs the server actions. Full testing needs a homework session created by US1 flow.
- **US3 (P3)**: T014 (component) is fully independent. T015 (integration into AiChatPanel) depends on T012 (prop threading from US2).

### Within Each User Story

- Server actions before UI components
- UI components before page integration
- Page integration before E2E tests
- Commit after each task

### Parallel Opportunities

- T002 + T003 can run in parallel (types + seed data)
- T004 + T005 can run in parallel (createHomeworkSession + getHomeworkContext)
- After Phase 2: US1 tasks (T007–T009) and US3 T014 (component) can start in parallel
- T010 + T012 can run in parallel within US2 (prompts.ts + prop threading are different files)

---

## Parallel Example: Phase 2

```bash
# Launch both server actions in parallel (different functions, same file but independent):
Task: "Implement createHomeworkSession in src/lib/actions/homework.ts"
Task: "Implement getHomeworkContext in src/lib/actions/homework.ts"
```

## Parallel Example: After Phase 2

```bash
# Launch US1 dialog + US3 badges component in parallel (different files, no dependencies):
Task: "Create StartHomeworkDialog in src/components/dashboard/start-homework-dialog.tsx"
Task: "Create HomeworkContextBadges in src/components/ai/homework-context-badges.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration, types, seed)
2. Complete Phase 2: Foundational (server actions + integration tests)
3. Complete Phase 3: User Story 1 (dialog, course page button, E2E)
4. **STOP and VALIDATE**: Test US1 independently — student can start homework and navigate to new document
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → DB + server actions ready
2. Add US1 → Start homework flow works → Deploy (MVP)
3. Add US2 → AI understands exercise context → Deploy
4. Add US3 → Context badges visible in chat → Deploy
5. Polish → Edge cases, comprehensive E2E → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The spec requires tests (CLAUDE.md mandates unit, integration, and E2E tests)
- Integration tests (T006) cover both server actions and RLS
- E2E tests (T009, T016) cover the full user flow
- Each user story is independently testable after its phase completes
- Commit after each task or logical group
