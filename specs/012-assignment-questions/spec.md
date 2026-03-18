# Feature Specification: Moodle Assignment Questions

**Feature Branch**: `012-assignment-questions`
**Created**: 2026-03-18
**Status**: Draft (brainstormed)
**Input**: Treat Moodle assignments as a distinct entity type — sync full assignment content, use AI to automatically split into questions, allow any student to create/edit splits (shared by default), and provide a question browser panel for copying questions into homework documents.

---

## Context

Currently, the Chrome extension detects Moodle assignments (`mod/assign`) but treats them identically to external links — storing only a URL back to the Moodle assignment page. This means Typenote has no awareness of the actual assignment content (questions, instructions, due dates). Students must manually switch between Moodle and Typenote when working on homework.

This feature transforms assignments from opaque links into structured, browsable entities. When an assignment is synced, the extension scrapes the full assignment content (description HTML containing questions, instructions, and metadata). AI automatically parses this into individual questions — a lightweight split defined by boundary positions on the content, not content copies. Any student can create their own split or use an existing one. Splits are shared by default: everyone can browse all available versions. Students toggle a "split view" feature flag to see questions or raw content. From a question browser panel, students copy individual questions into their homework documents, giving the AI context for what they're working on.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Assignment Content Syncing (Priority: P1)

When a student syncs a Moodle course, assignments are scraped differently from regular files. Instead of storing just a link, the extension navigates to each assignment's page and extracts the full description/instructions HTML, the due date, and submission status metadata. This rich content is stored as a new entity type in the shared registry, distinct from files and links.

**Why this priority**: This is the foundation. Without the actual assignment content in Typenote, none of the downstream features (question splitting, browsing) can work. The scraper change is the entry point for the entire feature.

**Independent Test**: Sync a Moodle course that has assignments. Verify that assignment entities are created with full description HTML, due dates, and metadata — not just a URL reference. Verify that regular files and links continue to sync as before.

**Acceptance Scenarios**:

1. **Given** a student syncs a Moodle course containing assignments, **When** the scraper encounters an `assign` activity type, **Then** it navigates to the assignment page and extracts the full description HTML, due date, and submission status.
2. **Given** an assignment has been scraped, **When** the data reaches the backend, **Then** a shared assignment entity is created in the registry with the raw content, distinct from file and link entities.
3. **Given** an assignment was previously synced, **When** the student re-syncs, **Then** the system detects changes to the assignment description or due date and updates the shared entity.
4. **Given** a Moodle assignment has no description (just a title), **When** it is scraped, **Then** it is still stored as an assignment entity with an empty description and the available metadata.
5. **Given** the scraper encounters a non-assignment activity (file, link, quiz), **When** it processes the activity, **Then** existing behavior is preserved — no regression in file/link syncing.

---

### User Story 2 — AI-Powered Question Splitting (Priority: P1)

When an assignment is first synced, the system automatically uses AI to analyze the description and produce a structured split — a list of questions defined by their boundary positions within the assignment content. Questions may have subquestions (e.g., 1a, 1b, 1c) and shared preamble text. The AI split becomes the first shared version, immediately available to all students who view that assignment.

**Why this priority**: Automatic question splitting is the core value proposition. Without it, students would need to manually parse every assignment.

**Independent Test**: Sync an assignment with 5 questions (some with subquestions). Verify the AI produces a structured split with correct question numbers, boundary positions, and parent-child relationships. Test with varied formats (numbered lists, lettered sub-items, paragraph-style questions).

**Acceptance Scenarios**:

