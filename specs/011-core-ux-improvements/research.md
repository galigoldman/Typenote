# Research: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`
**Created**: 2026-03-18

---

## R1: Auto-Save Retry — Error Classification Strategy

**Decision**: Classify errors into three categories: retryable (network/transient), auth (session expired), and permanent (validation/payload).

**Rationale**: Blindly retrying all errors wastes resources and confuses users. A 401 will never succeed by retrying. A 413 (payload too large) is permanent. Only network errors and 500s are worth retrying.

**Implementation**:
- Retryable: `TypeError` (fetch network error), HTTP 500, 502, 503, 504
- Auth: HTTP 401, 403
- Permanent: HTTP 400, 413, 422, and any other status

**Alternatives considered**:
- Retry all errors (rejected — pointless for auth/validation failures)
- Only retry network errors (rejected — transient 500s are common and worth retrying)

---

## R2: Auto-Save Retry — Reconnection Detection

**Decision**: Use both Supabase Realtime `connectionStatus` and the browser `online` event. Trigger pending save retry when either signals reconnection.

**Rationale**: Supabase Realtime is already tracked in `useRealtimeSync` and is more reliable for detecting actual server reachability. The `online` event is faster to fire but less reliable (can be true while server is unreachable). Using both gives the best coverage.

**Implementation**:
- Listen to `connectionStatus` transitions from `disconnected` → `connected`
- Listen to `window.addEventListener('online', ...)`
- Either event triggers a retry of pending saves
- Deduplicate: if both fire close together, only retry once

