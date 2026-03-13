# Data Model: Moodle Import & Sync

**Feature**: `004-moodle-import-sync` | **Date**: 2026-03-11

## Entity Relationship Overview

```
moodle_instances (shared)
  └── moodle_courses (shared)
        └── moodle_sections (shared)
              └── moodle_files (shared, deduped)

profiles (existing)
  ├── user_moodle_connections → moodle_instances
  ├── user_course_syncs → moodle_courses, courses (existing)
  └── user_file_imports → moodle_files, user_course_syncs
```

## Shared Tables (any authenticated user can read)

### moodle_instances

One per university Moodle deployment. Identified by domain.

| Field      | Type        | Constraints                    | Description                                          |
| ---------- | ----------- | ------------------------------ | ---------------------------------------------------- |
| id         | uuid        | PK, default uuid_generate_v4() |                                                      |
| domain     | text        | UNIQUE, NOT NULL               | e.g., `moodle.tau.ac.il`                             |
| name       | text        |                                | Human-readable name (auto-detected or user-provided) |
| created_at | timestamptz | NOT NULL, default now()        |                                                      |
| updated_at | timestamptz | NOT NULL, default now()        |                                                      |

**RLS**: SELECT for any authenticated user. INSERT/UPDATE/DELETE via service role only.

### moodle_courses

Canonical course from a Moodle instance. Shared across all students.

| Field            | Type        | Constraints                                           | Description                                 |
| ---------------- | ----------- | ----------------------------------------------------- | ------------------------------------------- |
| id               | uuid        | PK, default uuid_generate_v4()                        |                                             |
| instance_id      | uuid        | FK → moodle_instances(id) ON DELETE CASCADE, NOT NULL |                                             |
| moodle_course_id | text        | NOT NULL                                              | Moodle's own course ID (from URL `?id=123`) |
| name             | text        | NOT NULL                                              | Course name as shown on Moodle              |
| moodle_url       | text        |                                                       | Full URL to the course page                 |
| created_at       | timestamptz | NOT NULL, default now()                               |                                             |
| updated_at       | timestamptz | NOT NULL, default now()                               |                                             |

**Unique**: `(instance_id, moodle_course_id)`
**RLS**: SELECT for any authenticated user. INSERT/UPDATE/DELETE via service role only.

### moodle_sections

Sections within a course. Preserves Moodle's native ordering and naming.

| Field             | Type        | Constraints                                         | Description                                                |
| ----------------- | ----------- | --------------------------------------------------- | ---------------------------------------------------------- |
| id                | uuid        | PK, default uuid_generate_v4()                      |                                                            |
| course_id         | uuid        | FK → moodle_courses(id) ON DELETE CASCADE, NOT NULL |                                                            |
| moodle_section_id | text        |                                                     | Moodle's own section identifier (if available)             |
| title             | text        |                                                     | Section title (e.g., "Week 1 - Introduction" or "General") |
| position          | integer     | NOT NULL, default 0                                 | Preserves Moodle ordering                                  |
| created_at        | timestamptz | NOT NULL, default now()                             |                                                            |
| updated_at        | timestamptz | NOT NULL, default now()                             |                                                            |

**Unique**: `(course_id, moodle_section_id)`
**Index**: `(course_id, position)`
**RLS**: SELECT for any authenticated user. INSERT/UPDATE/DELETE via service role only.

### moodle_files

Files and links within sections. Deduplicated — the actual file is stored once in Supabase Storage.

| Field        | Type        | Constraints                                          | Description                                          |
| ------------ | ----------- | ---------------------------------------------------- | ---------------------------------------------------- |
| id           | uuid        | PK, default uuid_generate_v4()                       |                                                      |
| section_id   | uuid        | FK → moodle_sections(id) ON DELETE CASCADE, NOT NULL |                                                      |
| type         | text        | NOT NULL, CHECK (type IN ('file', 'link'))           | Whether this is an uploaded file or an external link |
| moodle_url   | text        | NOT NULL                                             | Original Moodle resource URL                         |
| file_name    | text        | NOT NULL                                             | Display name                                         |
| content_hash | text        |                                                      | SHA-256 hash of file content (null for links)        |
| storage_path | text        |                                                      | Path in Supabase Storage (null for links)            |
| external_url | text        |                                                      | Target URL (for links only)                          |
| file_size    | bigint      |                                                      | File size in bytes (null for links)                  |
| mime_type    | text        |                                                      | MIME type (null for links)                           |
| position     | integer     | NOT NULL, default 0                                  | Order within section                                 |
| is_removed   | boolean     | NOT NULL, default false                              | Flagged if removed from Moodle                       |
| created_at   | timestamptz | NOT NULL, default now()                              |                                                      |
| updated_at   | timestamptz | NOT NULL, default now()                              |                                                      |

