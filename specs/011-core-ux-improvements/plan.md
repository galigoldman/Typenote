# Implementation Plan: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`
**Created**: 2026-03-18
**Spec**: [spec.md](./spec.md)
**Data Model**: [data-model.md](./data-model.md)
**API Contracts**: [contracts/api-contracts.md](./contracts/api-contracts.md)

---

## Technical Context

**Stack**: TypeScript 5 / Next.js 16 (App Router) / Supabase (Postgres + Auth + Realtime + Storage) / shadcn/ui / Tailwind CSS 4 / Vitest / Playwright

**Existing infrastructure leveraged**:

- `useAutoSave` hook — debounced save with status tracking (needs retry extension)
- `useDocumentSync` hook — coordinates auto-save + realtime sync
- `useRealtimeSync` hook — Supabase Postgres Changes subscription
- `moveDocument` server action — exists but only handles `folder_id` (needs extension)
- `DocumentCard` — has `onMove` prop but nobody provides it
- `AiChatPanel` — fully functional but stateless (messages in React state only)
- Sonner toast system — installed, used elsewhere, available for save notifications
- Dialog component (shadcn/ui) — installed, established patterns in codebase
- SSE streaming — already used by `/api/ai/ask` endpoint
- RLS on all tables — standard pattern for user isolation

**Key constraints**:

- DB constraint: `documents` cannot have both `folder_id` AND `course_id`
- DB constraint: `week_id` requires `course_id` to be set
- AI rate limiting is monthly, enforced atomically via Postgres RPC
- Migration numbering: latest is `00016`, next is `00017`

---

## Constitution Check

| Principle                       | Status   | Notes                                                                                                                                                |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | **PASS** | Plan follows bottom-up: DB migration → server actions → hooks → UI. Each phase produces testable increments.                                         |
| II. Test-Driven Quality         | **PASS** | Every phase includes tests. Integration tests for DB operations, unit tests for hooks/actions, component tests for UI.                               |
| III. Protected Main Branch      | **PASS** | All work on `011-core-ux-improvements` branch. PR required to merge to `main`.                                                                       |
| IV. Migrations as Code          | **PASS** | New migration `00017_ai_conversations.sql`. Seed data updated. `supabase db reset` validates full chain.                                             |
| V. Interview-Ready Architecture | **PASS** | Explanations included for key decisions: error classification, atomic operations, cascade behavior, normalized vs denormalized conversation storage. |

---

## Implementation Phases

### Phase 1: Database — AI Conversations Migration

**Goal**: Create the `ai_conversations` and `ai_messages` tables with RLS, indexes, and seed data.

**Why first**: Constitution Principle I — start with the data layer. Conversation persistence (Sub-Feature C) is the largest sub-feature and its data model is a prerequisite for all API and UI work. The other sub-features (A: auto-save, B: move dialog) have no migration needs.

#### Tasks

**1.1 Create migration `00017_ai_conversations.sql`**

- `ai_conversations` table: id, user_id, course_id, title, created_at, updated_at
- `ai_messages` table: id, conversation_id, role, content, sources_json, model, created_at
- Foreign keys with CASCADE deletes
- RLS policies (user owns conversations; messages accessible via conversation ownership)
- Indexes: `(user_id, course_id, updated_at DESC)` on conversations, `(conversation_id, created_at)` on messages
- Trigger: `handle_updated_at()` on `ai_conversations`

**1.2 Update seed data**

- Add 2-3 test conversations with messages to `supabase/seed.sql`
- Link to existing seeded courses (CS101, Linear Algebra)

**1.3 Add TypeScript types**

- Add `AiConversation` and `AiMessage` interfaces to `src/types/database.ts`

**1.4 Validate migration**

- Run `supabase db reset` — verify full migration chain replays cleanly
- Write integration test: insert conversation + messages, verify RLS, verify cascade delete on course deletion

**Interview talking point**: _Why normalized tables (conversations + messages) instead of a JSONB array of messages in a single conversations table? Answer: Normalized design allows efficient pagination, individual message queries, and future search indexing. JSONB arrays grow unbounded, can't be indexed for text search, and require full-document reads for any access._

---

### Phase 2: Server Actions — Conversation CRUD & Extended Document Move

**Goal**: Build the server-side operations that the UI will consume.

#### Tasks

**2.1 Create `src/lib/actions/conversations.ts`**

