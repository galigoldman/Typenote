-- ============================================
-- Content Embeddings: multimodal vector storage
-- for course material search (Embedding 2).
-- PDFs/PPTX embedded as page segments (up to 6
-- pages each). DOCX embedded as text.
-- Shared Moodle materials: user_id = NULL.
-- ============================================

create table public.content_embeddings (
  id bigint primary key generated always as identity,
  source_type text not null check (source_type in ('moodle_file', 'course_material')),
  source_id uuid not null,
  segment_index integer not null,
  page_start integer,
  page_end integer,
  segment_text text,
  embedding extensions.vector(1536) not null,
  user_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  week_id uuid references public.course_weeks(id) on delete set null,
  source_name text,
  mime_type text,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, segment_index)
);

-- HNSW index for fast cosine similarity search
create index content_embeddings_embedding_idx
  on public.content_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- Scoping indexes
create index content_embeddings_course_user_idx
  on public.content_embeddings (course_id, user_id);

create index content_embeddings_source_idx
  on public.content_embeddings (source_type, source_id);

create index content_embeddings_hash_idx
  on public.content_embeddings (content_hash);

-- RLS
alter table public.content_embeddings enable row level security;

create policy "Users can view own and shared embeddings"
  on public.content_embeddings for select
  using (user_id = auth.uid() or user_id is null);

create policy "Users can insert own embeddings"
  on public.content_embeddings for insert
  with check (user_id = auth.uid());

create policy "Users can delete own embeddings"
  on public.content_embeddings for delete
  using (user_id = auth.uid());

-- ============================================
-- match_embeddings: cosine similarity search
-- Returns file references with page ranges
-- ============================================

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_week_id uuid default null,
  match_count integer default 8,
  similarity_threshold float default 0.5
)
returns table (
  id bigint,
  source_type text,
  source_id uuid,
  source_name text,
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
    ce.id,
    ce.source_type,
    ce.source_id,
    ce.source_name,
    ce.page_start,
    ce.page_end,
    ce.course_id,
    ce.week_id,
    ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (match_course_id is null or ce.course_id = match_course_id)
    and (match_week_id is null or ce.week_id = match_week_id)
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================
-- get_week_file_refs: returns file storage
-- paths for a week's materials (used to
-- download raw files for Gemini context)
-- ============================================

create or replace function public.get_week_file_refs(
  target_course_id uuid,
  target_week_id uuid
)
returns table (
  source_type text,
  source_id uuid,
  source_name text,
  mime_type text,
  storage_path text
)
language sql stable
as $$
  -- Course materials (user-uploaded)
  select
    'course_material'::text as source_type,
    cm.id as source_id,
    cm.file_name as source_name,
    cm.mime_type,
    cm.storage_path
  from public.course_materials cm
  where cm.week_id = target_week_id

  union all

  -- Moodle files linked to this week via section mapping
  -- (Moodle sections map to weeks via position/topic matching)
  select
    'moodle_file'::text as source_type,
    mf.id as source_id,
    mf.file_name as source_name,
    mf.mime_type,
    mf.storage_path
  from public.moodle_files mf
  where mf.storage_path is not null
    and mf.is_removed = false
    and mf.type = 'file'
    and exists (
      select 1 from public.content_embeddings ce
      where ce.source_type = 'moodle_file'
        and ce.source_id = mf.id
        and ce.course_id = target_course_id
        and ce.week_id = target_week_id
    );
$$;
