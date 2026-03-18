# Feature Specification: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`
**Created**: 2026-03-18
**Status**: Draft (clarified)
**Input**: GitHub Issues #47, #51, #52 — bundled as a batch of three user-facing improvements: auto-save retry with manual save button, document move dialog, and AI conversation persistence per course.

---

## Sub-Feature A: Auto-Save Retry with Manual Save and Error Visibility

### Context

When a network failure occurs during auto-save, the system currently fails silently. The user sees an "Unsaved" status indicator but receives no notification, no retry, and no recovery — creating a real risk of data loss. Additionally, users have no way to manually trigger a save, and no way to inspect error details when something goes wrong.

---

## Sub-Feature B: Document Move Dialog

### Context

The document card has a "Move" button wired up but no dialog behind it. Users cannot reorganize their documents between folders or courses, limiting the usefulness of the course/folder hierarchy. The data model enforces that a document belongs to either a folder or a course (never both), so moving between these categories requires transparent handling of this constraint.

---

## Sub-Feature C: AI Conversation Persistence per Course

### Context

AI chat history lives only in React state. Closing the panel or navigating away permanently destroys the conversation. Students need to reference prior AI answers when studying. Conversations are scoped to **courses** (not individual documents) because students think about AI help at the course level — they may ask questions spanning multiple documents, weeks, and topics within a single conversation thread.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Manual Save Button and Auto-Save Retry (Priority: P1)

A student is editing a document and wants to explicitly save their work before stepping away. They click the "Save" button in the editor header and get immediate visual confirmation that the save succeeded. Separately, if the network drops and auto-save fails, the system retries automatically. If retries fail, the status indicator changes to an error state. The student can click the error indicator to see details ("Network error — retrying in 4s"). When the network returns, pending changes are saved automatically.

**Why this priority**: Data loss is the single most destructive UX failure. A manual save button gives students confidence and control. Silent save failures erode trust — visible-on-demand errors strike the right balance between clean UI and transparency.

**Independent Test**:

1. Edit a document, click "Save" manually, verify the save completes and indicator shows "Saved."
2. Simulate a network interruption. Verify auto-save retries 3 times. After retries fail, verify the indicator changes to an error state. Click the indicator and verify error details are shown. Restore the network and verify pending changes are saved.

**Acceptance Scenarios**:

1. **Given** a user is editing a document, **When** they click the "Save" button, **Then** the document is saved immediately and the status indicator confirms success.
2. **Given** a save fails due to a network error, **When** the first failure occurs, **Then** the system retries automatically after a short delay.
3. **Given** the save continues to fail, **When** 3 retries have been exhausted, **Then** the status indicator changes to a warning/error state. The error is silent by default (no intrusive toast), but clicking the indicator reveals error details.
4. **Given** retries are exhausted and the user's edits are still unsaved, **When** the network connection is restored, **Then** the system automatically retries the pending save without user intervention. On success, the indicator returns to "Saved."
5. **Given** a transient failure that resolves on the second retry, **When** the retry succeeds, **Then** the status returns to "Saved" normally and no error is surfaced.
6. **Given** multiple saves fail while the user continues editing, **When** the connection is restored, **Then** only the latest document state is saved (not every intermediate version).
7. **Given** a save fails due to an authentication error (session expired), **When** the system detects the auth failure, **Then** it does not retry and instead shows a message prompting the user to sign in again.
8. **Given** a user attempts to navigate away while changes are unsaved and retries are in progress, **When** the browser is about to unload, **Then** a browser confirmation dialog warns about unsaved changes.

---

### User Story 2 — Moving a Document to a Different Location (Priority: P2)

A student realizes a document is in the wrong course or folder. They click the "Move" button on the document card's dropdown menu. A dialog opens showing a unified tree of all available courses (with their weeks) and standalone folders, with the document's current location highlighted. The student selects a new destination — which could be a different course, a specific week within a course, or a standalone folder — confirms, and the document immediately appears in its new location. If needed, the student can create a new top-level folder from within the dialog.

**Why this priority**: Organization is important for a note-taking app but is not a data-integrity issue. This is a quality-of-life improvement that removes a gap in existing UI.

