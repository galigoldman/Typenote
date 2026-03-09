# Data Model: Course Structure & Material Upload

**Feature**: 003-course-materials
**Date**: 2026-03-08

## New Entities

### Course

A structured container representing an academic course, organized by weeks.

| Column     | Type         | Default          | Nullable | Description                                      |
| ---------- | ------------ | ---------------- | -------- | ------------------------------------------------ |
| id         | uuid         | uuid_generate_v4 | no       | Primary key                                      |
| user_id    | uuid         | —                | no       | FK → profiles(id), on delete cascade             |
| folder_id  | uuid         | —                | yes      | FK → folders(id), on delete set null (optional)  |
| name       | text         | 'Untitled Course'| no       | Course display name                              |
| code       | text         | —                | yes      | Course code (e.g., "CS101", "MATH201")           |
| semester   | text         | —                | yes      | Semester label (e.g., "Fall 2026")               |
| color      | text         | '#6B7280'        | no       | Hex color for visual identity                    |
| position   | integer      | 0                | no       | Sort order within parent                         |
| created_at | timestamptz  | now()            | no       | Creation timestamp                               |
| updated_at | timestamptz  | now()            | no       | Last modification timestamp                      |

**Indexes**:
- `courses_user_folder_idx` on `(user_id, folder_id)` — query courses by user and optional folder

**RLS**: Four CRUD policies, `auth.uid() = user_id`

**Trigger**: `courses_updated_at` → `handle_updated_at()`

---

### CourseWeek

A sequential unit within a course representing a week of study.

| Column     | Type         | Default          | Nullable | Description                                      |
| ---------- | ------------ | ---------------- | -------- | ------------------------------------------------ |
| id         | uuid         | uuid_generate_v4 | no       | Primary key                                      |
| course_id  | uuid         | —                | no       | FK → courses(id), on delete cascade              |
| user_id    | uuid         | —                | no       | FK → profiles(id), on delete cascade             |
| week_number| integer      | —                | no       | Sequential week number (1, 2, 3, ...)            |
| topic      | text         | —                | yes      | Week topic/title (e.g., "Derivatives")           |
| start_date | date         | —                | yes      | Optional start date                              |
| end_date   | date         | —                | yes      | Optional end date                                |
| created_at | timestamptz  | now()            | no       | Creation timestamp                               |
| updated_at | timestamptz  | now()            | no       | Last modification timestamp                      |

**Indexes**:
- `course_weeks_course_idx` on `(course_id, week_number)` — query weeks by course, sorted

**Constraints**:
- `unique (course_id, week_number)` — no duplicate week numbers within a course

**RLS**: Four CRUD policies, `auth.uid() = user_id`

**Trigger**: `course_weeks_updated_at` → `handle_updated_at()`

---

### CourseMaterial

A reference to an uploaded file attached to a week, categorized as material or homework.

| Column        | Type         | Default          | Nullable | Description                                      |
| ------------- | ------------ | ---------------- | -------- | ------------------------------------------------ |
| id            | uuid         | uuid_generate_v4 | no       | Primary key                                      |
| week_id       | uuid         | —                | no       | FK → course_weeks(id), on delete cascade         |
| user_id       | uuid         | —                | no       | FK → profiles(id), on delete cascade             |
| category      | text         | —                | no       | 'material' or 'homework'                         |
| storage_path  | text         | —                | no       | Path in Supabase Storage bucket                  |
| file_name     | text         | —                | no       | Original file name                               |
| label         | text         | —                | yes      | User-provided label                              |
| file_size     | bigint       | —                | no       | File size in bytes                               |
| mime_type     | text         | —                | no       | File MIME type (e.g., 'application/pdf')          |
| created_at    | timestamptz  | now()            | no       | Creation timestamp                               |
| updated_at    | timestamptz  | now()            | no       | Last modification timestamp                      |

**Indexes**:
- `course_materials_week_idx` on `(week_id, category)` — query materials by week and type
- `course_materials_user_idx` on `(user_id)` — support RLS lookups

**Constraints**:
- `check (category in ('material', 'homework'))` — enforce valid categories

**RLS**: Four CRUD policies, `auth.uid() = user_id`

**Trigger**: `course_materials_updated_at` → `handle_updated_at()`

---

## Modified Entities

### Document (existing)

Add one new column to associate documents with courses.

| Column    | Type | Default | Nullable | Description                                      |
| --------- | ---- | ------- | -------- | ------------------------------------------------ |
| course_id | uuid | —       | yes      | FK → courses(id), on delete cascade (new)        |

**Index update**: Add `documents_user_course_idx` on `(user_id, course_id)` for querying documents within a course.

**Constraint**: A document can have `folder_id` OR `course_id` set, but not both. Enforced via check constraint: `check (NOT (folder_id IS NOT NULL AND course_id IS NOT NULL))`.

---

## Storage Bucket

### course-materials

| Setting          | Value                        |
| ---------------- | ---------------------------- |
| Bucket name      | course-materials             |
| Public            | false                        |
| File size limit  | 50MiB                        |
| Allowed MIME types| application/pdf             |

**Path structure**: `{user_id}/{course_id}/{week_id}/{original_filename}`

**Storage RLS policies**:
- SELECT: `auth.uid()::text = (storage.foldername(name))[1]`
- INSERT: `auth.uid()::text = (storage.foldername(name))[1]`
- DELETE: `auth.uid()::text = (storage.foldername(name))[1]`

---

## Entity Relationships

```
profiles (1) ──────< courses (many)
                       │
folders (1) ──? ───────┘  (optional folder_id, on delete set null)
                       │
courses (1) ──────< course_weeks (many)
                       │
course_weeks (1) ──< course_materials (many)
                       │
courses (1) ──────< documents (many, via course_id)
```

## State Transitions

```
[No Course] --(create)--> [Course Exists]
[Course] --(add week)--> [Course + Week(s)]
[Week] --(upload PDF)--> [Week + Material(s)]
[Week] --(upload PDF as homework)--> [Week + Homework(s)]
[Course] --(create document)--> [Course + Document(s)]
[Course] --(delete)--> [All weeks, materials (DB + storage), documents deleted]
[Week] --(delete)--> [All materials (DB + storage) for that week deleted]
[Material] --(delete)--> [DB record + storage file removed]
```
