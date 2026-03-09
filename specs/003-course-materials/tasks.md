# Tasks: Course Structure & Material Upload

**Feature**: 003-course-materials
**Branch**: `003-course-materials`
**Generated**: 2026-03-08
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

- **Total tasks**: 35
- **Phases**: 7 (Setup → Foundational → US1+US6 → US2 → US3+US4 → US5 → Polish)
- **Parallel opportunities**: 12 tasks marked [P]
- **User stories**: 6 (US1-US6)

## Dependencies

```
Phase 1 (Setup) ──→ Phase 2 (Foundational) ──→ Phase 3 (US1+US6) ──→ Phase 4 (US2)
                                                       │                    │
                                                       ▼                    ▼
                                                 Phase 6 (US5)     Phase 5 (US3+US4)
                                                       │                    │
                                                       └──────→ Phase 7 ◀──┘
```

**Notes**:
- US3 and US4 share 95% of infrastructure (same upload component, same material-item). US4 is US3 with `category: 'homework'`. They are combined into one phase.
- US6 (navigation) is inseparable from US1 (create course) — you need the card to see the course. Combined into one phase.
- US5 (document in course) only depends on US1 (course exists), not on US2 (weeks).

---

## Phase 1: Setup

**Goal**: Database schema, TypeScript types, and seed data ready for all subsequent work.

- [x] T001 Create database migration for courses, course_weeks, and course_materials tables in `supabase/migrations/00003_create_courses.sql` — include all columns from data-model.md, indexes, RLS policies, and updated_at triggers
- [x] T002 Create database migration to add course_id column to documents table in `supabase/migrations/00004_add_document_course_id.sql` — nullable FK to courses(id) with cascade delete, mutual exclusion check constraint with folder_id, and index on (user_id, course_id)
- [x] T003 Create database migration for Supabase Storage bucket in `supabase/migrations/00005_create_storage_bucket.sql` — create `course-materials` bucket (private, 50MiB, PDF only) with path-based RLS policies for SELECT, INSERT, DELETE
- [x] T004 [P] Add Course, CourseWeek, and CourseMaterial TypeScript interfaces to `src/types/database.ts` — match column names and types exactly from data-model.md, update Document interface with optional course_id
- [x] T005 [P] Update `supabase/seed.sql` with test course data — add 1 test course (Calculus I) with 3 weeks, 2 materials and 1 homework PDF reference, using predictable UUIDs (30000000-... for courses, 40000000-... for weeks, 50000000-... for materials) and ON CONFLICT DO NOTHING

---

## Phase 2: Foundational

**Goal**: All server actions, query functions, and the file upload hook are implemented. The entire data layer is ready before any UI work begins.

**Prerequisite**: Phase 1 complete.

- [x] T006 [P] Create course server actions in `src/lib/actions/courses.ts` — implement createCourse, updateCourse, deleteCourse (with storage cleanup), and moveCourse per contracts/server-actions.md
- [x] T007 [P] Create course query functions in `src/lib/queries/courses.ts` — implement getCoursesByFolder, getCourse, and getCourseBreadcrumbs per contracts/server-actions.md
- [x] T008 [P] Create course-week server actions in `src/lib/actions/course-weeks.ts` — implement createCourseWeek (with auto-incrementing week_number), updateCourseWeek, and deleteCourseWeek (with storage cleanup) per contracts/server-actions.md
- [x] T009 [P] Create course-week query functions in `src/lib/queries/course-weeks.ts` — implement getWeeksByCourse and getWeek per contracts/server-actions.md
- [x] T010 [P] Create course-material server actions in `src/lib/actions/course-materials.ts` — implement createCourseMaterial, updateCourseMaterial, and deleteCourseMaterial (with storage file removal) per contracts/server-actions.md
- [x] T011 [P] Create course-material query functions in `src/lib/queries/course-materials.ts` — implement getMaterialsByWeek and getMaterialsByWeekAndCategory per contracts/server-actions.md
- [x] T012 [P] Add getDocumentsByCourse query to `src/lib/queries/documents.ts` — new function returning documents where course_id matches, ordered by position
- [x] T013 [P] Create file upload hook in `src/hooks/use-file-upload.ts` — manage uploading, progress, and error state; upload via supabase.storage.from(bucket).upload(); validate file type (PDF) and size (50MB) before upload

---

## Phase 3: US1 + US6 — Create a Course & Navigate Courses

