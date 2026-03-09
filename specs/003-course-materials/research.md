# Research: Course Structure & Material Upload

**Feature**: 003-course-materials
**Date**: 2026-03-08

## Research Topics

### 1. Database Schema Design — New Tables

**Context**: Need three new tables (courses, course_weeks, course_materials) following existing patterns from `folders` and `documents` tables.

**Finding**: The existing schema follows a consistent pattern:
- UUID primary keys with `uuid_generate_v4()`
- `user_id` foreign key to `profiles(id)` with `on delete cascade`
- `created_at` / `updated_at` timestamps with `now()` defaults
- `handle_updated_at()` trigger reused across all tables
- Composite indexes on `(user_id, parent_column)` for multi-tenant queries
- Four CRUD RLS policies per table: `"Users can {action} own {entity}"`

**Decision**: Follow the exact same patterns. Three new tables:
1. `courses` — top-level entity, optional `folder_id` for nesting inside folders
2. `course_weeks` — child of courses, sequential week numbers
3. `course_materials` — child of weeks, references files in Supabase Storage

**Alternatives Considered**:
- Single `course_items` table with a `type` discriminator — rejected (less clear schema, harder to query)
- Embedding weeks as JSONB inside courses — rejected (loses queryability, harder to reference from materials)

---

### 2. Supabase Storage Configuration

**Context**: Need to store PDF files (up to 50MB) with user isolation.

**Finding**: Supabase Storage is already enabled in `config.toml` with a 50MiB file size limit. No buckets are currently configured (example is commented out). Storage uses path-based RLS policies, separate from table RLS.

**Decision**: Create a `course-materials` storage bucket with:
- `public = false` (private bucket, requires auth)
- `file_size_limit = "50MiB"`
- `allowed_mime_types = ["application/pdf"]`
- Path structure: `{user_id}/{course_id}/{week_id}/{filename}` for natural isolation
- RLS policy: users can only access paths starting with their own `auth.uid()`

**Alternatives Considered**:
- Public bucket with signed URLs — rejected (unnecessary exposure, PDF files should stay private)
- Generic `uploads` bucket — rejected (dedicated bucket allows tighter MIME type restrictions)

---

### 3. File Upload Pattern — Client vs Server

**Context**: Need drag-and-drop and file picker upload with progress indication.

**Finding**: Supabase JS client (`supabase.storage.from('bucket').upload()`) works directly from the browser client. The browser Supabase client (`createBrowserClient`) already has auth context from cookies. This means uploads can go directly from browser → Supabase Storage without a server-side proxy, while still respecting RLS.

**Decision**: Use client-side upload directly to Supabase Storage:
1. Browser component handles file selection (drag-and-drop or file picker)
2. Validate file type (PDF) and size (50MB) on client
3. Upload via `supabase.storage.from('course-materials').upload(path, file)`
4. On success, create a `course_materials` record via server action
5. Progress tracked via Supabase upload options or XHR if needed

**Alternatives Considered**:
- Server-side upload via API route (multipart form) — rejected (adds unnecessary hop, no progress without streaming)
- Presigned URLs — rejected (Supabase client handles auth natively)

---

### 4. Course Placement in Navigation

**Context**: Courses need to appear in both the dashboard grid and the sidebar tree, visually distinct from folders.

**Finding**: The dashboard uses a responsive grid layout (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`). Cards are client components with `useRouter()` for navigation. The sidebar uses a recursive `FolderNode` component. Both render from flat arrays filtered by `parent_id`.

**Decision**:
- Dashboard: Add a "Courses" section above folders (or interleaved with folders if nested). Use a distinct card design with a graduation cap or book icon.
- Sidebar: Add courses as a new node type in the tree. When a course is inside a folder, it appears as a child of that folder node.
- New route: `/dashboard/courses/[courseId]` for course view page.

**Alternatives Considered**:
- Separate "Courses" tab/page — rejected (fragmenting navigation reduces discoverability)
- Courses as a special folder type — rejected (loses the distinct data model and weekly structure)

---

### 5. Document Association with Courses

**Context**: Documents created inside a course need to maintain that relationship.

**Finding**: The existing `documents` table has a nullable `folder_id`. Adding a nullable `course_id` follows the same pattern. A document can belong to either a folder OR a course (not both in MVP, as courses have their own internal structure).

**Decision**: Add `course_id uuid references public.courses(id) on delete cascade` to the `documents` table. When a document is created from within a course view, `course_id` is set. The `folder_id` remains null for course documents (they don't need folder placement).

**Alternatives Considered**:
- Separate `course_documents` junction table — rejected (over-engineering for MVP, adds query complexity)
- Using `folder_id` to point at the course — rejected (courses and folders are different entities with different semantics)

---

### 6. Cascade Delete Strategy

**Context**: Deleting a course must clean up weeks, materials (database records AND storage files), and associated documents.

**Finding**: Existing tables use `on delete cascade` for ownership relationships. However, storage files are external to the database — cascade deletes won't remove files from Supabase Storage automatically.

**Decision**:
- Database: `on delete cascade` from courses → weeks → materials (records)
- Storage: Before deleting a course, the server action must explicitly list and remove all files from the storage bucket for that course's path prefix (`{user_id}/{course_id}/`)
- Documents: `on delete cascade` via the `course_id` foreign key

**Alternatives Considered**:
- Database trigger to delete storage files — rejected (triggers can't call external APIs)
- Background job to clean orphaned files — rejected (complexity not warranted for MVP)
- Soft delete — rejected (not in existing patterns, adds complexity)