1. **Given** an assignment has been synced with a description containing numbered questions, **When** the AI split is triggered automatically, **Then** the system produces a shared split with questions defined by boundary positions, labels, and subquestion hierarchy.
2. **Given** an assignment description contains shared preamble text (e.g., "For questions 1-3, use the following dataset..."), **When** the AI splits questions, **Then** the shared context is preserved and associated with the relevant questions.
3. **Given** an assignment has subquestions (e.g., 1a, 1b, 1c under question 1), **When** the AI splits, **Then** subquestions are structured as children of their parent question with correct labels.
4. **Given** an assignment description is ambiguous or poorly formatted, **When** the AI attempts to split, **Then** it produces a best-effort split and flags low-confidence boundaries visually.
5. **Given** an assignment with no discernible question structure (e.g., a single essay prompt), **When** the AI splits, **Then** it returns a single question containing the full assignment text.
6. **Given** an assignment contains images, tables, or formulas within questions, **When** the AI splits, **Then** boundary positions correctly include these elements within the right question.
7. **Given** an assignment description has changed since the last sync, **When** the re-sync completes, **Then** a new AI split is automatically generated for the updated content, and previous splits are flagged as "based on older version."
8. **Given** the student who triggers the first sync has exhausted their AI quota, **When** the AI split is attempted, **Then** the split is skipped (no error), the assignment is stored without a split, and a split will be generated when any student with available quota next views the assignment.

---

### User Story 3 — Manual Split Editing & Shared Splits (Priority: P1)

Any student can create or edit a question split. They open a split editor that overlays boundary markers on the full assignment content. They can start from an existing split (copy the AI split or any shared split as a starting point) or start from scratch. Editing actions include: adding split points, removing split points (merging questions), dragging boundaries, and editing question labels. When done, the student saves it as a new shared split (visible to everyone, attributed to them) or as their personal private split. All shared splits are kept — no version limit — since splits are just lightweight boundary data.

**Why this priority**: AI splitting will never be 100% accurate. Manual editing ensures every student can get a correct split. Making splits shared means one student's work benefits everyone.

**Independent Test**: Open the split editor for an assignment. Start from the AI split. Merge two questions. Split one into two. Adjust a boundary. Save as a new shared split. Verify another student can see and use the new split.

**Acceptance Scenarios**:

1. **Given** a student wants to edit a split, **When** they open the split editor, **Then** they see the full assignment content with boundary markers overlaid and a list of detected questions.
2. **Given** the student starts from an existing split, **When** they choose "Copy from AI split" or any shared split, **Then** the boundary markers from that split are loaded as a starting point.
3. **Given** the student adds a split point in the text, **When** they click at a position, **Then** the question containing that position is divided into two at that point.
4. **Given** the student removes a split point, **When** they delete a boundary marker, **Then** the two adjacent questions merge into one.
5. **Given** the student drags a boundary marker, **When** they move it to a new position, **Then** content shifts between the adjacent questions accordingly.
6. **Given** the student edits a question label (e.g., "Q3" to "Q2b"), **When** they save, **Then** the new label is stored with the split.
7. **Given** the student finishes editing, **When** they choose "Save as shared," **Then** the split is saved as a new shared version attributed to them, visible to all students.
8. **Given** the student finishes editing, **When** they choose "Save as personal," **Then** the split is saved privately, visible only to them. If they already had a personal split, it is replaced.
9. **Given** multiple students have created shared splits, **When** any student views the assignment, **Then** all shared splits are listed and browsable.
10. **Given** two students save shared splits at the same time, **When** both saves complete, **Then** both splits are created as independent shared versions ordered by creation timestamp.
11. **Given** the assignment content has been updated since a split was created, **When** the student views that split, **Then** it is visually flagged as "based on older version."

---

### User Story 4 — Question Browser Panel (Priority: P1)

When a student is working on homework, they open a question browser panel (side panel, similar to the AI chat panel). The panel shows the current assignment's questions based on the selected split. A dropdown lets them switch between all available splits (AI-generated, student-contributed shared splits, and their personal split if they have one). Each question shows its label and a text preview. Clicking a question copies the question text into the student's current document as a read-only context block — or they can create a new document from it. The copied question text gives the AI context about what the student is working on.

**Why this priority**: This is the user-facing payoff. The question browser makes homework manageable — students grab individual questions instead of manually parsing a wall of text.

**Independent Test**: Open the question browser for an assignment. Switch between splits in the dropdown. Click a question. Verify it's copied into the current document as a context block. Open the AI chat and ask a question — verify the AI knows which homework question the student is working on.

