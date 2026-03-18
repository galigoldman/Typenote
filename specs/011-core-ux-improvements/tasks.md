# Tasks: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup

**Goal**: Create the database foundation for AI conversation persistence.

- [x] T001 Create migration file `supabase/migrations/00017_ai_conversations.sql` with `ai_conversations` table (id uuid PK, user_id FK profiles, course_id FK courses, title text, created_at, updated_at), `ai_messages` table (id uuid PK, conversation_id FK ai_conversations, role text CHECK user/assistant, content text, sources_json jsonb, model text, created_at), CASCADE deletes on all FKs, RLS policies (conversations: user_id = auth.uid(); messages: EXISTS subquery on ai_conversations), indexes (user_id, course_id, updated_at DESC on conversations; conversation_id, created_at on messages), and handle_updated_at trigger on ai_conversations
- [x] T002 Update `supabase/seed.sql` with test data: 2 conversations for CS101 course and 1 for Linear Algebra course, each with 3-4 alternating user/assistant messages, at least one message with populated sources_json, and staggered updated_at timestamps
- [x] T003 Add `AiConversation` and `AiMessage` TypeScript interfaces to `src/types/database.ts` matching the migration schema (see data-model.md for exact field types)
- [x] T004 Run `supabase db reset` to validate the full migration chain replays cleanly from scratch, then verify seed data loads without errors

---

## Phase 2: Foundational

**Goal**: Build server-side operations (conversation CRUD and extended document move) that the UI phases depend on.

**Prerequisite**: Phase 1 complete.

- [x] T005 Create `src/lib/actions/conversations.ts` with server actions: `createConversation(courseId, title)`, `getConversations(courseId)` returning sorted by updated_at DESC, `getMessages(conversationId)` sorted by created_at ASC, `getRecentMessages(conversationId, limit=20)`, `addMessage(conversationId, {role, content, sources_json?, model?})` that also bumps conversation updated_at, `updateConversationTitle(conversationId, title)`, `deleteConversation(conversationId)` — all authenticated via createClient() and scoped to user_id
- [x] T006 [P] Extend `moveDocument` in `src/lib/actions/documents.ts` — change signature from `(id, folderId)` to `(id, destination: MoveDestination)` where `MoveDestination = {type:'folder', folderId} | {type:'course', courseId, weekId?} | {type:'root'}`. For folder: set folder_id, clear course_id/week_id/material_id. For course: set course_id + optional week_id, clear folder_id, clear material_id if course changes. For root: clear all. Revalidate `/dashboard` and affected course paths.
- [x] T007 Write integration test `src/lib/actions/conversations.integration.test.ts` — test create conversation, list by course (verify ordering), add messages, load messages, delete conversation (verify cascade), verify RLS blocks cross-user access, verify cascade on course deletion
- [x] T008 [P] Write integration test `src/lib/actions/documents.integration.test.ts` — test moveDocument with folder→course, course→folder, week→week (same course), material-linked document move (verify material_id cleared), same-destination no-op, verify DB constraints enforced

---

## Phase 3: US1 — Manual Save Button and Auto-Save Retry (P1)

**Goal**: Add retry logic, error classification, manual save button, and enhanced error indicator to the auto-save system.

**Independent of Phase 2** — can be worked on in parallel.

**Independent Test**:

1. Edit a document, click "Save" manually, verify the save completes and indicator shows "Saved."
2. Simulate a network interruption. Verify auto-save retries 3 times. After retries fail, verify the indicator changes to an error state. Click the indicator and verify error details are shown. Restore the network and verify pending changes are saved.