**Alternatives considered**:
- Supabase Realtime only (rejected — slow to reconnect)
- Browser `online` only (rejected — unreliable, doesn't confirm server reachability)
- Polling / periodic retry (rejected — wasteful)

---

## R3: Auto-Save — Manual Save Button Placement

**Decision**: Place "Save" button in the editor header next to the existing `SaveIndicator` and `ConnectionIndicator`.

**Rationale**: The header already displays save status. Adding a button there is naturally discoverable. The button should be small/subtle (ghost variant, icon-only with tooltip) to not clutter the header.

**Implementation**:
- `Save` icon button (ghost variant) in the editor header, left of `SaveIndicator`
- Calls `flushSave()` from `useDocumentSync`
- Disabled while status is `'saved'` or `'saving'`

**Alternatives considered**:
- Floating action button (rejected — clutters canvas area)
- Keyboard shortcut only (rejected — not discoverable for new users)
- Both button and Ctrl+S shortcut (decided: add both — button for discoverability, shortcut for power users)

---

## R4: Auto-Save — Error Details UI

**Decision**: Make the `SaveIndicator` clickable when in error state. Clicking reveals a tooltip/popover with error details.

**Rationale**: Errors are silent by default (user's request). Clickable indicator provides on-demand details without intrusive toasts. Uses existing UI patterns (Tooltip from shadcn/ui already installed).

**Implementation**:
- When status is `'error'`, wrap `SaveIndicator` in a `Tooltip` or small `Popover`
- Show: error type, last attempt time, retry count, and a manual "Retry" link
- For auth errors: show "Session expired — sign in again" with a link/action

**Alternatives considered**:
- Toast on every failure (rejected — user explicitly wanted silent errors)
- Separate error panel (rejected — overkill for a status indicator)

---

## R5: Document Move — Folder/Course Mutual Exclusivity

**Decision**: Extend `moveDocument` server action to handle full move semantics: set `course_id`/`week_id` OR `folder_id`, clear the other, and optionally clear `material_id`.

**Rationale**: The existing `moveDocument(id, folderId)` only sets `folder_id`. The DB constraint `NOT (folder_id IS NOT NULL AND course_id IS NOT NULL)` means moving to a course requires clearing `folder_id` and vice versa. This must be a single atomic update.

**Implementation**:
- New signature: `moveDocument(id, destination)` where `destination` is `{ type: 'folder', folderId } | { type: 'course', courseId, weekId? }`
- Single UPDATE that sets the correct columns and clears the others
- If `material_id` is set and destination is a different course or a folder, clear `material_id`

**Alternatives considered**:
- Separate actions for folder-move vs course-move (rejected — unnecessary complexity)
- Client-side handling of constraint (rejected — must be atomic in DB)

---

## R6: Document Move — Tree Structure Data Fetching

**Decision**: Fetch all courses (with weeks) and top-level folders for the current user in a single query to build the tree.

**Rationale**: The move dialog needs a complete picture of available destinations. Courses have a fixed depth (Course → Week), and folders can be nested but in practice are usually shallow.

**Implementation**:
- Two parallel queries: `SELECT * FROM courses WHERE user_id = ?` and `SELECT * FROM folders WHERE user_id = ?`
- For courses, also fetch `SELECT * FROM course_weeks WHERE course_id IN (...)` to show weeks
- Build tree client-side from flat results
- Highlight current location based on document's `course_id`/`week_id`/`folder_id`

**Alternatives considered**:
- Single RPC function (rejected — adds migration complexity for a simple read operation)
- Lazy-load weeks on expand (rejected — small data set, eager loading is fine)

---

## R7: AI Conversation Persistence — Table Design

**Decision**: Two new tables: `ai_conversations` and `ai_messages`. Conversations scoped to (user_id, course_id). Messages linked to conversation with cascade delete.

**Rationale**: Normalized design follows existing patterns in the codebase. Separate messages table allows efficient pagination, selective loading, and future search. Cascade delete ensures no orphaned messages.

**Implementation**:
- `ai_conversations`: id, user_id, course_id, title, created_at, updated_at
- `ai_messages`: id, conversation_id, role, content, sources_json, model, created_at
- RLS on both tables: user can CRUD own conversations/messages
- Index on `(user_id, course_id, updated_at DESC)` for listing
- Index on `(conversation_id, created_at)` for message ordering

**Alternatives considered**:
- Single table with messages as JSONB array (rejected — hard to paginate, can't index, grows unbounded)
- Messages in local storage with server backup (rejected — not durable, no cross-device access)

---

## R8: AI Conversation — Message Persistence Timing

**Decision**: Save user messages immediately on send. Save AI messages after streaming completes (on the `done` SSE event). If streaming is interrupted, only the user message is persisted.

**Rationale**: User messages are complete at send time — no reason to delay. AI messages stream incrementally, so the full content is only known at the end. Saving user messages eagerly ensures they survive crashes. Partial AI responses are discarded (better than corrupt data).

**Implementation**:
- On `handleSend()`: insert user message into DB immediately, get message ID
- During streaming: accumulate text client-side only (no DB writes)
- On `done` event: insert complete AI message with sources and model
- On error/abort: user message persisted, AI response lost (acceptable)

**Alternatives considered**:
- Save both after response completes (rejected — user message would be lost on crash)
- Periodic save of partial AI response (rejected — complexity, partial data is rarely useful)

---

## R9: AI Conversation — History Window for AI Prompt

**Decision**: Send only the last 20 messages as `conversationHistory` in the AI request. All messages remain in the UI.

**Rationale**: Gemini models have context windows, but very long conversations degrade quality and increase latency/cost. 20 messages (~10 exchanges) provides sufficient context for continuation. The RAG pipeline already provides course material context separately.

**Implementation**:
- When building the request payload, slice `messages.slice(-20)` for `conversationHistory`
- UI always loads all messages from DB for full scrollback

**Alternatives considered**:
- No limit (rejected — unbounded cost, context window overflow)
- Token budget (rejected — complexity of token counting client-side)
- Summarize older messages (rejected — overkill for v1)

---

## R10: AI Conversation — List UI Pattern

**Decision**: Toggle between chat view and conversation list view within the existing AI panel using a tab/button toggle in the header.

**Rationale**: Keeps everything in one panel without additional overlays or sidebars. The panel already has a header with room for a toggle. The list replaces the message area when active.

**Implementation**:
- Add a "history" icon button in the AI panel header (next to close button)
- Clicking toggles between `view: 'chat' | 'list'`
- List view shows conversations sorted by `updated_at DESC`
- Each item: title (truncated), timestamp, delete button
- Clicking an item switches to chat view with that conversation loaded

**Alternatives considered**:
- Sidebar within panel (rejected — panel is already 420px, sidebar would be cramped)
- Dropdown (rejected — too small for a list of conversations)
- Separate page (rejected — breaks the in-context flow)

---

## R11: Seed Data Updates

**Decision**: Add seed data for `ai_conversations` and `ai_messages` to support development and integration testing.

**Rationale**: Constitution requires `supabase/seed.sql` to be updated when new tables are added. Seeding test conversations allows immediate testing of the list view and message loading.

**Implementation**:
- 2 conversations for CS101 course (one about variables, one about control flow)
- 3-4 messages per conversation (alternating user/assistant)
- 1 conversation for Linear Algebra course
