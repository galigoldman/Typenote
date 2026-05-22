-- Per-user material access in AI chat
--
-- Background: moodle_files is a shared registry (one row per file even
-- when multiple users sync the same Moodle course). Embeddings used to
-- be tied to the FIRST indexer's Typenote course_id, so only one user
-- could ever find the file via RAG. This migration:
--
--   A. Repoints moodle_file embedding rows from <typenote course_id>
--      to the canonical moodle_courses.id (reached via
--      moodle_files.section_id -> moodle_sections.course_id).
--
--   B. Replaces match_embeddings with a version that handles two
--      source-type branches and accepts an imported-file whitelist for
--      per-user access enforcement.

-- ---------------------------------------------------------------------------
-- Step A: Backfill embedding course_id for moodle_file rows.
-- ---------------------------------------------------------------------------
update public.content_embeddings ce
set course_id = ms.course_id
from public.moodle_files mf
join public.moodle_sections ms on ms.id = mf.section_id
where ce.source_type = 'moodle_file'
  and ce.source_id = mf.id
  and ce.course_id is distinct from ms.course_id;

-- ---------------------------------------------------------------------------
-- Step B: Replace match_embeddings RPC.
--
-- 00014 registered the function with bare `vector` (not extensions.vector),
-- so we drop using the exact same form to avoid leaving the old function
-- alongside the new one.
--
-- LANGUAGE sql STABLE matches the original 00012 declaration (00014
-- accidentally regressed to plpgsql). STABLE lets the planner cache
-- function results within a single query, which matters because RAG
-- hits this RPC on every chat turn.
-- ---------------------------------------------------------------------------
drop function if exists public.match_embeddings(
  vector, uuid, uuid, uuid, integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_week_id uuid default null,
  match_count int default 8,
  similarity_threshold float default 0.3
)
returns table (
  id bigint,
  source_type text,
  source_id uuid,
  source_name text,
  segment_text text,
  page_start integer,
  page_end integer,
  course_id uuid,
  week_id uuid,
  mime_type text,
  similarity float
)
language sql stable
as $$
  select
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.week_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (
      -- course_material: keyed by Typenote course_id, uploader owns the row
      (ce.source_type = 'course_material'
        and match_course_id is not null
        and ce.course_id = match_course_id)
      or
      -- moodle_file: keyed by moodle_courses.id (canonical); access is
      -- whitelisted by the user's imported file set
      (ce.source_type = 'moodle_file'
        and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and (match_week_id is null or ce.week_id = match_week_id)
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