- [x] T009 [US1] Extend `src/hooks/use-auto-save.ts` — expand SaveStatus to `'saved'|'saving'|'unsaved'|'retrying'|'error'`, add exponential backoff retry (1s→2s→4s, max 3), classify errors (network: TypeError/500/502/503/504 → retry; auth: 401/403 → no retry, errorType 'auth'; permanent: other → no retry, errorType 'permanent'), track retryCount/errorDetails/errorType, expose retryNow() for manual retry, reset retry state on success or new trigger()
- [x] T010 [US1] Extend `src/hooks/use-document-sync.ts` — add reconnection-triggered retry watching connectionStatus transitions (disconnected→connected) and window 'online' event, deduplicate with flag, add manualSave() wrapping flushSave() for the Save button
- [x] T011 [US1] Extend beforeunload handler in `src/hooks/use-document-sync.ts` — set event.returnValue when save status is 'unsaved', 'retrying', or 'error' to show browser confirmation dialog
- [x] T012 [US1] Update SaveIndicator in `src/components/canvas/canvas-editor.tsx` — add 'retrying' (amber, "Retrying...") and 'error' (red, "Error") states to label/color map, wrap error state in Tooltip showing error details (network: "Save failed — check your connection" with clickable Retry; auth: "Session expired — please sign in again"; permanent: error detail text)
- [x] T013 [US1] Add Save button to editor header in `src/components/canvas/canvas-editor.tsx` — ghost variant icon button (Save icon from lucide-react) left of SaveIndicator, calls manualSave(), disabled when 'saved' or 'saving', tooltip "Save now (Ctrl+S)", add Ctrl+S/Cmd+S keydown listener via useEffect
- [x] T014 [US1] Write tests `src/hooks/use-auto-save.test.ts` — test retry with vi.useFakeTimers (verify 3 retries with backoff), error classification (network vs auth vs permanent), state transitions through all 5 states, retryNow() manual trigger, retryCount reset after success, auth errors don't trigger retry, reconnection triggers retry when in error state

---

## Phase 4: US3 — Persistent AI Conversations per Course (P1)

**Goal**: Create conversation API endpoints, integrate persistence into the AI streaming endpoint, and refactor the chat panel to load/save conversations with a list toggle.

**Prerequisite**: Phase 2 complete (conversation server actions).

**Independent Test**: Open AI chat for a course. Ask a question. Close the panel. Reopen the panel for the same course. Verify the conversation is restored. Start a new conversation. Verify the previous one is still accessible. Delete an old conversation. Verify it's gone.

- [x] T015 [P] [US3] Create `src/app/api/ai/conversations/route.ts` — GET handler: validate courseId query param, authenticate, call getConversations(courseId), return JSON with conversations array (include message_count via a count query or aggregate)
- [x] T016 [P] [US3] Create `src/app/api/ai/conversations/[conversationId]/messages/route.ts` — GET handler: authenticate, verify conversation ownership, call getMessages(conversationId), return JSON with messages array
- [x] T017 [P] [US3] Create `src/app/api/ai/conversations/[conversationId]/route.ts` — DELETE handler: authenticate, verify ownership, call deleteConversation, return {deleted: true}. PATCH handler: validate title in body, call updateConversationTitle, return updated conversation
- [x] T018 [US3] Modify `src/app/api/ai/ask/route.ts` — accept optional conversationId in request body; if absent create new conversation with title from first ~50 chars of question; if present verify ownership and load last 20 messages via getRecentMessages as server-side history (ignore client conversationHistory); persist user message via addMessage before AI call; emit SSE event {type:'conversation', conversationId, messageId} before streaming; after streaming done, persist assistant message with content, sources_json, model; update conversation updated_at
- [x] T019 [US3] Create `src/components/ai/conversation-list.tsx` — props: {courseId, onSelect(id), onNew(), onDelete(id)}, fetch conversations from GET /api/ai/conversations?courseId=X, render list items with truncated title + relative timestamp + delete button (with confirm), "New conversation" button at top, loading state, empty state message
- [x] T020 [US3] Refactor `src/components/ai/ai-chat-panel.tsx` — add state: currentConversationId, view ('chat'|'list'); on panel open: fetch conversations for courseId, if exist load most recent (set currentConversationId, fetch messages), if none defer conversation creation to first message send; add history toggle button in header (List icon from lucide-react) toggling view; render ConversationList when view='list'; on conversation select: fetch messages and switch to chat view; on delete: call API and remove from local state; on "New": clear currentConversationId and messages, switch to chat view
- [x] T021 [US3] Modify handleSend in `src/components/ai/ai-chat-panel.tsx` — include conversationId in POST body to /api/ai/ask; parse new SSE event {type:'conversation'} to set currentConversationId from response; remove client-side conversationHistory from request body (server loads it now); on first message without conversationId the API creates the conversation and returns it via SSE
- [x] T022 [US3] Write tests `src/components/ai/conversation-list.test.tsx` — rendering conversation items, selection callback, deletion with confirmation, empty state, new conversation button
- [x] T023 [US3] Write tests `src/components/ai/ai-chat-panel.test.tsx` — conversation loading on panel open, view toggle between chat and list, message persistence flow (mock fetch), new conversation flow, conversation switching

