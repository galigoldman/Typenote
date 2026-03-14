-- Update match_embeddings to return segment_text so RAG can use stored text
-- instead of re-downloading files.
create or replace function match_embeddings(
  query_embedding vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
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
  page_start int,
  page_end int,
  course_id uuid,
  week_id uuid,
  mime_type text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ce.id,
    ce.source_type,
    ce.source_id,
    ce.source_name,
    ce.segment_text,
    ce.page_start,
    ce.page_end,
    ce.course_id,
    ce.week_id,
    ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (match_course_id is null or ce.course_id = match_course_id)
    and (match_week_id is null or ce.week_id = match_week_id)
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;