- `createConversation(courseId, title)` — insert new conversation
- `getConversations(courseId)` — list conversations sorted by `updated_at DESC`
- `getMessages(conversationId)` — load all messages sorted by `created_at ASC`
- `getRecentMessages(conversationId, limit=20)` — for AI prompt context
- `addMessage(conversationId, { role, content, sources_json?, model? })` — insert message, bump conversation `updated_at`
- `updateConversationTitle(conversationId, title)` — rename
- `deleteConversation(conversationId)` — cascade deletes messages
- All functions: authenticate via `createClient()`, scope to `user_id`

**2.2 Extend `moveDocument` in `src/lib/actions/documents.ts`**

- Change signature to accept `MoveDestination` type
- Handle three cases: folder, course (+ optional week), root
- Clear `material_id` when moving to a different course or to a folder (if `material_id` was set)
- Revalidate affected paths
- Write unit test for each destination type
- Write integration test verifying DB constraint enforcement

**2.3 Write tests**

- `conversations.test.ts` — unit tests for action logic
- `conversations.integration.test.ts` — DB round-trip: create, list, add messages, delete, verify cascade
- `documents.test.ts` — extended move: folder→course, course→folder, week→week, material-linked move

**Interview talking point**: _Why a `MoveDestination` discriminated union instead of optional parameters? Answer: Type safety — the compiler enforces that when `type: 'folder'`, only `folderId` is present. This prevents bugs like accidentally passing both `folderId` and `courseId`, which would violate the DB constraint._

---

### Phase 3: API Routes — Conversation Endpoints & AI Ask Integration

**Goal**: Create REST endpoints for conversation management and integrate persistence into the existing AI streaming endpoint.

#### Tasks

**3.1 Create conversation API routes**

- `GET /api/ai/conversations?courseId=X` — list conversations
- `GET /api/ai/conversations/[conversationId]/messages` — load messages
- `DELETE /api/ai/conversations/[conversationId]` — delete conversation
- `PATCH /api/ai/conversations/[conversationId]` — update title
- All routes: authenticate, verify ownership

**3.2 Modify `POST /api/ai/ask`**

- Accept optional `conversationId` in request body
- If no `conversationId`: create new conversation, set title from first ~50 chars of question
- Persist user message before calling AI
- Send `{ type: 'conversation', conversationId, messageId }` SSE event early
- After streaming completes: persist assistant message with sources + model
- If `conversationId` provided: load last 20 messages as history (server-side, ignore client `conversationHistory`)
- Update conversation `updated_at` after each message

**3.3 Write tests**

- Route handler tests for each endpoint
- AI ask integration test: verify messages are persisted after streaming
- Test conversation creation flow (no conversationId → new conversation returned)
- Test continuation flow (with conversationId → messages appended)

**Interview talking point**: _Why load conversation history server-side instead of trusting client-sent history? Answer: Security — the client could send fabricated history to manipulate AI responses. Server-side loading from the database is the source of truth. It also simplifies the client since it doesn't need to manage history serialization._

---

### Phase 4: Auto-Save Retry Hook

**Goal**: Add retry logic, error classification, and reconnection detection to the auto-save system.

**Why here (not earlier)**: This is a self-contained hook change with no database migration. Doing it after the DB work avoids merge conflicts with the AI conversation work, which also touches the save/sync layer.

#### Tasks

**4.1 Extend `useAutoSave` hook**

- Add new states: `'retrying'` and `'error'`
- Implement exponential backoff: 1s → 2s → 4s (3 retries max)
- Classify errors:
  - Network: `TypeError` (fetch failure), HTTP 500/502/503/504 → retry
  - Auth: HTTP 401/403 → no retry, set `errorType: 'auth'`
  - Permanent: other HTTP errors → no retry, set `errorType: 'permanent'`
- Track: `retryCount`, `errorDetails`, `errorType`
- Expose `retryNow()` for manual retry
- Reset retry state on successful save or new `trigger()` call

**4.2 Add reconnection-triggered retry to `useDocumentSync`**

- Watch `connectionStatus` transitions: `disconnected` → `connected`
- Listen to `window.addEventListener('online', ...)`
- On either event: if status is `'error'` or `'retrying'`, call `retryNow()`
- Deduplicate: use a flag to prevent double-retry if both events fire

**4.3 Add `beforeunload` confirmation**

- Existing `beforeunload` handler calls `flush()`. Extend it to also set `event.returnValue` when status is `'unsaved'`, `'retrying'`, or `'error'`.

**4.4 Add `manualSave` to `useDocumentSync`**

- Wraps `flushSave()` — exposed for the Save button
- Returns the same promise for button loading state

**4.5 Write tests**

- `use-auto-save.test.ts`: test retry with mock timers, error classification, state transitions, reconnection retry
- Test that auth errors don't trigger retry
- Test that retryCount resets after success