---

## Phase 5: US2 — Document Move Dialog (P2)

**Goal**: Build the move dialog with a unified course/folder tree and wire it to dashboard pages.

**Prerequisite**: Phase 2 complete (extended moveDocument server action).

**Independent Test**: Create a document in Course A, Week 2. Open the move dialog. Move it to Course B, Week 1. Verify it appears there. Move a course document to a standalone folder. Verify the course association is cleared.

- [x] T024 [US2] Create `src/components/dashboard/move-document-dialog.tsx` — controlled dialog (open/onOpenChange props), fetch courses with weeks and folders on open, render unified tree (Courses section with weeks as expandable children + Folders section), highlight document's current location via course_id/week_id/folder_id, selection state on click, "New folder" button with inline text input for top-level folder creation (calls createFolder action), confirm button calls moveDocument(id, destination), show material-link warning AlertDialog if material_id set and destination changes course, loading state during move, follow existing dialog patterns (Dialog from shadcn/ui)
- [x] T025 [US2] Wire onMove in `src/app/(dashboard)/dashboard/page.tsx` — add state for moveDocId/moveDoc, pass onMove callback to each DocumentCard that sets the state, render MoveDocumentDialog controlled by moveDocId, clear state on dialog close
- [x] T026 [P] [US2] Wire onMove in `src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx` — same pattern as T025: state for moveDocId/moveDoc, onMove callback to DocumentCard, render MoveDocumentDialog
- [x] T027 [P] [US2] Wire onMove in `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — same pattern as T025 but within the course page's document list: state for moveDocId/moveDoc, onMove to DocumentCard, render MoveDocumentDialog
- [x] T028 [US2] Write tests `src/components/dashboard/move-document-dialog.test.tsx` — tree rendering with courses/weeks/folders, selection highlighting, material-link warning dialog, new folder inline creation, same-destination no-op, cancel closes without moving

---

## Phase 6: US4 — Conversation Title and Identification (P3)

**Goal**: Add editable conversation titles to the conversation list and chat view header.

**Prerequisite**: Phase 4 complete (conversation list and chat panel refactored).

**Independent Test**: Start a new conversation and ask "How does recursion work in binary search trees?" Verify it appears with auto-generated title. Edit the title. Verify the edit persists.

- [x] T029 [US4] Add title editing to `src/components/ai/conversation-list.tsx` — add edit icon or double-click handler on title, show inline text input on edit, call PATCH /api/ai/conversations/[id] on blur/enter, update local state optimistically
- [x] T030 [US4] Show and edit conversation title in chat view header in `src/components/ai/ai-chat-panel.tsx` — display current conversation title (truncated) between the panel title and close button, make it editable on click (inline input), call PATCH endpoint to persist

---

## Phase 7: Polish & Cross-Cutting Concerns

**Goal**: End-to-end validation, edge case coverage, mobile responsiveness, and CI readiness.

**Prerequisite**: All previous phases complete.

- [x] T031 Write cross-feature integration tests — auto-save retry + reconnection (simulate disconnect/reconnect), document move + conversations (move doc to different course, verify AI panel shows correct course conversations), conversation persistence + rate limiting (verify quota still enforced when continuing a conversation)
- [x] T032 Test edge cases — move material-linked document (warning dialog, material_id cleared), move to same location (no-op), delete course (verify conversations cascade-deleted), very long conversation (verify 20-message window in AI prompt), concurrent tabs with same conversation (last write wins)
- [x] T033 Verify mobile responsiveness — conversation list in full-screen AI panel, move dialog tree on small screens, Save button and error indicator in compact header
- [x] T034 Run full CI validation — `pnpm lint` (no errors), `pnpm format:check` (all formatted), `pnpm test` (all unit tests pass), `pnpm test:integration` (all integration tests pass with Supabase), `pnpm build` (production build succeeds)

---

## Dependencies

```
Phase 1 (Setup: T001-T004)
  │
  ├──→ Phase 2 (Foundational: T005-T008)
  │      │
  │      ├──→ Phase 4 (US3 Conversations: T015-T023)
  │      │      │
  │      │      └──→ Phase 6 (US4 Titles: T029-T030)
  │      │
  │      └──→ Phase 5 (US2 Move Dialog: T024-T028)
  │
  └──→ Phase 3 (US1 Auto-Save: T009-T014) ← independent, parallelizable