**Acceptance Scenarios**:

1. **Given** a student opens the question browser panel for an assignment, **When** the panel loads, **Then** it shows questions from the default split (latest shared) with labels and text previews.
2. **Given** multiple splits exist for an assignment, **When** the student opens the split dropdown, **Then** they see all available splits (AI, shared by other students, personal) and can switch between them.
3. **Given** the student clicks a question in the panel, **When** they choose "Copy to current document," **Then** the question text is inserted into their current document as a visually distinct, non-editable block.
4. **Given** the student clicks a question, **When** they choose "Create new document," **Then** a new document is created with the question text as a visually distinct, non-editable block.
5a. **Given** a question context block exists in a document, **When** the student wants to remove it, **Then** they can delete the block.
5b. **Given** a student copies the same question into the same document twice, **When** the second copy is attempted, **Then** the system inserts it (duplicates are allowed — the student controls their document structure).
6. **Given** a question has been copied into a document, **When** the student asks the AI for help, **Then** the AI has context about which question the student is working on.
7. **Given** a question has shared preamble text, **When** the student copies it, **Then** the preamble is included alongside the question text.
8. **Given** the student has the split view feature flag turned off, **When** they view an assignment, **Then** they see the raw assignment content without question boundaries.

---

### User Story 5 — Split View Feature Flag (Priority: P2)

Each student has a toggle (feature flag) to control whether assignments are shown with split questions or as raw content. When enabled (default), assignments show the question browser with the selected split. When disabled, assignments display the original HTML content as-is. The toggle is a user preference, not a per-assignment setting.

**Why this priority**: Some students may prefer to see the full assignment without question boundaries. The toggle gives them control without affecting other students.

**Independent Test**: Toggle the split view off. Open an assignment. Verify raw content is shown. Toggle it on. Verify questions appear based on the selected split.

**Acceptance Scenarios**:

1. **Given** the split view is enabled (default), **When** the student opens an assignment, **Then** they see the question browser panel with split questions.
2. **Given** the split view is disabled, **When** the student opens an assignment, **Then** they see the raw assignment content without question boundaries.
3. **Given** the student toggles the setting, **When** the change is saved, **Then** it persists across sessions and applies to all assignments.

---

### Edge Cases

- **Assignment with embedded images**: The extension captures image URLs from the description HTML. Images requiring Moodle authentication are downloaded and stored alongside the assignment content.
- **Assignment description changes after sync**: On re-sync, the shared assignment entity is updated. A new AI split is generated for the updated content. Previous splits remain available but may no longer align with the new content — they are flagged as "based on older version."
- **Very long assignments (20+ questions)**: The question list in the browser panel is scrollable with question numbers visible.
- **Assignment with no due date**: The due date field is stored as null. The UI omits the due date display.
- **Multiple students sync the same assignment**: The shared assignment entity is created once (first sync). All students see the same content and shared splits.
- **Assignment content contains only attached files (no inline description)**: Stored as an assignment entity with an empty description. The AI split returns a single item. Students can manually create splits.
- **RTL text or mixed-direction content**: The question display respects the text direction of the original content.
- **Student copies a question and later the split is edited by someone else**: The copied question text in the document is independent — it doesn't change when the source split is modified.
- **Concurrent split creation**: Two students saving shared splits at the same time produces two independent versions. The default is determined by creation timestamp. No locking is required.
- **Boundary positions within complex HTML**: Boundaries MUST align to complete HTML element boundaries (e.g., whole paragraphs, list items, table rows). The system never splits mid-element — it snaps to the nearest valid boundary to avoid producing broken HTML fragments.
- **Assignment removed from Moodle**: On re-sync, if an assignment is no longer present, it is flagged as "Removed from Moodle" (same pattern as `moodle_files.is_removed`). The assignment and its splits remain accessible in Typenote.

## Requirements _(mandatory)_

### Functional Requirements

**Assignment Content Syncing**

