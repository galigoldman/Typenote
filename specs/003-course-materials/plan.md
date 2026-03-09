# Implementation Plan: Course Structure & Material Upload

**Branch**: `003-course-materials` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-course-materials/spec.md`

## Summary

Add a structured course system to Typenote so students can organize academic work by course and week. Courses are new first-class entities (distinct from folders) that contain weeks, and each week holds uploaded PDF materials (lectures) and homework (assignments). Students can create Typenote documents inside a course. Files are stored in Supabase Storage with RLS. This builds the data foundation for future AI features that will use course materials as context.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+
**Primary Dependencies**: Next.js 16.1.6, Supabase SSR 0.9.0, TailwindCSS 4, shadcn/ui
**Storage**: PostgreSQL via Supabase (3 new tables, 1 modified) + Supabase Storage (1 new bucket)
**Testing**: Vitest 4.0.18 + React Testing Library + Playwright 1.58.2
**Target Platform**: Web (desktop browsers)
**Project Type**: Web application (Next.js App Router)
**Constraints**: Must integrate with existing folder/document navigation without breaking it
**Scale/Scope**: Single-user CRUD with file upload; no real-time sync needed for courses

## Constitution Check

_Constitution not configured for this project. No gates to evaluate._

**Post-design re-check**: N/A — no constitution constraints defined.

## Project Structure

### Documentation (this feature)

```text
specs/003-course-materials/
├── plan.md                          # This file
├── spec.md                          # Feature specification
├── research.md                      # Phase 0: Research findings
├── data-model.md                    # Phase 1: Data model (3 new tables + 1 modified)
├── quickstart.md                    # Phase 1: Developer quickstart
├── contracts/
│   └── server-actions.md            # Server action + query contracts
└── checklists/
    └── requirements.md              # Spec quality checklist
```

### Source Code (new + modified files)

```text
supabase/
├── migrations/
│   ├── 00003_create_courses.sql            # NEW: courses, course_weeks, course_materials tables
│   ├── 00004_add_document_course_id.sql    # NEW: Add course_id to documents
│   └── 00005_create_storage_bucket.sql     # NEW: Storage bucket + RLS
└── seed.sql                                # MODIFIED: Add test courses, weeks, materials

src/
├── types/
│   └── database.ts                         # MODIFIED: Add Course, CourseWeek, CourseMaterial interfaces
├── lib/
│   ├── actions/
│   │   ├── courses.ts                      # NEW: Course CRUD server actions
│   │   ├── course-weeks.ts                 # NEW: Week CRUD server actions
│   │   └── course-materials.ts             # NEW: Material CRUD + storage cleanup
│   └── queries/
│       ├── courses.ts                      # NEW: Course query functions
│       ├── course-weeks.ts                 # NEW: Week query functions
│       ├── course-materials.ts             # NEW: Material query functions
│       └── documents.ts                    # MODIFIED: Add getDocumentsByCourse
├── components/
│   └── dashboard/
│       ├── course-card.tsx                 # NEW: Course card for dashboard grid
│       ├── course-card.test.tsx            # NEW: Tests for course card
│       ├── course-dialog.tsx               # NEW: Create/edit course dialog
│       ├── course-dialog.test.tsx          # NEW: Tests for course dialog
│       ├── week-section.tsx                # NEW: Week display with expand/collapse
│       ├── week-section.test.tsx           # NEW: Tests for week section
│       ├── week-dialog.tsx                 # NEW: Create/edit week dialog
│       ├── material-upload.tsx             # NEW: Drag-and-drop PDF upload
│       ├── material-upload.test.tsx        # NEW: Tests for upload component
│       ├── material-item.tsx               # NEW: Material list item with actions
│       ├── sidebar-folder-tree.tsx         # MODIFIED: Add course nodes
│       └── create-document-dialog.tsx      # MODIFIED: Support course_id
├── app/
│   └── (dashboard)/
│       └── dashboard/
│           ├── page.tsx                    # MODIFIED: Add courses to grid
│           └── courses/
│               └── [courseId]/
│                   └── page.tsx            # NEW: Course view page
└── hooks/
    └── use-file-upload.ts                  # NEW: File upload hook with progress
```

## Phase 0: Research (Complete)

All research documented in [research.md](./research.md). Key findings:

| Topic                | Finding                                                                | Decision                                                                  |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Database schema      | Existing pattern: UUID PKs, user_id FK, RLS, updated_at triggers       | Follow exact same pattern for 3 new tables                                |
| Supabase Storage     | Enabled in config.toml, no buckets configured, 50MiB limit already set | Create `course-materials` bucket with PDF-only MIME restriction           |
| File upload          | Supabase browser client supports direct upload with auth               | Client-side upload directly to storage, server action for metadata record |
| Course placement     | Dashboard uses card grid + sidebar tree, both filter by parent_id      | Add courses to both, visually distinct from folders                       |
| Document association | Existing nullable folder_id pattern works for optional course_id       | Add course_id to documents table, mutual exclusion with folder_id         |
| Cascade deletes      | DB cascades handle records, but storage files need explicit cleanup    | Server actions remove storage files before DB delete                      |

## Phase 1: Design

### 1.1 Data Model

Documented in [data-model.md](./data-model.md).

**New tables**:

- `courses` — name, code, semester, color, optional folder_id
- `course_weeks` — week_number, topic, dates, belongs to course
- `course_materials` — storage_path, file_name, category (material/homework), belongs to week

**Modified tables**:

- `documents` — add nullable `course_id` with cascade delete, mutual exclusion constraint with `folder_id`

**Storage**:

- `course-materials` bucket — private, PDF only, 50MiB limit, path-based RLS

### 1.2 Interface Contracts

Documented in [contracts/server-actions.md](./contracts/server-actions.md).

**Server actions**: 10 total (4 course, 3 week, 3 material)
**Query functions**: 8 total (3 course, 2 week, 2 material, 1 modified document)

### 1.3 Component Architecture

#### Course Card (`course-card.tsx`)

```
CourseCard (client component)
  ├── Visual: Card with graduation-cap icon, color-coded
  ├── Content: Course name, code badge, semester label
  ├── Actions: Dropdown menu (Edit, Delete)
  ├── onClick: router.push(/dashboard/courses/{id})
  └── Pattern: Same as FolderCard with course-specific fields