**Unique**: `(section_id, moodle_url)`
**Index**: `(content_hash)` — for cross-course dedup lookups
**Index**: `(section_id, position)`
**RLS**: SELECT for any authenticated user. INSERT/UPDATE/DELETE via service role only.

## Per-User Tables (standard user_id RLS)

### user_moodle_connections

Student's link to their Moodle instance.

| Field       | Type        | Constraints                                           | Description |
| ----------- | ----------- | ----------------------------------------------------- | ----------- |
| id          | uuid        | PK, default uuid_generate_v4()                        |             |
| user_id     | uuid        | FK → profiles(id) ON DELETE CASCADE, NOT NULL         |             |
| instance_id | uuid        | FK → moodle_instances(id) ON DELETE CASCADE, NOT NULL |             |
| created_at  | timestamptz | NOT NULL, default now()                               |             |

**Unique**: `(user_id, instance_id)`
**RLS**: Standard user_id — users can CRUD their own connections.

### user_course_syncs

Tracks which Moodle courses this student has synced. Links to their personal Typenote course.

| Field            | Type        | Constraints                                         | Description                               |
| ---------------- | ----------- | --------------------------------------------------- | ----------------------------------------- |
| id               | uuid        | PK, default uuid_generate_v4()                      |                                           |
| user_id          | uuid        | FK → profiles(id) ON DELETE CASCADE, NOT NULL       |                                           |
| moodle_course_id | uuid        | FK → moodle_courses(id) ON DELETE CASCADE, NOT NULL |                                           |
| course_id        | uuid        | FK → courses(id) ON DELETE SET NULL, nullable       | Link to personal Typenote course          |
| last_synced_at   | timestamptz |                                                     | When this student last synced this course |
| created_at       | timestamptz | NOT NULL, default now()                             |                                           |
| updated_at       | timestamptz | NOT NULL, default now()                             |                                           |

**Unique**: `(user_id, moodle_course_id)`
**RLS**: Standard user_id — users can CRUD their own syncs.

### user_file_imports

Tracks which specific files this student chose to import.

| Field          | Type        | Constraints                                                                         | Description |
| -------------- | ----------- | ----------------------------------------------------------------------------------- | ----------- |
| id             | uuid        | PK, default uuid_generate_v4()                                                      |             |
| user_id        | uuid        | FK → profiles(id) ON DELETE CASCADE, NOT NULL                                       |             |
| moodle_file_id | uuid        | FK → moodle_files(id) ON DELETE CASCADE, NOT NULL                                   |             |
| sync_id        | uuid        | FK → user_course_syncs(id) ON DELETE CASCADE, NOT NULL                              |             |
| status         | text        | NOT NULL, default 'imported', CHECK (status IN ('imported', 'removed_from_moodle')) |             |
| created_at     | timestamptz | NOT NULL, default now()                                                             |             |
| updated_at     | timestamptz | NOT NULL, default now()                                                             |             |

**Unique**: `(user_id, moodle_file_id)`
**RLS**: Standard user_id — users can CRUD their own imports.

## Storage

### Bucket: `moodle-materials`

Shared bucket (not path-per-user like existing `course-materials`).

**Path pattern**: `{instance_domain}/{moodle_course_id}/{content_hash}_{filename}`

- Example: `moodle.tau.ac.il/123/a1b2c3d4_lecture3.pdf`

**RLS**:

- SELECT: Any authenticated user
- INSERT/UPDATE/DELETE: Service role only (via API routes)

**Allowed MIME types**: Expanded beyond PDF — PDF, DOCX, PPTX, XLSX, images (PNG, JPG, GIF), plain text, etc.
**File size limit**: 50MB (matching existing limit)

## State Transitions

### moodle_files.is_removed

```
false (default) → true (when file no longer found on Moodle during re-sync)
true → false (if file reappears on Moodle)
```

### user_file_imports.status

```
'imported' (default) → 'removed_from_moodle' (when linked moodle_file.is_removed becomes true)
```

## Validation Rules

- `moodle_instances.domain` must be a valid domain (no protocol, no path)
- `moodle_courses.moodle_course_id` must be non-empty
- `moodle_files.content_hash` must be a valid SHA-256 hex string (64 chars) when type = 'file'
- `moodle_files.storage_path` required when type = 'file'
- `moodle_files.external_url` required when type = 'link'