**Interview talking point**: _Exponential backoff is a standard distributed systems pattern. Why not linear backoff? Answer: Exponential backoff reduces server load during outages by spacing retries further apart. If 1000 users hit a network issue simultaneously, linear retry would hammer the server at a fixed rate, while exponential backoff naturally distributes the retry load._

---

### Phase 5: UI — Save Button & Error Indicator

**Goal**: Add the manual Save button and enhanced error indicator to the editor header.

#### Tasks

**5.1 Update `SaveIndicator` in `canvas-editor.tsx`**

- Add `'retrying'` and `'error'` to the label/color map
  - retrying: amber, "Retrying..."
  - error: red, "Error"
- When status is `'error'`: wrap in a `Tooltip` (or small `Popover`) showing error details
  - Network: "Save failed — check your connection. Last attempt Xs ago. [Retry]"
  - Auth: "Session expired — please sign in again"
  - Permanent: "Save failed — [error detail]"
- Make the `[Retry]` text clickable, calling `retryNow()`

**5.2 Add Save button to editor header**

- Small ghost button with `Save` icon (from lucide-react), left of `SaveIndicator`
- Calls `manualSave()` on click
- Disabled when status is `'saved'` or `'saving'`
- Tooltip: "Save now" (Ctrl+S)
- Add `Ctrl+S` / `Cmd+S` keyboard shortcut via `useEffect` with `keydown` listener

**5.3 Write component tests**

- `SaveIndicator` renders correct labels/colors for all 5 states
- Error tooltip appears on click/hover when in error state
- Save button disabled states
- Keyboard shortcut triggers save

---

### Phase 6: UI — Document Move Dialog

**Goal**: Build the move dialog with course/folder tree and wire it up.

#### Tasks

**6.1 Create `MoveDocumentDialog` component**

- Props: `{ documentId, document, open, onOpenChange }`
- Fetches courses (with weeks) and folders on open
- Renders a tree:
  ```
  📁 Folders
  ├── Calculus I
  ├── Linear Algebra
  📚 Courses
  ├── CS101
  │   ├── Week 1 — Variables
  │   ├── Week 2 — Control Flow
  │   └── Week 3 — Functions
  └── Linear Algebra
      ├── Week 1 — Vectors
      └── Week 2 — Matrices
  ```