**Independent Test**: Create a document in Course A, Week 2. Open the move dialog. Move it to Course B, Week 1. Verify it appears there. Move a course document to a standalone folder. Verify the course association is cleared. Move a folder document into a course. Verify the folder association is cleared.

**Acceptance Scenarios**:

1. **Given** a user clicks the "Move" button on a document card, **When** the dialog opens, **Then** it shows a unified browsable tree of all courses (with weeks as children) and all standalone folders.
2. **Given** the move dialog is open, **When** the user views the tree, **Then** the document's current location is visually highlighted or indicated.
3. **Given** the user selects a course or week as the destination, **When** the move completes, **Then** the document's course/week association is updated and any previous folder association is cleared.
4. **Given** the user selects a standalone folder as the destination, **When** the move completes, **Then** the document's folder association is updated and any previous course/week association is cleared.
5. **Given** the user wants to move a document to a folder that doesn't exist yet, **When** they click "New folder" within the dialog, **Then** they can create a top-level folder inline and select it as the destination.
6. **Given** a user moves a document between weeks within the same course (e.g., Week 2 → Week 5), **When** the move completes, **Then** only the week association changes; the course remains the same.
7. **Given** a document is linked to a course material (e.g., a homework assignment), **When** the user attempts to move it to a different course, **Then** the dialog warns that the material link will be removed, and the user must confirm before proceeding.
8. **Given** the source and destination are the same, **When** the user confirms, **Then** the system treats it as a no-op with no error.
9. **Given** a move is in progress, **When** the server operation completes, **Then** the UI updates to reflect the new location without requiring a full page refresh.
10. **Given** the user changes their mind, **When** they close or cancel the dialog, **Then** no move occurs and the document remains in its original location.

---

### User Story 3 — Persistent AI Conversations per Course (Priority: P1)

A student opens the AI chat panel while studying for their Data Structures course. The panel automatically loads their most recent conversation. They continue asking questions about binary trees. Later, they close the browser, come back, and re-open the AI panel for that course. Their conversation is still there — they can scroll back and see the AI's earlier explanations. They can also start a "New conversation" to discuss a different topic (linked lists) without losing the binary tree thread. By toggling to the conversation list view, they see all past conversations for this course with timestamps and auto-generated titles. They can switch between conversations or delete ones they no longer need.

**Why this priority**: Chat persistence is the core ask of ticket #52 and is a fundamental usability gap. Students use AI help across multiple study sessions and need to reference past answers. Scoping to course (not document) reflects how students naturally study.

**Independent Test**: Open AI chat for a course. Ask a question. Close the panel. Reopen the panel for the same course. Verify the conversation is restored. Start a new conversation. Verify the previous one is still accessible from the conversation list. Delete an old conversation. Verify it's gone.

**Acceptance Scenarios**:

1. **Given** a student opens the AI panel for a course with existing conversations, **When** the panel opens, **Then** the most recent conversation is automatically loaded with full message history.
2. **Given** a student opens the AI panel for a course with no existing conversations, **When** the panel opens, **Then** a new empty conversation is started automatically (no empty-state friction).
3. **Given** a student is viewing a conversation, **When** they click "New conversation," **Then** a fresh empty chat thread opens, and the previous conversation is preserved and accessible.
4. **Given** a student wants to see all conversations for a course, **When** they toggle to the conversation list view within the panel, **Then** they see all past conversations with timestamps and auto-generated titles.
5. **Given** a student selects a previous conversation from the list, **When** the conversation loads, **Then** all messages (both student questions and AI responses) are displayed in order with their source citations.
6. **Given** a student asks a question in a conversation, **When** the AI response finishes streaming, **Then** both the user message and AI response are persisted — if the browser crashes mid-stream, the last complete message is preserved.
7. **Given** a student opens the AI panel for Course A, **When** they switch to Course B's AI panel, **Then** they see Course B's conversations (not Course A's).
8. **Given** a student opens the AI panel from a specific document within a course, **When** the panel opens, **Then** it shows the course-level conversations (the document provides context for new questions but does not filter conversations).
9. **Given** a student wants to remove an old conversation, **When** they delete it from the conversation list, **Then** it is permanently removed and no longer appears in the list.
10. **Given** a conversation has accumulated many messages, **When** the student sends a new question, **Then** only the most recent 20 messages are sent as conversation context to the AI (older messages are preserved in the UI but not included in the AI prompt).

---

### User Story 4 — Conversation Title and Identification (Priority: P3)

Each conversation has a title so the student can distinguish between them in the list. The title is automatically generated from the first ~50 characters of the first user message. The student can optionally edit the title.

**Why this priority**: Nice-to-have for v1. Without titles, conversations would be listed by timestamp only, which is usable but not ideal. Auto-generated titles from the first message add sufficient identification without extra API costs.

**Independent Test**: Start a new conversation and ask "How does recursion work in binary search trees?" Verify the conversation appears in the list with a title like "How does recursion work in binary se..." Edit the title to "Recursion in BSTs." Verify the edit persists.

**Acceptance Scenarios**:

1. **Given** a student starts a new conversation and sends a message, **When** the conversation appears in the list, **Then** it has an auto-generated title derived from the first ~50 characters of the first message.
2. **Given** a student wants to rename a conversation, **When** they edit the title, **Then** the change persists across sessions.

---

### Edge Cases

- **Auto-save**: What happens if the user closes the browser while retries are in progress? A `beforeunload` handler attempts one final flush. If it fails, the data may be lost — this is an accepted limitation of not having offline support.
- **Auto-save**: What if multiple documents have pending saves? Each document's retry is independent.
- **Auto-save**: What if a save fails with a 401 (auth expired)? No retry — prompt the user to sign in again.
- **Auto-save**: What if a save fails with a 413 (payload too large) or 400 (validation error)? No retry — these are not transient. Show the error details via the clickable indicator.
- **Document move**: What if the source and destination are the same? The operation is a no-op with no error.
- **Document move**: What if the destination course/folder is deleted while the dialog is open? The move fails gracefully with a message like "Destination no longer exists."
- **Document move**: What if a material-linked document is moved to a different course? Warn the user that the material link will be removed, then proceed if confirmed.
- **Chat persistence**: What if a conversation's course is deleted? Conversations are deleted along with the course (cascade delete). There is no course soft-delete mechanism.
- **Chat persistence**: What happens during concurrent access (e.g., two tabs)? Last write wins — no real-time sync between tabs. If both tabs are sending messages to the same conversation, the persisted state reflects the latest write.
- **Chat persistence**: What if the save-to-database call fails after a message streams? The message remains in client-side state. The user can continue the conversation; a retry is attempted on the next successful save cycle.
- **Chat persistence**: What is the maximum conversation history retained? No hard limit for v1. Conversations older than approximately 6 months may be candidates for archival in future iterations.
- **Chat persistence**: What if a document is moved to a different course after AI conversations referenced it? Conversations stay with the original course — no migration. The AI's past answers may reference content that is no longer in the course.

## Requirements _(mandatory)_

### Functional Requirements

**Auto-Save Retry and Manual Save (Sub-Feature A)**

- **FR-A01**: The editor MUST provide a manual "Save" button that triggers an immediate save of the current document state.
- **FR-A02**: On a save failure due to a network or transient server error, the system MUST automatically retry up to 3 times with exponential backoff (approximately 1 second, 2 seconds, 4 seconds).
- **FR-A03**: On a save failure due to an authentication error (e.g., expired session), the system MUST NOT retry and MUST prompt the user to sign in again.
- **FR-A04**: On a save failure due to a non-transient error (e.g., validation, payload too large), the system MUST NOT retry.
- **FR-A05**: The save-status indicator MUST change to a visually distinct warning/error state when saves have failed. The error is silent by default — no intrusive toast or popup appears automatically.
- **FR-A06**: The error indicator MUST be clickable/expandable to reveal error details (e.g., "Network error — last attempt 12s ago" or "Session expired — please sign in again").
- **FR-A07**: When network connectivity is restored (detected via connection status or browser online event), the system MUST automatically retry any pending unsaved changes.
- **FR-A08**: If the user continues editing during retry, only the latest document state needs to be saved — intermediate states may be discarded.
- **FR-A09**: The auto-save retry MUST be independent per document — one document's failure does not block another's save.
- **FR-A10**: When the user attempts to navigate away with unsaved changes, the browser MUST show a confirmation dialog warning about potential data loss.
- **FR-A11**: The save-status indicator MUST reflect distinct states: "Saved," "Saving," "Unsaved," "Retrying," and "Error."

**Document Move Dialog (Sub-Feature B)**

- **FR-B01**: The system MUST provide a move dialog accessible from the document card's dropdown "Move" button on the dashboard.
- **FR-B02**: The move dialog MUST display a unified browsable tree showing all courses (with weeks as children) and all standalone folders.
- **FR-B03**: The document's current location MUST be visually indicated within the tree.
- **FR-B04**: The user MUST be able to select a new destination and confirm the move.
- **FR-B05**: After a successful move, the document MUST appear in the new location and be removed from the old one. Document content, title, and other metadata MUST be unchanged.
- **FR-B06**: Moving a document to a course or week MUST clear any existing folder association. Moving to a folder MUST clear any existing course/week association. The system handles this constraint transparently — the user does not need to know about it.
- **FR-B07**: Moving a document between weeks within the same course MUST be supported (change week only, preserve course).
- **FR-B08**: The move dialog MUST support inline creation of a new top-level folder (not nested sub-folders).
- **FR-B09**: If the source and destination are the same, the system MUST treat it as a no-op.
- **FR-B10**: If a document is linked to a course material and is moved to a different course or to a folder, the system MUST warn the user that the material link will be removed, and require confirmation before proceeding.
- **FR-B11**: The UI MUST update to reflect the move without requiring a full page refresh.

**AI Conversation Persistence (Sub-Feature C)**

- **FR-C01**: AI conversations MUST be scoped to courses, not individual documents.
- **FR-C02**: Each course MUST support multiple independent conversations.
- **FR-C03**: Conversations MUST persist across browser sessions — closing the panel or navigating away does not lose history.
- **FR-C04**: When the AI panel is opened for a course, the system MUST automatically load the most recent conversation for that course. If no conversations exist, a new empty conversation MUST be started.
- **FR-C05**: A "New conversation" button MUST allow the user to start a fresh chat thread without losing prior conversations.
- **FR-C06**: The AI panel MUST support toggling between a chat view and a conversation list view. The list shows all past conversations for the current course, each with a timestamp and title.
- **FR-C07**: The user MUST be able to switch between conversations by selecting from the list.
- **FR-C08**: The user MUST be able to delete individual conversations from the list. Deletion is permanent.
- **FR-C09**: Messages MUST be saved after the AI response finishes streaming. If streaming is interrupted, the last fully received message MUST be preserved.
- **FR-C10**: Each message record MUST capture: the message role (user or AI), the message content, source citations (if any), the AI model used (for AI messages), and a timestamp.
- **FR-C11**: When a user opens the AI panel from a specific document, the panel shows course-level conversations. The document context informs new questions but does not filter conversations.
- **FR-C12**: Conversations for different courses MUST be isolated — switching courses shows only that course's conversations.
- **FR-C13**: Each conversation MUST have a title — auto-generated from the first ~50 characters of the first user message, and optionally editable by the user.
- **FR-C14**: When sending a new question to the AI, only the most recent 20 messages from the conversation MUST be included as conversation history in the AI prompt. All messages remain visible in the UI.

### Key Entities

- **Save Retry State**: Tracks pending unsaved document changes with retry count and backoff state. Key attributes: document reference, latest content state, retry attempts, last attempt timestamp, error type (network/auth/validation), status (retrying/failed/pending-reconnect).
- **Course Conversation**: A chat thread scoped to a course. Key attributes: course reference, user identity, title, creation timestamp, last activity timestamp.
- **Conversation Message**: An individual message within a conversation. Key attributes: conversation reference, role (user/AI), content, source citations, AI model identifier, timestamp.

## Scope Boundaries

**In scope**:

- Manual "Save" button for explicit saves
- Auto-save retry logic with exponential backoff (3 retries, network/transient errors only)
- Silent error indicator with click-to-expand details
- Auth-error detection with re-sign-in prompt (no retry)
- Browser unload confirmation when unsaved changes exist
- Auto-retry on network reconnection
- Document move dialog with unified course/folder tree
- Move between courses, between weeks, and between courses/folders
- Material-link warning when moving linked documents
- Inline top-level folder creation within move dialog
- AI conversation persistence scoped to courses
- Multiple conversations per course with automatic most-recent loading
- Toggle between chat view and conversation list view within the panel
- Individual conversation deletion
- Conversation titles auto-generated from first message (~50 chars)
- Source/citation persistence per AI message
- Conversation history windowed to last 20 messages for AI prompts
- Message persistence after streaming completes

**Out of scope (future phases)**:

- Offline mode or full offline-first architecture (auto-save retry is online-only reconnection)
- Move dialog accessible from within the document editor (dashboard only for v1)
- Drag-and-drop document reordering within the move dialog
- Bulk move (moving multiple documents at once)
- Move undo/history
- Nested sub-folder creation in move dialog (top-level only)
- AI conversation search (searching across conversation content)
- AI conversation export (downloading chat history)
- AI conversation sharing between users
- Conversation summarization or AI-generated recaps
- Real-time collaborative conversations (multi-user in same thread)
- Real-time sync of conversations across tabs (last write wins)
- Conversation archival (all conversations retained indefinitely for v1)
- Per-message week/document context tracking (context is ephemeral)

## Assumptions

- The existing auto-save mechanism uses a debounced approach (800ms) with a single save function. Retry wraps this existing mechanism.
- The "Move" button on document cards already exists in the UI dropdown but has no dialog behind it. A server action for moving documents also exists but only handles folder moves — it needs to be extended for course/week moves.
- The document data model enforces a mutual exclusivity constraint: a document belongs to either a folder or a course (never both). The move dialog handles this transparently.
- Courses already exist in the data model (from feature 003-course-materials). Conversations reference courses by their existing identifier.
- The AI chat panel already streams responses from the server and displays them. Persistence adds a save step after streaming, not a change to the streaming pipeline itself.
- Conversation titles are automatically generated from the first ~50 characters of the first user message. No extra AI call is needed for title generation. Manual editing is a P3 nice-to-have.
- The document a user has open when they launch the AI panel provides context for the AI's responses (as it does today), but conversations are listed and organized at the course level.
- Reconnection detection uses both the existing Supabase Realtime connection status and the browser's `navigator.onLine` / `online` event — whichever signals first triggers the retry.
- When a course is deleted, its conversations are deleted (cascade). There is no course soft-delete mechanism.
- Last-write-wins is acceptable for concurrent tab access. No real-time sync between tabs for conversations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero silent data loss — every save failure results in either a successful retry or a visible error indicator that the user can inspect. No failure goes completely unnoticed.
- **SC-002**: Users can manually save at any time via a dedicated button and receive immediate visual confirmation.
- **SC-003**: The save-status indicator accurately reflects the current state at all times — "Saved," "Saving," "Unsaved," "Retrying," or "Error" — with error details available on demand.
- **SC-004**: When network connectivity is restored after a failure, pending changes are saved within 5 seconds without user action.
- **SC-005**: Users can move any document to any valid course, week, or folder in 3 clicks or fewer (Move button → select destination → confirm).
- **SC-006**: After a document move, the document appears in its new location within 2 seconds, with all content and metadata intact. Folder/course constraints are handled transparently.
- **SC-007**: AI conversations persist across sessions — reopening the AI panel for a course restores the most recent conversation with 100% message fidelity, including source citations.
- **SC-008**: Users can access any past conversation for a course within 2 interactions (open panel → toggle to list and select).
- **SC-009**: Starting a new conversation never destroys an existing one — all prior conversations remain accessible until explicitly deleted by the user.
- **SC-010**: The AI prompt includes at most 20 recent messages as context, regardless of total conversation length.
- **SC-011**: All existing functionality (auto-save for successful saves, document listing, AI question-answering with RAG, rate limiting) continues to work without regression.