- **FR-001**: The browser extension MUST detect `assign` activity types on Moodle and scrape the full assignment page content (description HTML, due date, submission status), not just a URL reference.
- **FR-002**: Assignment content MUST be stored as a distinct entity type in the shared registry, separate from files and links.
- **FR-003**: Re-syncing MUST detect changes to assignment descriptions and due dates, updating the shared entity accordingly.
- **FR-004**: Assignment syncing MUST NOT break existing file and link syncing behavior.
- **FR-005**: The extension MUST handle assignments with embedded images by downloading and storing image assets that require Moodle authentication.
- **FR-005a**: When an assignment is no longer present on Moodle during re-sync, it MUST be flagged as "Removed from Moodle" (soft delete). The assignment and its splits remain accessible in Typenote.

**AI-Powered Question Splitting**

- **FR-006**: The system MUST automatically generate an AI-powered question split when an assignment is first synced. This becomes the first shared split.
- **FR-006a**: When a re-sync detects that the assignment description has changed, the system MUST generate a new AI split for the updated content. Previous splits MUST be flagged as "based on older version."
- **FR-006b**: The AI split consumes quota from the student who triggered the sync. If their quota is exhausted, the split is deferred — the assignment is stored without a split, and the AI split is generated when any student with available quota next views the assignment.
- **FR-007**: Each question in a split MUST be defined by boundary positions within the assignment content, a label, ordering, and optional parent reference for subquestions. Content is derived from the assignment at render time — not duplicated.
- **FR-007a**: Boundary positions MUST align to complete HTML element boundaries (e.g., whole paragraphs, list items, table rows). The system MUST NOT split mid-element.
- **FR-008**: The AI MUST preserve shared context/preamble text and associate it with the relevant questions.
- **FR-009**: The AI MUST handle varied assignment formats: numbered lists, lettered sub-items, paragraph-style questions, and mixed formats.
- **FR-010**: When the AI has low confidence in a boundary, it MUST flag that boundary visually for potential manual review.
- **FR-011**: For assignments with no discernible question structure, the AI MUST return a single question containing the full text.

**Shared Split Model**

- **FR-012**: All splits are kept — no version limit. Splits are lightweight boundary data, not content copies.
- **FR-013**: Splits MUST be shared by default. Any student can create a shared split, attributed to its creator (AI or student).
- **FR-014**: A student MAY save at most one personal split per assignment (private, visible only to them). Saving a new personal split replaces the previous one.
- **FR-015**: All shared splits MUST be browsable by any student via a dropdown/selector in the question browser.
- **FR-016**: The latest shared split MUST be the default when a student opens an assignment.

**Manual Split Editing**

- **FR-017**: The system MUST provide a split editor showing the full assignment content with boundary markers overlaid.
- **FR-018**: Users MUST be able to start editing from any existing split (copy as starting point) or from scratch.
- **FR-019**: Users MUST be able to add split points, remove split points (merge), drag boundaries, and edit question labels.
- **FR-020**: On save, users MUST choose between saving as a new shared split or as their personal split.

**Question Browser Panel**

- **FR-021**: The system MUST provide a question browser side panel for each synced assignment.
- **FR-022**: The panel MUST show questions from the currently selected split with labels and text previews.
- **FR-023**: The panel MUST include a dropdown to switch between all available splits (AI, shared, personal).
- **FR-024**: Clicking a question MUST allow copying it into the current document as a question context block, or creating a new document with it.
- **FR-024a**: The question context block MUST be visually distinct from editable content (e.g., different background, border, or styling) so the student can distinguish question text from their own work.
- **FR-024b**: The question context block MUST be non-editable (the student cannot modify the question text) but MUST be deletable (the student can remove it from their document).
- **FR-024c**: The AI MUST recognize question context blocks as the homework question the student is working on, using them to provide relevant help.
- **FR-025**: Copied question text MUST be independent of the source split — changes to the split do not affect already-copied content.
- **FR-026**: Shared preamble MUST be included when copying a question that has associated preamble text.

**Feature Flag**