**Goal**: Students can create courses (at root or in folders), see them on the dashboard as distinct cards, navigate to a course view page, and find courses in the sidebar.

**Prerequisite**: Phase 2 complete.

**Independent test**: Create a course from the dashboard → verify it appears as a card distinct from folders → click to open course view page → verify breadcrumbs and empty state → create course inside a folder → verify it appears there.

- [x] T014 [US1] Create CourseDialog component in `src/components/dashboard/course-dialog.tsx` — dual-mode create/edit dialog with name (required), code (optional), semester (optional), color picker (8 presets); calls createCourse or updateCourse; follows FolderDialog pattern
- [x] T015 [US1] Create CourseCard component in `src/components/dashboard/course-card.tsx` — client component with graduation-cap icon, color-coded, shows name + code badge + semester label, dropdown menu (Edit, Delete with confirmation), onClick navigates to /dashboard/courses/{id}; follows FolderCard pattern
- [x] T016 [US6] Modify dashboard page `src/app/(dashboard)/dashboard/page.tsx` — add courses query (getCoursesByFolder with null), render CourseCard components in grid alongside folders, add "New Course" button with CourseDialog
- [x] T017 [US6] Modify folder page `src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx` — add courses query (getCoursesByFolder with folderId), render CourseCard components alongside subfolders and documents
- [x] T018 [US6] Create course view page in `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — server component fetching course, weeks, and documents; breadcrumb navigation (Home > [Folder?] > Course Name); header with course metadata; empty state for weeks and documents; "Add Week" and "New Document" buttons
- [x] T019 [US6] Modify sidebar in `src/components/dashboard/sidebar-folder-tree.tsx` — fetch courses alongside folders, render course nodes with distinct icon, support courses nested inside folders, onClick navigates to /dashboard/courses/{id}

---

## Phase 4: US2 — Add Weeks to a Course

**Goal**: Students can add, edit, and delete weeks within a course view. Weeks display in sequential order as expandable sections.

**Prerequisite**: Phase 3 complete (course view page exists).

**Independent test**: Open a course → click "Add Week" → verify week appears with auto-number → add topic and dates → add 3 weeks → verify sequential order → edit a week's topic → delete a week with confirmation.

- [x] T020 [US2] Create WeekDialog component in `src/components/dashboard/week-dialog.tsx` — create/edit dialog with topic (optional), start_date (optional), end_date (optional); auto-increments week_number on create; calls createCourseWeek or updateCourseWeek
- [x] T021 [US2] Create WeekSection component in `src/components/dashboard/week-section.tsx` — expandable section with header "Week {N}: {topic}", date range display, Edit/Delete dropdown (delete with confirmation and storage cleanup), materials subsection placeholder, homework subsection placeholder; default expanded
- [x] T022 [US2] Integrate WeekSection into course view page `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — fetch weeks via getWeeksByCourse, render WeekSection for each week in order, wire "Add Week" button to WeekDialog

---

## Phase 5: US3 + US4 — Upload Materials & Homework to a Week

**Goal**: Students can upload PDFs as materials or homework to any week via drag-and-drop or file picker. Uploaded files are viewable, deletable, and stored with progress indication.

**Prerequisite**: Phase 4 complete (weeks exist in course view).

**Independent test**: Open a course with weeks → drag PDF onto materials area → verify progress indicator → verify file appears in materials list → click to view PDF in new tab → upload homework PDF → verify it appears in separate homework section → try uploading non-PDF → verify rejection → try uploading >50MB → verify rejection → delete a material → verify removed from list and storage.

- [x] T023 [US3] Create MaterialUpload component in `src/components/dashboard/material-upload.tsx` — accepts category prop ('material' | 'homework'), weekId, courseId, userId; drag-and-drop zone with onDragOver/onDrop + hidden file input; validates PDF type and 50MB size; uses useFileUpload hook for upload; calls createCourseMaterial server action on success; shows progress bar during upload; toast on error
- [x] T024 [US3] Create MaterialItem component in `src/components/dashboard/material-item.tsx` — displays file icon, label (or file_name fallback), formatted file size; click generates signed URL and opens PDF in new tab; delete button with confirmation dialog calls deleteCourseMaterial; optional inline label edit calls updateCourseMaterial
- [x] T025 [US3] [US4] Integrate MaterialUpload and MaterialItem into WeekSection `src/components/dashboard/week-section.tsx` — add materials subsection (fetched via getMaterialsByWeekAndCategory with 'material') with MaterialUpload drop zone and list of MaterialItem; add homework subsection (same with 'homework') with separate MaterialUpload and MaterialItem list; visually distinguish the two sections