All ──→ Phase 7 (Polish: T031-T034)
```

### User Story Completion Order

| Priority | Story                          | Phase   | Can Start After | Independent?                  |
| -------- | ------------------------------ | ------- | --------------- | ----------------------------- |
| P1       | US1 — Auto-Save Retry          | Phase 3 | Phase 1         | Yes — fully independent       |
| P1       | US3 — Conversation Persistence | Phase 4 | Phase 2         | Yes — independent of US1, US2 |
| P2       | US2 — Document Move            | Phase 5 | Phase 2         | Yes — independent of US1, US3 |
| P3       | US4 — Conversation Titles      | Phase 6 | Phase 4         | Depends on US3                |

---

## Parallel Execution Opportunities

### After Phase 1 completes:

```
┌──────────────────────┐    ┌──────────────────────┐
│ Phase 2 (Foundation) │    │ Phase 3 (US1: Save)  │
│ T005-T008            │    │ T009-T014            │
│ ~server actions~     │    │ ~hooks + UI~         │
└──────────┬───────────┘    └──────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼──────┐  ┌──▼───────┐
│ Phase 4  │  │ Phase 5  │
│ US3:Chat │  │ US2:Move │
│ T015-T023│  │ T024-T028│
└──────────┘  └──────────┘
```

### Within Phase 2:

- T005 (conversations.ts) and T006 (moveDocument extension) can be done in parallel — different files
- T007 and T008 (integration tests) can be done in parallel — different files

### Within Phase 4:

- T015, T016, T017 can be done in parallel — different API route files

### Within Phase 5:

- T026 and T027 can be done in parallel — different dashboard page files

---

## Implementation Strategy

### MVP Scope (recommended first delivery)

**Phase 1 + Phase 2 + Phase 3 (US1)**: Auto-save retry with manual save button. This is self-contained, has no DB migration (migration is in Phase 1 but US1 doesn't use it), and directly addresses the data-loss risk from Issue #47.

### Full Delivery Order

1. Phase 1 → Phase 2 (foundation for US2 + US3)
2. Phase 3 (US1 — auto-save, can overlap with Phase 2)
3. Phase 4 (US3 — conversation persistence, the biggest phase)
4. Phase 5 (US2 — document move, can overlap with Phase 4)
5. Phase 6 (US4 — conversation titles, quick polish)
6. Phase 7 (integration testing and CI)

### Task Summary

- **Total tasks**: 34
- **US1 (Auto-Save Retry)**: 6 tasks (T009-T014)
- **US2 (Document Move)**: 5 tasks (T024-T028)
- **US3 (Conversation Persistence)**: 9 tasks (T015-T023)
- **US4 (Conversation Titles)**: 2 tasks (T029-T030)
- **Setup/Foundational**: 8 tasks (T001-T008)
- **Polish**: 4 tasks (T031-T034)
- **Parallelizable tasks**: 11 (marked with [P])
