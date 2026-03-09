# Feature Specification: Course Structure & Material Upload

**Feature Branch**: `003-course-materials`
**Created**: 2026-03-08
**Status**: Draft
**GitHub Issue**: [#16 — Course material import](https://github.com/galigoldman/Typenote/issues/16)
**Input**: Students need a structured way to organize their academic courses with weekly breakdowns, upload course materials (lecture PDFs, homework PDFs), and create documents within that course context. The goal is to build the data foundation so future AI features can leverage course materials as context for homework help, exam generation, and study assistance.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Create a Course (Priority: P0)

A student wants to set up a new course for the semester. They create a course object that acts as a structured container for their academic work, organized by weeks.

**Why this priority**: The course is the foundational entity. Nothing else works without it. It must exist before weeks, materials, or documents can be added.

**Acceptance Scenarios**:

1. **Given** a logged-in student is on the dashboard, **When** they click "New Course", **Then** a creation dialog appears asking for course name (required) and color (optional).
2. **Given** a student fills in the course creation form, **When** they submit, **Then** the course is created and appears on the dashboard as a distinct visual element (differentiated from regular folders).
3. **Given** a student is inside a folder, **When** they create a new course, **Then** the course is created inside that folder.
4. **Given** a student creates a course at the dashboard root, **When** they view the dashboard, **Then** the course appears alongside folders and loose documents at the top level.

---

### User Story 2 — Add Weeks to a Course (Priority: P0)

A student wants to add weekly structure to their course. Each week represents a unit of study with its own materials and assignments.

**Why this priority**: Weeks are the primary organizational unit within a course. They provide the structure that makes material organization intuitive and enables future AI context scoping.

**Acceptance Scenarios**:

1. **Given** a student is viewing a course, **When** they click "Add Week", **Then** a new week is created with an auto-incremented number (e.g., "Week 4" if 3 weeks exist).
2. **Given** a student is adding a week, **When** the creation form appears, **Then** they can provide a topic/title (optional, e.g., "Derivatives").
3. **Given** a course has multiple weeks, **When** the student views the course, **Then** weeks are displayed in sequential order (Week 1, Week 2, ...) as expandable sections.
4. **Given** a student has created a week, **When** they want to edit the week's metadata, **Then** they can update the topic.
5. **Given** a student wants to remove a week, **When** they delete it, **Then** all materials and homework attached to that week are also removed (with confirmation dialog).

---

### User Story 3 — Upload Materials to a Week (Priority: P0)

A student receives lecture slides as a PDF and wants to attach them to the relevant week in their course.

**Why this priority**: Material upload is the core value proposition — getting course content into the system. Without this, the course structure is an empty shell.

**Acceptance Scenarios**:

1. **Given** a student is viewing a week, **When** they click "Add Material" or drag a PDF onto the materials area, **Then** a file picker opens (or the drop is accepted) for PDF files only.
2. **Given** a student selects a PDF file, **When** the upload begins, **Then** a progress indicator shows upload status, and the file appears in the materials list upon completion.
3. **Given** a student uploads a material, **When** they provide an optional label (e.g., "Lecture 5 Slides"), **Then** the label is displayed alongside the file name.
4. **Given** a material has been uploaded, **When** the student clicks on it, **Then** the PDF opens for viewing (inline preview or new tab).
5. **Given** a student wants to remove a material, **When** they delete it, **Then** the file is removed from storage and the reference is deleted (with confirmation).
6. **Given** a file exceeds 50MB, **When** the student attempts to upload, **Then** the system rejects the upload with a clear error message about the size limit.
7. **Given** a student tries to upload a non-PDF file, **When** the upload is attempted, **Then** the system rejects it with a message indicating only PDF files are accepted.

---

### User Story 4 — Upload Homework to a Week (Priority: P0)

A student receives a homework assignment as a PDF and wants to attach it to the relevant week, distinct from lecture materials.

**Why this priority**: Distinguishing homework from materials is essential for future AI features (e.g., "help me with this homework using this week's lectures"). It also helps students quickly find their assignments.

**Acceptance Scenarios**:

1. **Given** a student is viewing a week, **When** they click "Add Homework" or drag a PDF onto the homework area, **Then** a file picker opens (or the drop is accepted) for PDF files only.
2. **Given** a student uploads a homework PDF, **When** the upload completes, **Then** it appears in a visually distinct "Homework" section within the week (separate from materials).
3. **Given** a student uploads homework, **When** they provide an optional label (e.g., "Problem Set 3"), **Then** the label is displayed alongside the file name.
4. **Given** homework has been uploaded, **When** the student clicks on it, **Then** the PDF opens for viewing.
5. **Given** a student wants to remove homework, **When** they delete it, **Then** the file is removed from storage and the reference is deleted (with confirmation).

---

### User Story 5 — Create a Document Inside a Course (Priority: P1)

A student wants to create a Typenote document that lives within a course. This document inherits the course context, so future AI features can reference the course's materials when assisting.

**Why this priority**: Documents are the student's workspace. Creating documents within a course is what connects student work to course materials — the bridge between content and context.

**Acceptance Scenarios**:

1. **Given** a student is viewing a course, **When** they click "New Document", **Then** a new Typenote document is created and associated with that course.
2. **Given** a document has been created inside a course, **When** the student opens it, **Then** the editor opens normally (same TipTap editor experience).
3. **Given** a document belongs to a course, **When** the student views the document, **Then** there is a visual indicator showing which course it belongs to (e.g., breadcrumb or badge).
4. **Given** a student views a course, **When** they look at the course overview, **Then** they can see all documents created within the course listed separately from uploaded materials.

---

### User Story 6 — Navigate Courses on Dashboard (Priority: P1)

A student wants to see and navigate their courses from the main dashboard and sidebar.

**Why this priority**: Discoverability. If courses aren't easy to find and navigate, students won't use them.

**Acceptance Scenarios**:

1. **Given** a student has created courses, **When** they view the dashboard, **Then** courses appear as visually distinct cards (different from folder cards — e.g., different icon, badge, or styling).
2. **Given** a student clicks on a course card, **When** the course opens, **Then** they see the course overview: course metadata at top, weeks listed below with their materials, homework, and documents.
3. **Given** a student has courses, **When** they view the sidebar, **Then** courses are the primary navigation items (above folders) with a distinct icon.
4. **Given** a course is inside a folder, **When** the student navigates to that folder, **Then** the course appears alongside other items in the folder.

---

### Edge Cases

- What happens when a student deletes a course? All weeks, uploaded materials (files in storage), homework, and associated documents are deleted. A confirmation dialog warns about this destructive action.
- What happens when a student moves a course into a folder or out of a folder? The course retains its internal structure (weeks, materials, homework) and only its parent reference changes.
- What happens when a student creates a document inside a course and also assigns it to a week? For MVP, documents belong to the course level, not to specific weeks. Week-level document association is a future enhancement.
- What happens when upload fails mid-way (network error)? The partially uploaded file is cleaned up, and the student sees an error with the option to retry.
- What happens when a student has no courses? The dashboard shows an empty state with a prominent "Create your first course" call-to-action.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow users to create a course with a name (required) and color (optional).
- **FR-002**: Courses MUST be creatable at the dashboard root level or inside any existing folder.
- **FR-003**: System MUST allow users to add weeks to a course, with auto-incrementing week numbers.
- **FR-004**: Each week MUST support optional metadata: topic/title.
- **FR-005**: System MUST allow users to upload PDF files (up to 50MB) as materials to a specific week.
- **FR-006**: System MUST allow users to upload PDF files (up to 50MB) as homework to a specific week.
- **FR-007**: Materials and homework MUST be stored as separate categories within a week, visually distinguished in the UI.
- **FR-008**: System MUST support both drag-and-drop and file picker for PDF uploads.
- **FR-009**: System MUST show upload progress for file uploads.
- **FR-010**: System MUST validate file type (PDF only) and size (50MB max) before upload, with clear error messages on rejection.
- **FR-011**: System MUST store uploaded files in object storage with the original file preserved.
- **FR-012**: Users MUST be able to view uploaded PDFs (inline preview or new tab).
- **FR-013**: Users MUST be able to delete uploaded materials and homework, with confirmation dialogs.
- **FR-014**: System MUST allow creating Typenote documents associated with a course.
- **FR-015**: Courses MUST be visually distinct from folders on the dashboard and in the sidebar.
- **FR-016**: Weeks MUST display in sequential order within a course view.
- **FR-017**: Deleting a course MUST cascade-delete all weeks, uploaded files (from storage), and associated documents, with a confirmation warning.
- **FR-018**: System MUST enforce data isolation — users can only see and manage their own courses and materials (Row-Level Security).
- **FR-019**: Each uploaded file MUST support an optional user-provided label.

### Key Entities

- **Course**: A structured container representing an academic course. Key attributes: name, color, parent folder (nullable), user ownership.
- **CourseWeek**: A sequential unit within a course representing a week of study. Key attributes: week number, topic/title, parent course.
- **CourseMaterial**: A reference to an uploaded file attached to a week. Key attributes: file path in storage, original file name, user-provided label, file size, category (material or homework), parent week.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A student can create a course, add 3 weeks with topics, and upload a PDF to each week in under 3 minutes.
- **SC-002**: 100% of uploaded PDFs are viewable after upload without re-downloading from an external source.
- **SC-003**: Course structure (weeks, materials, homework) persists across sessions — verified by logging out and back in.
- **SC-004**: Courses are visually distinguishable from folders at a glance on the dashboard.
- **SC-005**: File uploads of up to 50MB complete successfully with visible progress indication.
- **SC-006**: Deleting a course removes all associated data (weeks, files, documents) with zero orphaned records or files.
- **SC-007**: No user can view or access another user's courses or uploaded materials.

## Scope Boundaries

### In Scope (MVP)

- Course CRUD (create, read, update, delete)
- Week CRUD within courses
- PDF file upload to weeks (materials and homework categories)
- File storage in Supabase Storage
- Document creation within a course
- Dashboard and sidebar navigation for courses
- Drag-and-drop and file picker upload
- Upload progress indicator
- File type and size validation

### Out of Scope (Future)

- AI context integration (using materials to assist with homework)
- Text extraction from PDFs
- PPTX/PPT import
- Image import (PNG, JPG, HEIC)
- Moodle / Google Classroom integration
- Auto-sync with LMS platforms
- OCR on scanned documents
- AI-powered syllabus parsing to auto-generate weeks
- Week-level document association (documents belong to course, not specific weeks)
- Practice exam generation from course materials
- Bulk week creation

## Clarifications

### Session 2026-03-08

- Q: What should be the primary navigation in the sidebar? → A: Courses should be the main items in the sidebar, not folders.
- Q: Are date fields needed for weeks? → A: No, remove start_date and end_date from weeks.
- Q: Is semester needed for courses? → A: No, remove semester field for now.
- Q: Is course code needed for courses? → A: No, remove course code field for now.

## Assumptions

- Supabase Storage can be configured with RLS policies matching the existing auth pattern.
- The existing folder hierarchy system can accommodate course objects as a new entity type without breaking the current folder/document navigation.
- PDF viewing can be handled by the browser's native PDF viewer (opening in a new tab) for MVP, without requiring an embedded viewer.
- The 50MB file size limit is sufficient for typical lecture slides and homework PDFs.
- The existing `documents` table can be extended with a `course_id` foreign key to associate documents with courses.
