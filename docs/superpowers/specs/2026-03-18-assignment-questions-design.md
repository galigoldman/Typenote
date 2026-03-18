# Design: Moodle Assignment Questions

**Date**: 2026-03-18
**Branch**: `012-assignment-questions`
**Status**: Approved

## Problem

Moodle assignments are synced as opaque links. Students have no way to see assignment content (questions, due dates) inside Typenote, and must manually switch between Moodle and their homework documents. There's no structured way to work through assignment questions one by one.

## Solution

Transform assignments from links into rich, structured entities with AI-powered question splitting and a question browser panel.

## Architecture

### 1. Assignment Syncing (Extension Change)

The Chrome extension already detects `assign` activity types but converts them to links. The change: navigate to the assignment page, scrape the full description HTML, due date, and submission status. Store as a new `moodle_assignments` entity in the shared registry (separate from `moodle_files`).

- Follows the same shared registry pattern as courses, sections, and files
- First student to sync creates the shared entity; subsequent syncs reuse it
- Re-sync detects content/due date changes and updates the entity
- Embedded images requiring Moodle auth are downloaded and stored

### 2. Shared Split Model

Splits define how an assignment's content is divided into questions. They are **boundary data** — positions/ranges within the assignment HTML, not content copies. This makes them very lightweight.

**Key properties:**
- All splits are kept (no version limit)
- Shared by default — any student can browse any shared split
- AI-generated split is created automatically on first sync (first shared version)
- Any student can create a new shared split (attributed to them)
- A student can save at most one personal/private split per assignment (replaces previous)
- Latest shared split is the default view
- Splits for older assignment versions are flagged as potentially stale

**Split structure:**
- Each question: boundary start/end positions, label, order, optional parent (subquestions)
- Boundaries must align to complete HTML element boundaries (paragraphs, list items, table rows) — never mid-element
- Optional shared preamble blocks associated with question groups
- AI confidence flags on boundaries where the AI was uncertain

**AI quota:** The AI split consumes quota from the student who triggered the sync. If their quota is exhausted, the split is deferred — generated when any student with available quota views the assignment.

**Assignment removal:** If an assignment is removed from Moodle, it's soft-deleted (flagged). The assignment and its splits remain accessible.

### 3. Manual Split Editor

A UI for creating/editing splits, overlaying boundary markers on the full assignment content.

**Starting points:** copy any existing split as a base, or start from scratch.

**Edit operations:**
- Add split point (click in text → divides question at that position)
- Remove split point (delete marker → merges adjacent questions)
- Drag boundary (adjust where one question ends and next begins)
- Edit question labels

**Save options:** "Save as shared" (new shared version, attributed to creator) or "Save as personal" (private).

### 4. Question Browser Panel

A side panel (same pattern and width as the existing AI chat panel) for browsing assignment questions.

**Contents:**
- Dropdown to select split version (AI, shared by other students, personal)
- List of questions with labels and text previews
- Click action: copy question text into current document (non-editable, visually distinct context block) or create new document with it
- Context blocks are deletable but not editable — students can remove them but can't modify the question text

**AI context:** When a question is copied into a document, the AI chat has context about which question the student is working on. The AI recognizes context blocks as the homework question, distinct from the student's own writing.

**Independence:** Copied question text is independent of the source split. Editing a split doesn't change already-copied content in documents.

### 5. Feature Flag

Per-student toggle for split question view vs. raw assignment content. Default: split view enabled. Persists across sessions.

## Approach Selection

**Chosen: Question Browser Panel (Approach A)**

Rejected alternative: Assignment Dashboard View (dedicated page per assignment with question cards). This was heavier to build and added a new page type without matching the user's workflow description: "go choose next question, copy it into your homework doc."

The panel approach integrates naturally with the existing editor — students work in their document and pull questions from the side panel as needed.

## Key Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Split ownership | Shared by default | Consistent with shared registry pattern. One student's work benefits everyone. |
| Version limit | None | Splits are just boundary positions — negligible storage. |
| Approval gate | None | AI split is immediately usable. No friction. |
| Answer management | None (just documents) | Questions are reference data. Students copy into normal docs. Simpler, more flexible. |
| Feature flag | Per-student toggle | Students who prefer raw content can opt out. |
| Content duplication | None | Splits store positions, content derived at render time from the assignment. |

## Data Flow

```
Moodle Assignment Page
  → Extension scrapes HTML + metadata
  → Backend stores shared moodle_assignment entity
  → AI generates first split (boundary positions)
  → Split stored as shared version #1

Student opens assignment:
  → Question browser panel loads
  → Shows questions from latest shared split (default)
  → Student can switch to other splits via dropdown
  → Student clicks question → copied into their document as context block
  → AI chat now has context about which question student is working on

Student wants different split:
  → Opens split editor
  → Copies existing split as starting point (or starts fresh)
  → Adjusts boundaries (add/remove/drag split points, edit labels)
  → Saves as new shared split or personal split
```

## Risks and Mitigations

- **AI split quality varies across assignment formats**: Manual editor is the mitigation. AI doesn't need to be perfect — it just needs to be a good starting point.
- **Moodle DOM changes break assignment scraping**: Same risk as existing file scraping. Extension updates address this.
- **Assignment content has no clear question structure**: AI returns single question. Student can manually split or use raw view.
- **Stale splits after re-sync**: Flagged visually. Students can create new splits from updated content.
