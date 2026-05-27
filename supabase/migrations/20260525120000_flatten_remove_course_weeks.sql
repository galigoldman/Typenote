-- Flatten the course model. Forward-only. Dependent FKs on course_weeks must
-- be dropped before `drop table course_weeks`.

-- 1. course_materials: add course_id, backfill from week, enforce not-null.
alter table public.course_materials
  add column course_id uuid references public.courses(id) on delete cascade;

update public.course_materials cm
set course_id = cw.course_id
from public.course_weeks cw
where cm.week_id = cw.id;

do $$
begin
  if exists (select 1 from public.course_materials where course_id is null) then
    raise exception 'flatten aborted: course_materials with null course_id remain';
  end if;
end $$;

alter table public.course_materials alter column course_id set not null;
drop index if exists public.course_materials_week_idx;
create index course_materials_course_idx on public.course_materials(course_id, category);
alter table public.course_materials drop column week_id;

-- 2. documents: drop the week column + guard constraint + index.
alter table public.documents drop constraint if exists chk_week_requires_course;
drop index if exists public.idx_documents_week_id;
alter table public.documents drop column if exists week_id;

-- 3. personal_files: drop the week column + index.
drop index if exists public.personal_files_week_idx;
alter table public.personal_files drop column if exists week_id;

-- 4. content_embeddings: drop week column; allow 'personal_file'; forbid null
--    user_id on owned source types (per-user scoping leak guard).
alter table public.content_embeddings drop column if exists week_id;
alter table public.content_embeddings
  drop constraint if exists content_embeddings_source_type_check;
alter table public.content_embeddings
  add constraint content_embeddings_source_type_check
  check (source_type in ('moodle_file', 'course_material', 'personal_file'));
alter table public.content_embeddings
  add constraint content_embeddings_owned_user_not_null
  check (source_type = 'moodle_file' or user_id is not null);

-- 5. Drop dead week-keyed cache + RPC.
drop table if exists public.context_cache_registry;
drop function if exists public.get_week_file_refs(uuid, uuid);

-- 6. Drop course_weeks.
drop table if exists public.course_weeks;

-- 7. Recreate match_embeddings WITHOUT match_week_id; add per-user personal_file
--    branch keyed on Typenote course_id. (Drop sig matches 20260522123000 exactly.)
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], uuid, integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_count int default 8,
  similarity_threshold float default 0.3
)
returns table (
  id bigint, source_type text, source_id uuid, source_name text,
  segment_text text, page_start integer, page_end integer, course_id uuid,
  mime_type text, similarity float
)
language sql stable
as $$
  select
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (
      (ce.source_type = 'course_material' and match_course_id is not null
        and ce.course_id = match_course_id and ce.user_id = match_user_id)
      or
      (ce.source_type = 'personal_file' and match_course_id is not null
        and ce.course_id = match_course_id and ce.user_id = match_user_id)
      or
      (ce.source_type = 'moodle_file' and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
