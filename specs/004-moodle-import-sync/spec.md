# Feature Specification: Moodle Import & Sync

**Feature Branch**: `004-moodle-import-sync`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Easy Moodle course import via browser extension with shared/deduped material storage across students. Extension scrapes Moodle using the student's existing session. Sync flow triggered from the Typenote app. Students choose exactly what to import. Materials stored once and shared across all students to save storage and enable future AI retrieval."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Moodle Connection Setup (Priority: P1)

A student installs the Typenote browser extension and connects their Moodle instance. In Typenote's settings (or onboarding), they enter their university's Moodle URL (e.g., `moodle.tau.ac.il`). The app validates it's a real Moodle instance. The extension stores this URL and can now check login status.

**Why this priority**: Without a valid Moodle connection, no other sync functionality works. This is the foundation.

**Independent Test**: Can be fully tested by entering a Moodle URL and confirming the extension recognizes the instance. Delivers value by establishing the connection pipeline.

**Acceptance Scenarios**:

1. **Given** a student has installed the extension and is in Typenote settings, **When** they enter a valid Moodle URL, **Then** the system validates it's a Moodle instance and saves the connection.
2. **Given** a student enters an invalid URL (not a Moodle site), **When** validation runs, **Then** the system shows a clear error and does not save the connection.
3. **Given** a student has already connected a Moodle instance, **When** they revisit settings, **Then** they see their connected Moodle URL and can change it.

---

### User Story 2 - Moodle Login Detection & Sync Prompt (Priority: P1)

When the student opens the Typenote app, it asks the extension to check if the student is logged into their Moodle instance. If logged in, the app shows a prompt suggesting to sync. If not logged in, the app shows a message asking them to log into Moodle first (with a link to open Moodle login in a new tab).

**Why this priority**: The seamless login detection is what makes the UX feel effortless. Without it, students must manually manage when to sync.

**Independent Test**: Can be tested by opening Typenote while logged into Moodle (should see sync prompt) and while logged out (should see login prompt).

**Acceptance Scenarios**:

1. **Given** a student has connected their Moodle instance and is logged into Moodle in their browser, **When** they open the Typenote app, **Then** the app detects the active session and shows a "Sync with Moodle" prompt.
2. **Given** a student is not logged into Moodle, **When** they open Typenote, **Then** the app shows "Log into Moodle to sync" with a link to the Moodle login page.
3. **Given** a student logs into Moodle after seeing the "not logged in" message, **When** they return to Typenote, **Then** the login status updates and the sync prompt appears.

---

### User Story 3 - Course Discovery & Selection (Priority: P1)

When the student clicks "Sync with Moodle," the extension scrapes the Moodle courses page in the background and returns a list of available courses. The Typenote app displays these courses with checkboxes. The student selects which courses they want to import. Courses already synced are marked as such and show what's new.

**Why this priority**: Course discovery is the entry point to all material imports. Students must see and choose their courses before any files can be synced.

**Independent Test**: Can be tested by triggering a sync, verifying the course list matches the student's actual Moodle enrollment, and selecting/deselecting courses.

**Acceptance Scenarios**:

1. **Given** a logged-in student clicks "Sync with Moodle," **When** the extension scrapes their Moodle dashboard, **Then** the app displays all enrolled courses with names and course codes.
2. **Given** some courses were previously synced, **When** the course list appears, **Then** already-synced courses are clearly marked (e.g., "Synced - 3 new items") and new courses are unmarked.
3. **Given** the extension cannot reach Moodle (network issue or session expired), **When** the scrape fails, **Then** the app shows a clear error message.

---

### User Story 4 - Granular Material Selection & Import (Priority: P1)

After selecting a course, the student sees the course's internal structure (sections/topics as organized in Moodle). Under each section, they see files and links. They can cherry-pick exactly which items to import. The structure preserves Moodle's native ordering — sections are not auto-mapped to Typenote weeks. Selected files are downloaded by the extension and uploaded to the backend.

**Why this priority**: Granular selection is core to the UX — students should never be forced to import everything. This is where actual materials enter the system.

**Independent Test**: Can be tested by expanding a course, seeing its sections and files in Moodle's order, selecting specific items, and confirming they appear in Typenote after import.

**Acceptance Scenarios**:

1. **Given** a student selected a course to sync, **When** the course structure loads, **Then** sections appear in Moodle's native order with their original titles.
2. **Given** a course has files (PDFs, DOCX, PPTX, XLSX, etc.) and links under sections, **When** the structure is displayed, **Then** each item shows its name, type, and size (for files).
3. **Given** the student selects specific items and clicks "Import," **When** the extension downloads and uploads them, **Then** each item is stored in the backend and associated with the correct course and section.
4. **Given** some items were already imported in a previous sync, **When** the course structure loads, **Then** those items are shown as "Already imported" and are not presented for selection.

---

### User Story 5 - Shared Storage & Deduplication (Priority: P2)

When a file is uploaded, the system checks if the same file already exists (by Moodle URL first, then by content hash). If it exists, no duplicate is stored — instead, a reference is created linking the new student to the existing file. This saves storage and ensures files are ready for future AI retrieval across all students.

**Why this priority**: Deduplication is an infrastructure concern that saves cost and enables AI retrieval. It doesn't affect the student-facing UX directly, but is essential for scalability.

**Independent Test**: Can be tested by having two different students sync the same course and verifying that storage usage does not double — the second student's import creates references, not duplicate files.

**Acceptance Scenarios**:

1. **Given** Student A imported `lecture3.pdf` from "Intro to CS," **When** Student B syncs the same course and selects `lecture3.pdf`, **Then** no duplicate file is stored; Student B gets a reference to the existing file.
2. **Given** a professor re-uploads a file with the same URL but different content, **When** a student syncs, **Then** the system detects the content change (via hash), stores the new version, and replaces the old reference.
3. **Given** a file exists at a different Moodle URL but has identical content (same hash), **When** it is imported, **Then** the system deduplicates by hash and creates a reference to the existing file.

---

### User Story 6 - Re-Sync & Change Detection (Priority: P2)

When a student syncs a course they've already synced, the system compares the current Moodle state against what's already stored. It shows only new or changed items. Files removed by the professor are flagged as "Removed from Moodle" in Typenote but are kept (not deleted). Modified files (same URL, new content) are silently replaced with the updated version.

**Why this priority**: Ongoing sync is how students stay up-to-date throughout a semester. Without change detection, they'd have to manually track what's new.

**Independent Test**: Can be tested by adding/removing/modifying files on a Moodle course and re-syncing to verify correct detection of each change type.

**Acceptance Scenarios**:

1. **Given** a student re-syncs a previously synced course, **When** the professor has added new files, **Then** only the new files are presented for selection.
2. **Given** a professor removed a file from Moodle, **When** the student re-syncs, **Then** the file is flagged as "Removed from Moodle" in Typenote but remains accessible.
3. **Given** a professor replaced a file (same URL, different content), **When** the student re-syncs, **Then** the updated file replaces the old version silently.

---

### User Story 7 - Moodle Course as Shared Registry (Priority: P2)

Moodle courses exist as shared canonical entities in the system, identified by Moodle instance domain + course ID. When any student syncs a course, the course entity and its structure are stored/updated centrally. Each student's personal Typenote course links to this shared Moodle course. This enables the system to know exactly what courses and files exist across all students.

**Why this priority**: The shared registry is what makes deduplication and future AI features possible. It's the data backbone.

**Independent Test**: Can be tested by verifying that after multiple students sync the same Moodle course, there is exactly one shared course entity with one set of sections and files, and multiple student references pointing to it.

**Acceptance Scenarios**:

1. **Given** Student A syncs "Intro to CS" from `moodle.tau.ac.il`, **When** Student B syncs the same course, **Then** both students reference the same shared Moodle course entity.
2. **Given** a shared Moodle course exists, **When** any student syncs it and new files are found, **Then** the shared course structure is updated with the new files.
3. **Given** a Moodle instance is identified by its domain, **When** two students from the same university sync, **Then** their courses are grouped under the same Moodle instance.

---

### Edge Cases

