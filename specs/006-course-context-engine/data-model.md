# Data Model: Course Context Engine (Updated)

**Date**: 2026-03-14
**Feature**: 006-course-context-engine
**Update**: Multimodal Embedding 2 — page segments instead of text chunks

## New Tables

### content_embeddings

Stores vector embeddings for course materials. PDF/PPTX files are embedded as page segments (up to 6 pages each). DOCX files are embedded as text. No `chunk_text` for multimodal embeddings — content is retrieved from the original file at query time.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | BIGSERIAL | PK | Auto-incrementing ID |
| source_type | TEXT | NOT NULL | `'moodle_file'`, `'course_material'` |
| source_id | UUID | NOT NULL | FK to source record |
| segment_index | INT | NOT NULL | Ordering within source (0-based) |
| page_start | INT | NULL | First page in this segment (1-based, for PDFs/PPTX) |
| page_end | INT | NULL | Last page in this segment (for PDFs/PPTX) |
| segment_text | TEXT | NULL | Extracted text (only for DOCX, NULL for PDF/PPTX) |
| embedding | VECTOR(1536) | NOT NULL | Gemini Embedding 2 vector |
| user_id | UUID | NULL | NULL = shared (Moodle), SET = per-user |
| course_id | UUID | NULL | Scopes search to a course |
| week_id | UUID | NULL | Scopes search to a week |
| source_name | TEXT | NULL | Human-readable label (file name) |
| mime_type | TEXT | NULL | application/pdf, application/vnd...pptx, etc. |
| content_hash | TEXT | NULL | Hash of source file — skip re-embedding unchanged |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Constraints**:
- UNIQUE(source_type, source_id, segment_index)
- CHECK(source_type IN ('moodle_file', 'course_material'))

**Indexes**:
- HNSW on `embedding` with `vector_cosine_ops`
- BTREE on `(course_id, user_id)` — scoped queries
- BTREE on `(source_type, source_id)` — lookup/delete by source
- BTREE on `content_hash` — dedup check

**RLS Policies**:
- SELECT: `user_id = auth.uid() OR user_id IS NULL` (own + shared)
- INSERT: `user_id = auth.uid()` (own only)
- DELETE: `user_id = auth.uid()` (own only)
- Shared embeddings (user_id = NULL) written via service role

### context_cache_registry

Tracks active Gemini context caches. Unchanged from previous design.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | PK | |
| course_id | UUID | NOT NULL | FK to courses |
| week_id | UUID | NOT NULL | FK to course_weeks |
| cache_name | TEXT | NOT NULL | Gemini cache ID (`cachedContents/...`) |
| materials_hash | TEXT | NOT NULL | Hash of file list — invalidation key |
| expires_at | TIMESTAMPTZ | NOT NULL | When the cache TTL expires |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Constraints**: UNIQUE(course_id, week_id)

## Database Functions

### match_embeddings

Cosine similarity search. Updated for VECTOR(1536).

**Parameters**:

| Name | Type | Default | Description |
|------|------|---------|-------------|
| query_embedding | VECTOR(1536) | required | Search query vector |
| match_user_id | UUID | required | Current user's ID |
| match_course_id | UUID | NULL | Scope to course |
| match_week_id | UUID | NULL | Scope to week |
| match_count | INT | 8 | Max results |
| similarity_threshold | FLOAT | 0.5 | Minimum similarity |

**Returns**: TABLE(id, source_type, source_id, source_name, page_start, page_end, course_id, week_id, mime_type, similarity)

Note: No `chunk_text` in return — the search result provides the file reference and page range. The actual content is retrieved from storage when Gemini needs to answer.

### get_week_file_refs

Returns file references for a week (replaces `get_week_extracted_text`). Used to gather files for full-context mode.

**Parameters**:

| Name | Type | Description |
|------|------|-------------|
| target_course_id | UUID | The course |
| target_week_id | UUID | The week |

**Returns**: TABLE(source_type, source_id, source_name, mime_type, storage_path)

**Logic**: Joins course_materials and moodle_files for the given week, returns their storage paths for downloading raw files.

## Entity Relationships

```
moodle_files ──────┐
                   │ source_id
course_materials ──┼──── content_embeddings (pgvector search)
                   │      page_start, page_end (segment info)
                   │
                   └──── Supabase Storage (raw files for Gemini)

courses ──── course_weeks ──── context_cache_registry
```

## Migration Changes

The existing migrations (00011-00013) need updating:

1. `00011_enable_pgvector.sql` — No change
2. `00012_create_content_embeddings.sql` — Updated: VECTOR(1536), `page_start`/`page_end` columns, `segment_index` replaces `chunk_index`, `segment_text` replaces `chunk_text` (nullable), `mime_type` column, remove `metadata` JSONB, update match function signature, replace `get_week_extracted_text` with `get_week_file_refs`
3. `00013_create_context_cache_registry.sql` — No change
