-- Document context files: per-document attachments (imported files only) used
-- to focus the AI and provide in-app navigation. Replaces the homework flow.

-- 1. New table.
create table public.document_context_files (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  file_type   text not null check (file_type in ('course_material','personal_file','moodle_file')),
  file_id     uuid not null,
  created_at  timestamptz not null default now(),
  unique (document_id, file_type, file_id)
);
-- No separate document_id index: the unique constraint's B-tree already covers
-- document_id (leftmost key) for `where document_id = ?` lookups.

-- 2. RLS — access gated by ownership of the parent document.
alter table public.document_context_files enable row level security;

create policy "Users view own document context files"
  on public.document_context_files for select
  using (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

create policy "Users insert own document context files"
  on public.document_context_files for insert
  with check (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

create policy "Users delete own document context files"
  on public.document_context_files for delete
  using (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

-- 3. Migrate file-typed links from the homework tables (best-effort; drops
--    'document'-typed materials/exercises — notes are no longer context).
insert into public.document_context_files (document_id, file_type, file_id)
select hs.document_id, hsm.material_type, hsm.material_id
from public.homework_session_materials hsm
join public.homework_sessions hs on hs.id = hsm.session_id
where hsm.material_type in ('course_material','personal_file','moodle_file')
on conflict (document_id, file_type, file_id) do nothing;

insert into public.document_context_files (document_id, file_type, file_id)
select hs.document_id, hs.exercise_type, hs.exercise_id
from public.homework_sessions hs
where hs.exercise_type in ('course_material','personal_file','moodle_file')
  and hs.exercise_id is not null
on conflict (document_id, file_type, file_id) do nothing;

-- 4. Drop the homework tables (materials first — FK).
drop table if exists public.homework_session_materials;
drop table if exists public.homework_sessions;

-- 5. Add an optional source-id focus filter to match_embeddings.
--    Drop the exact current signature (from 20260525120000) then recreate.
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_source_ids uuid[] default null,
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
    and (match_source_ids is null or ce.source_id = any(match_source_ids))
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
