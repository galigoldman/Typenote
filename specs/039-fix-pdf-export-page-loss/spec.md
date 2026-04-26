# Feature Specification: Fix PDF Export Page Deletion

**Feature Branch**: `039-fix-pdf-export-page-loss`
**Created**: 2026-04-15
**Status**: Draft
**Input**: User description: "fix it on dev. also make a perfect browser use test, that writes 6 pages content, exports pdf and waits a while (because it took some minutes until it disappeared) and then checks everything is still there."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Pages with non-text content survive auto-save (Priority: P1)

A user creates a multi-page document where some trailing pages contain only math formulas, drawings, or other non-text content. When the document auto-saves, all pages must be preserved — the system must never silently discard pages that the user can see on screen.

**Why this priority**: This is the core data-loss bug. Pages containing real user content (math, LaTeX formulas) are incorrectly classified as "empty" and stripped during every auto-save. Without this fix, users permanently lose work.

**Independent Test**: Create a document, type math formulas on the last 2 pages (no regular text), wait for auto-save, reload the page, and verify all pages are still present.

**Acceptance Scenarios**:

1. **Given** a 6-page document where pages 5 and 6 contain only LaTeX math formulas, **When** auto-save fires, **Then** all 6 pages are persisted to the database
2. **Given** a document where the last page has only a math expression and no regular text, **When** the user reloads the page, **Then** the math page is still present
3. **Given** a document with mixed content (text on some pages, math-only on trailing pages), **When** multiple auto-saves occur over time, **Then** no pages are lost

---

### User Story 2 - Pages persist after PDF export (Priority: P1)

A user creates a multi-page document, exports it to PDF, and continues working or leaves the document open. All pages must remain visible in the editor after the export completes. No pages should disappear "after a while."

**Why this priority**: This is the user-reported symptom. The PDF export's print dialog creates a timing window that exposes a race condition between the auto-save echo and the Realtime sync, causing pages to vanish from the live editor.

**Independent Test**: Create a 6-page document with content on all pages, export to PDF, wait several minutes, and verify all 6 pages are still in the editor.

**Acceptance Scenarios**:

1. **Given** a 6-page document with content on all pages, **When** the user exports to PDF and waits 2+ minutes, **Then** all 6 pages remain visible in the editor
2. **Given** a document where the user edits and immediately exports, **When** the print dialog is open for more than 5 seconds, **Then** no pages are lost after the dialog closes
3. **Given** a document where auto-save fires during the export process, **When** the Realtime echo arrives after the print dialog closes, **Then** the echo does not overwrite local state with fewer pages

---

### User Story 3 - E2E browser test validates page persistence after export (Priority: P1)

A comprehensive end-to-end test must exist that creates a multi-page document, fills all pages with content, exports to PDF, waits a significant duration, and verifies all pages remain intact. This test prevents regression of the page-loss bug.

**Why this priority**: The user explicitly requested this test. Without automated browser-level verification, the bug could silently regress in future changes.

**Independent Test**: Run the Playwright E2E test — it creates a 6-page document, writes content to each page, triggers PDF export, waits, and asserts all 6 pages still exist with their content.

**Acceptance Scenarios**:

1. **Given** a fresh test document, **When** the test writes content to 6 pages and exports to PDF, **Then** after waiting, all 6 pages and their content are still present in the editor
2. **Given** the E2E test suite, **When** this test runs in CI, **Then** it passes consistently without flakiness

---

### Edge Cases

- What happens when pages contain only images or embedded files (no text, no math)?
- What happens when the user has a very slow network and the save response arrives much later than the Realtime echo?
- What happens when the user opens the same document in two tabs and exports from one?
- What happens when the print dialog is cancelled (not printed) — do pages still persist?
- What happens when the document has 50+ pages and the Realtime payload is very large?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The page content detection logic MUST recognize math/LaTeX content as real content, not as empty
- **FR-002**: The auto-save page stripping MUST never remove a page that contains any user-visible content (text, math, strokes, text boxes, PDF backgrounds, or images)
- **FR-003**: After PDF export, the editor MUST retain all pages that were visible before the export, regardless of how long the print dialog was open
- **FR-004**: The Realtime echo guard MUST reliably block echoes from the client's own saves, even when the HTTP response arrives after the WebSocket echo
- **FR-005**: An E2E Playwright test MUST exist that creates a 6-page document with content, exports to PDF, waits, and verifies all pages remain

### Key Entities

- **Canvas Page**: A single page in the document. Contains strokes, text boxes, flow content, and optional PDF background. The content detection logic determines whether a page is "empty" or has real content.
- **Page Content Detection**: The logic that decides if a page has user content. Currently checks for strokes, PDF backgrounds, non-ftb text boxes, and text nodes — but misses math nodes.
- **Echo Guard**: The mechanism that prevents Realtime database change notifications from overwriting local state when they are echoes of the client's own saves.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero pages with visible content are lost during auto-save, across all content types (text, math, strokes, text boxes)
- **SC-002**: After PDF export, 100% of pages remain in the editor for at least 10 minutes with no user interaction
- **SC-003**: The E2E test for page persistence after export passes in CI on every run
- **SC-004**: Existing auto-save, Realtime sync, and PDF export functionality continue to work with no regressions

## Assumptions

- The user primarily encounters this bug with math/LaTeX-heavy documents, where trailing pages contain only math formulas
- The print dialog typically stays open for 5-30 seconds while the user reviews the preview
- The Vercel deployment adds an extra network hop for HTTP responses compared to the direct WebSocket Realtime path
- The E2E test should use a realistic wait time (at least 30-60 seconds) to catch timing-dependent issues, but not so long that it slows CI unreasonably