- Current location highlighted (based on document's `course_id`/`week_id`/`folder_id`)
- Selection state: clicking a node selects it as destination
- "New folder" button: inline text input to create a top-level folder
- Confirm button: calls `moveDocument(id, destination)`
- If `material_id` is set and destination changes the course: show warning dialog first
- Loading state during move operation
- Follow existing dialog patterns (controlled via `open`/`onOpenChange`)

**6.2 Wire up `DocumentCard` and dashboard pages**

- In dashboard pages (`page.tsx`, `folders/[folderId]/page.tsx`, `courses/[courseId]/page.tsx`):
  - Add state: `moveDocId` and `moveDoc` to track which document is being moved
  - Pass `onMove={(id) => { setMoveDocId(id); setMoveDoc(doc) }}` to `DocumentCard`
  - Render `<MoveDocumentDialog>` controlled by `moveDocId` state

**6.3 Write tests**

- `move-document-dialog.test.tsx`: tree rendering, selection, material warning, new folder inline
- Integration test: move document between course and folder, verify DB state

**Interview talking point**: _The tree uses a discriminated union for destinations. In the dialog, each tree node carries metadata about what type it is (folder vs course vs week). This maps directly to the `MoveDestination` type on the server, so the client doesn't need to construct the update manually — it just sends the selected node's destination._

---

### Phase 7: UI — AI Conversation Persistence & List

**Goal**: Refactor the AI chat panel to load/save conversations and add the conversation list toggle.

This is the largest phase. It modifies the existing `AiChatPanel` substantially.

#### Tasks

**7.1 Create `ConversationList` component**

- Props: `{ courseId, onSelect(conversationId), onNew(), onDelete(conversationId) }`
- Fetches conversations via `GET /api/ai/conversations?courseId=X`
- Renders list items: title (truncated), relative timestamp ("2 hours ago"), delete button
- Delete confirmation via inline prompt or simple confirm
- "New conversation" button at top
- Empty state for courses with no conversations (shouldn't normally happen since panel auto-creates)

**7.2 Refactor `AiChatPanel` state management**

- Add state: `currentConversationId`, `view: 'chat' | 'list'`
- On panel open:
  1. Fetch conversations for `courseId`
  2. If conversations exist: load most recent one (set `currentConversationId`, fetch messages)
  3. If no conversations: create a new one via API (or defer until first message)
- On "New conversation": set `currentConversationId = null`, clear messages, switch to chat view
- On conversation select from list: fetch messages, set `currentConversationId`, switch to chat view
- On delete from list: call delete API, remove from local state

**7.3 Modify `handleSend` in `AiChatPanel`**

- Include `conversationId` in the POST body to `/api/ai/ask`
- On first message (no `conversationId`): the API creates a conversation and returns `conversationId` via SSE event
- Parse the new `{ type: 'conversation', conversationId, messageId }` SSE event
- Set `currentConversationId` from the response
- Remove client-side `conversationHistory` from request body (server loads it now)

**7.4 Add conversation list toggle to panel header**

- History icon button (e.g., `MessageSquare` or `List` from lucide-react)
- Toggles `view` between `'chat'` and `'list'`
- Active state styling when list is shown

**7.5 Add conversation title editing**

- In conversation list: double-click or edit icon on title
- Calls `PATCH /api/ai/conversations/[id]`
- In chat view header: show conversation title (truncated), editable on click

**7.6 Write tests**

- `conversation-list.test.tsx`: rendering, selection, deletion, empty state
- `ai-chat-panel.test.tsx`: conversation loading on open, message persistence, view toggle, new conversation flow
- Integration: end-to-end flow — open panel, send message, close, reopen, verify restoration

**Interview talking point**: _Why toggle between views instead of a sidebar? Answer: The AI panel is 420px on desktop. A sidebar within it would leave ~200px for content — too narrow for readable chat. A full-view toggle gives 100% of the panel width to whichever view is active. On mobile (full-screen panel), this is even more important._

---

### Phase 8: Integration Testing & Polish

**Goal**: End-to-end validation, edge case testing, and final polish.

#### Tasks

**8.1 Cross-feature integration tests**

- Auto-save retry + reconnection: simulate disconnect, verify retry on reconnect
- Document move + AI panel: move document to different course, verify AI panel still shows correct course conversations
- Conversation persistence + rate limiting: verify rate limit still enforced when continuing a conversation

**8.2 Edge case testing**

- Move material-linked document: verify warning dialog, verify `material_id` cleared
- Move to same location: verify no-op
- Delete course: verify conversations cascade-deleted
- Concurrent tabs: send messages from two tabs, verify no duplicate messages
- Very long conversation: verify 20-message window in AI prompt

**8.3 Polish**

- Verify all states have appropriate loading indicators
- Verify keyboard navigation in move dialog tree
- Verify mobile responsiveness of conversation list and move dialog
- Run full linting pass: `pnpm lint` and `pnpm format:check`

**8.4 Final CI validation**

- `pnpm test` — all unit tests pass
- `pnpm test:integration` — all integration tests pass (with Supabase)
- `pnpm build` — production build succeeds
- `pnpm lint` — no lint errors

---

## Phase Dependency Graph

```
Phase 1 (DB Migration)
  │
  ├──→ Phase 2 (Server Actions)
  │      │
  │      └──→ Phase 3 (API Routes)
  │             │
  │             └──→ Phase 7 (AI Chat UI)
  │                    │
  │                    └──→ Phase 8 (Integration & Polish)
  │
  ├──→ Phase 4 (Auto-Save Hook) ──→ Phase 5 (Save UI)
  │                                    │
  │                                    └──→ Phase 8
  │
  └──→ Phase 6 (Move Dialog) ──→ Phase 8
```

**Parallelizable**: Phases 4-5 (auto-save) and Phase 6 (move dialog) are independent of Phases 2-3-7 (conversation persistence) after Phase 1 completes. They can be worked on in parallel or in any order.

---

## Risk Assessment

| Risk                                                                      | Likelihood | Impact                          | Mitigation                                                                          |
| ------------------------------------------------------------------------- | ---------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| SSE event ordering: `conversation` event arrives after first `text` chunk | Medium     | Client misses conversationId    | Buffer text chunks until `conversation` event arrives, then flush                   |
| Concurrent saves from auto-save retry and manual save button              | Medium     | Duplicate saves, race condition | Use a mutex flag — if a save is in flight, queue the next one                       |
| Move dialog tree is slow to render with many courses/weeks                | Low        | Slow dialog open                | Lazy-load weeks on course expansion                                                 |
| Conversation list grows very large (100+)                                 | Low        | Slow load, poor UX              | Paginate or virtual scroll if needed (defer to v2)                                  |
| RLS policy on `ai_messages` uses subquery (slower than direct check)      | Low        | Slower message queries          | The subquery hits a small table (`ai_conversations`) with a PK lookup — fast enough |