- **Session expires mid-sync**: The sync pauses, the app notifies the student to re-login to Moodle, and resumes from where it left off once re-authenticated.
- **File download fails (network error, file too large)**: The failed item is marked as "Failed to import" with a retry option. Other items continue normally.
- **Two students sync the same course simultaneously**: The server uses the content hash as an idempotent key. The first upload stores the file; the second detects the hash exists and creates a reference. No race condition or duplicate.
- **Moodle course page structure changes (Moodle upgrade/redesign)**: The extension relies on known Moodle DOM patterns. If scraping fails, the app shows an error. Extension updates would address structural changes.
- **Extension not installed**: The app detects the missing extension and shows an install prompt with a link to the browser extension store.
- **Very large files (exceeding storage limit)**: Files exceeding the size limit are flagged during selection ("File too large to import") and cannot be selected.
- **Student has no courses on Moodle**: The sync completes with a friendly message: "No courses found on your Moodle."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a browser extension that scrapes Moodle course data using the student's existing browser session, without requiring Moodle credentials to be shared with the server.
- **FR-002**: System MUST allow students to configure their Moodle instance URL during onboarding or in settings, and validate it is a Moodle site.
- **FR-003**: System MUST detect whether the student is currently logged into their Moodle instance when they open the app.
- **FR-004**: System MUST allow the sync flow to be triggered entirely from within the Typenote app (not from the Moodle site).
- **FR-005**: System MUST display all enrolled Moodle courses for selection during sync.
- **FR-006**: System MUST display the internal structure of selected courses (sections with titles in Moodle's native order) and allow granular selection of individual files and links.
- **FR-007**: System MUST support importing files of any common document type (PDF, DOCX, PPTX, XLSX, images, etc.) and external links.
- **FR-008**: System MUST download selected files via the browser extension (using the student's Moodle session) and upload them to the backend without exposing session tokens to the server.
- **FR-009**: System MUST deduplicate files using a two-tier strategy: first by Moodle URL match, then by SHA-256 content hash. Duplicate files create references, not copies.
- **FR-010**: System MUST store Moodle courses as shared canonical entities identified by instance domain + Moodle course ID, accessible to all students who sync that course.
- **FR-011**: System MUST track which files each student has imported, and on re-sync only present new or changed items.
- **FR-012**: System MUST flag files removed from Moodle as "Removed from Moodle" but keep them accessible in Typenote.
- **FR-013**: System MUST silently replace files that have been modified on Moodle (same URL, different content hash) with the updated version.
- **FR-014**: System MUST allow students to link a synced Moodle course to a Typenote course for organization.
- **FR-015**: System MUST detect when the browser extension is not installed and prompt the student to install it.

### Key Entities

- **Moodle Instance**: Represents a university's Moodle deployment, identified by its domain. Shared across all students at that institution.
- **Moodle Course**: A canonical course from a Moodle instance, identified by instance + Moodle course ID. Contains sections and files. Shared across all students enrolled in that course.
- **Moodle Section**: A grouping within a Moodle course (could be weeks, topics, or any structure). Preserves Moodle's native ordering.
- **Moodle File**: A file or link within a section. Files are deduplicated by URL and content hash. The actual file is stored once; students hold references.
- **User Moodle Connection**: A student's link to their Moodle instance (which university they attend).
- **User Course Sync**: Tracks which Moodle courses a student has synced and when. Optionally links to their personal Typenote course.
- **User File Import**: Tracks which specific files a student chose to import and their current status (imported, removed from Moodle).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new student can go from installing the extension to having their first course materials imported in under 5 minutes.
- **SC-002**: Re-syncing a previously synced course takes under 30 seconds (excluding file download time) and correctly identifies all new, changed, and removed items.
- **SC-003**: When two students import the same course, total storage used is no more than 105% of a single import (allowing for metadata overhead), confirming effective deduplication.
- **SC-004**: The sync flow requires no more than 3 clicks from the Typenote app to begin importing materials (excluding individual file selection).
- **SC-005**: Student Moodle session credentials never leave the browser — verified by security audit of extension-to-server communication.
- **SC-006**: 90% of students can complete their first Moodle sync without external help or documentation.

## Assumptions

- Students use Chrome or a Chromium-based browser (extension is Chrome-first for MVP).
- Each student is enrolled at one university with one Moodle instance.
- Moodle course pages follow standard Moodle HTML structure (the extension targets the most common Moodle themes).
- File sizes are typically under 50MB per file (matching existing storage limits).
- The extension will need periodic updates to handle Moodle theme/version changes, which is a maintenance cost accepted for MVP.
- Online connectivity is required for all sync operations — no offline support needed.