---

## Phase 6: US5 — Create a Document Inside a Course

**Goal**: Students can create Typenote documents associated with a course. Documents appear in the course view and show a course indicator.

**Prerequisite**: Phase 3 complete (course view page exists).

**Independent test**: Open a course → click "New Document" → fill title and subject → verify document created and appears in course view → open the document → verify editor works normally → verify breadcrumb/badge shows course name → go back to course → verify document listed.

- [x] T026 [US5] Modify CreateDocumentDialog in `src/components/dashboard/create-document-dialog.tsx` — accept optional course_id prop; when provided, pass course_id to createDocument and set folder_id to null; after creation, navigate to document editor
- [x] T027 [US5] Modify createDocument server action in `src/lib/actions/documents.ts` — accept optional course_id in data parameter; include course_id in insert payload; enforce mutual exclusion (if course_id set, folder_id must be null)
- [x] T028 [US5] Display course documents in course view page `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — fetch documents via getDocumentsByCourse, render DocumentCard grid above weeks section; wire "New Document" button to CreateDocumentDialog with course_id
- [x] T029 [US5] Add course badge to document editor page `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — if document has course_id, fetch course name and display as breadcrumb or badge near the document title

---

## Phase 7: Polish & Cross-Cutting Concerns

**Goal**: Tests, edge cases, and final validation.

**Prerequisite**: All previous phases complete.

- [x] T030 Write unit tests for CourseCard in `src/components/dashboard/course-card.test.tsx` — test rendering (name, code, color), navigation on click, edit/delete dropdown actions, keyboard accessibility
- [x] T031 [P] Write unit tests for CourseDialog in `src/components/dashboard/course-dialog.test.tsx` — test create mode (default values, submission), edit mode (pre-filled values, update), validation (empty name), color picker selection
- [x] T032 [P] Write unit tests for WeekSection in `src/components/dashboard/week-section.test.tsx` — test rendering (week number, topic, dates), expand/collapse toggle, edit/delete actions, materials and homework subsections
- [x] T033 [P] Write unit tests for MaterialUpload in `src/components/dashboard/material-upload.test.tsx` — test file validation (PDF only, 50MB limit), drag-and-drop events, file picker trigger, progress display, error handling
- [x] T034 Verify cascade delete behavior end-to-end — manually test: create course with weeks, materials, homework, and documents → delete course → verify all records removed from DB and all files removed from storage → check for zero orphaned files
- [x] T035 Run full test suite and lint check — execute `pnpm test`, `pnpm lint`, `pnpm build` to verify no regressions across the entire project

---

## Implementation Strategy

### MVP Scope

**Phases 1-3 (T001-T019)** form the MVP — courses exist, are visible, and navigable. This is the minimum viable increment that delivers user value and can be demoed.

### Incremental Delivery

1. **MVP**: Phases 1-3 → courses on dashboard (demo: create and navigate courses)
2. **Week structure**: Phase 4 → weekly organization within courses
3. **File uploads**: Phase 5 → the core value prop (material + homework upload)
4. **Document association**: Phase 6 → connecting student work to courses
5. **Quality**: Phase 7 → tests and polish

### Parallel Execution Opportunities

**Within Phase 1**: T004 and T005 can run in parallel (types and seed data are independent)
**Within Phase 2**: T006-T013 can ALL run in parallel (independent files, no cross-dependencies)
**Within Phase 3**: T014 and T015 can run in parallel (dialog and card are independent components)
**Within Phase 5**: T023 and T024 can run in parallel (upload component and item component are independent)
**Within Phase 7**: T030-T033 can all run in parallel (independent test files)

### Task Count by User Story

| Story | Description                     | Tasks | Phase |
| ----- | ------------------------------- | ----- | ----- |
| —     | Setup                           | 5     | 1     |
| —     | Foundational (data layer)       | 8     | 2     |
| US1   | Create a Course                 | 2     | 3     |
| US6   | Navigate Courses on Dashboard   | 4     | 3     |
| US2   | Add Weeks to a Course           | 3     | 4     |
| US3   | Upload Materials to a Week      | 3     | 5     |
| US4   | Upload Homework to a Week       | (combined with US3) | 5 |
| US5   | Create Document in Course       | 4     | 6     |
| —     | Polish & Testing                | 6     | 7     |