```

#### Course Dialog (`course-dialog.tsx`)

```
CourseDialog (client component)
  ├── Dual-mode: create / edit (determined by course prop)
  ├── Form fields:
  │   ├── Name input (required)
  │   ├── Code input (optional)
  │   ├── Semester input (optional)
  │   └── Color picker (8 presets)
  ├── Submit: createCourse() or updateCourse()
  └── Pattern: Same as FolderDialog with additional fields
```

#### Course View Page (`courses/[courseId]/page.tsx`)

```
CoursePage (server component)
  ├── Breadcrumb: Home > [Folder?] > Course Name
  ├── Header: Course name, code, semester, "New Document" + "Add Week" buttons
  ├── Documents section: Grid of document cards (course documents)
  └── Weeks section: Sequential list of WeekSection components
```

#### Week Section (`week-section.tsx`)

```
WeekSection (client component)
  ├── Header: "Week {N}: {topic}" with expand/collapse toggle
  ├── Metadata: Date range (if set)
  ├── Actions: Edit, Delete dropdown
  ├── Materials subsection:
  │   ├── List of MaterialItem components
  │   └── "Add Material" button / drop zone
  ├── Homework subsection:
  │   ├── List of MaterialItem components
  │   └── "Add Homework" button / drop zone
  └── Expand/collapse: Local state, default expanded
```

#### Material Upload (`material-upload.tsx`)

```
MaterialUpload (client component)
  ├── Trigger: Button or drop zone
  ├── Drag-and-drop: onDragOver, onDrop handlers
  ├── File picker: Hidden input[type=file] accept=".pdf"
  ├── Validation: PDF only, 50MB max (client-side)
  ├── Upload flow:
  │   1. Validate file
  │   2. Generate storage path: {userId}/{courseId}/{weekId}/{filename}
  │   3. Upload to Supabase Storage (browser client)
  │   4. Call createCourseMaterial() server action with metadata
  │   5. Show progress during upload
  └── Error handling: Toast on failure, retry option
```

#### Material Item (`material-item.tsx`)

```
MaterialItem (client component)
  ├── Display: File icon, label (or file_name), file size
  ├── View: Click opens PDF in new tab (signed URL)
  ├── Delete: Confirmation dialog → deleteCourseMaterial()
  └── Edit label: Inline edit on click
```

#### File Upload Hook (`use-file-upload.ts`)

```
useFileUpload(bucketName: string)
  ├── State: uploading, progress, error
  ├── upload(file, path): Promise<string>
  │   ├── Creates Supabase browser client
  │   ├── Calls storage.from(bucket).upload(path, file)
  │   ├── Tracks progress via onUploadProgress
  │   └── Returns storage path on success
  └── reset(): Clears state
```

### 1.4 Integration Flow

```
=== CREATE COURSE ===
1. User clicks "New Course" on dashboard (or in folder)
   └── CourseDialog opens
2. User fills name, optional code/semester, picks color
   └── Submit → createCourse() server action
3. Course card appears in dashboard grid
   └── revalidatePath('/dashboard')

=== ADD WEEKS ===
1. User opens course → clicks "Add Week"
   └── WeekDialog opens (or inline creation)
2. User optionally adds topic, dates
   └── Submit → createCourseWeek() (auto-assigns week_number)
3. New WeekSection appears in course view

=== UPLOAD MATERIAL ===
1. User drags PDF onto week's material drop zone (or clicks "Add Material")
   └── Client validates: PDF?, <50MB?
2. File uploads directly to Supabase Storage
   └── supabase.storage.from('course-materials').upload(path, file)
3. On success, metadata saved to DB
   └── createCourseMaterial() server action
4. MaterialItem appears in week's material list

=== CREATE DOCUMENT IN COURSE ===
1. User clicks "New Document" in course view
   └── CreateDocumentDialog opens with course_id pre-set
2. Document created with course_id set, folder_id null
   └── createDocument() server action (modified)
3. Document appears in course's document section

=== DELETE COURSE (cascade) ===
1. User clicks Delete on course card → confirmation dialog
2. Server action:
   a. List all storage files under {user_id}/{course_id}/ prefix
   b. Remove files from Supabase Storage
   c. Delete course record (DB cascade handles weeks, materials records, documents)
3. Course disappears from dashboard
```

## Complexity Tracking

- 3 new database tables + 1 modified
- 1 new storage bucket
- 3 new server action files (10 actions total)
- 3 new query files (8 functions total)
- ~8 new UI components
- ~3 modified UI components
- 1 new hook
- 1 new route
- 0 new external dependencies