- **FR-027**: Each student MUST have a toggle to show or hide split question views. Default is enabled.
- **FR-028**: When disabled, assignments MUST display as raw content without question boundaries.
- **FR-029**: The toggle MUST persist across sessions and apply to all assignments.

### Key Entities

- **Moodle Assignment**: A shared canonical entity representing an assignment from Moodle. Contains the full description HTML, due date, submission metadata, and a reference to the parent Moodle section. Identified by Moodle instance + course + assignment module ID. Shared across all students who sync the same course.
- **Question Split**: A set of boundary positions defining how an assignment is divided into questions. Attributed to its creator (AI or a specific student). Shared by default (visible to all students), or personal (private to the creator). Lightweight — stores positions and labels, not content copies.
- **Split Question**: A single question within a split. Defined by start/end boundary positions within the assignment content, a label/number, ordering, optional parent reference (for subquestions), and optional preamble association. Content is derived from the assignment at render time.
- **Shared Preamble**: A block of context text that applies to multiple questions within a split (e.g., "Use the following dataset for questions 1-3"). Defined by its own boundary positions.

## Scope Boundaries

**In scope**:

- Extension scraper changes to extract full assignment content (HTML, due date, status)
- New shared `moodle_assignments` entity type in the registry
- AI-powered automatic question splitting on first sync
- Shared split model — all splits kept, no version limit, lightweight boundary data
- Manual split editor (split, merge, drag boundaries, edit labels)
- Save as shared or personal split
- Question browser side panel with split selector
- Copy question to document as read-only context block
- AI context awareness of copied questions
- Per-student feature flag for split view toggle
- Re-sync detection for assignment content changes

**Out of scope (future phases)**:

- Assignment submission back to Moodle (read-only import only)
- Grading or rubric display from Moodle
- AI-generated answer suggestions or hints
- Export of answers back to a submission-ready format
- Question difficulty estimation or time estimates
- Assignment notifications or due date reminders
- Cross-assignment question banks or question reuse
- Per-question completion/progress tracking (questions are just reference data — documents are the work product)
- PDF/image-only assignments (text-based descriptions only for v1; attached files noted but not parsed for questions)

## Assumptions

- Moodle assignment pages have a standard, scrapable structure for the description area. The extension targets standard Moodle themes.
- Assignment descriptions are primarily HTML text with optional inline images, tables, and math notation. Assignments that consist solely of attached files without an inline description are handled as a single question.
- The AI splitting uses the same Gemini model available through the existing AI pipeline. No additional AI provider or model is required.
- Question splitting consumes AI quota from the student's existing rate limit tier. A typical assignment split costs 1-2 AI queries.
- Splits are lightweight — boundary positions, labels, and metadata only. No content duplication. This makes it practical to keep all versions without storage concerns.
- The TipTap+canvas editor already supports all needed input modes (text, LaTeX, freehand drawing). A new non-editable block type is needed to display question context — this is a minor editor extension, not a structural change.
- Documents with copied questions are standard Typenote documents. The question text becomes part of the document content, independent of the source split.
- Assignment due dates are informational only — the system does not enforce deadlines or restrict access after due dates.
- The split editor and question browser are web app features. The extension's only new responsibility is scraping assignment content.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Students can sync a Moodle course and see assignments with their full content in Typenote within the same sync flow they use today — no extra steps beyond what exists for file/link syncing.
- **SC-002**: AI question splitting correctly handles standard numbered and lettered assignment formats, as validated by manual review of representative samples from at least 3 different course types.
- **SC-003**: Students can create or edit a split in under 2 minutes for a typical 5-question assignment.
- **SC-004**: Students can copy a question into their document in 2-3 clicks: open browser panel, optionally select a non-default split, click question.
- **SC-005**: Copied question text gives the AI accurate context — when the student asks for help, the AI references the correct question.
- **SC-006**: A split created by one student is immediately visible to all other students viewing the same assignment.
- **SC-007**: The manual split editor allows a student with no prior experience to correctly adjust an incorrect AI split within 1 minute.
- **SC-008**: Existing file/link syncing functionality continues to work identically — zero regression from assignment handling changes.
