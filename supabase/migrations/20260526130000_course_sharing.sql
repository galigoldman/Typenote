-- ============================================================
-- Course sharing: membership + share links, helper functions,
-- RLS, storage policies, join RPC, Moodle owner-view, embeddings.
-- ============================================================

-- 1. course_members ------------------------------------------
create table public.course_members (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id)  on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('viewer', 'contributor')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index course_members_user_idx on public.course_members(user_id);
-- (no separate course_id index: the unique(course_id, user_id) index already
--  serves course_id-leading lookups.)

-- 2. course_share_links --------------------------------------
create table public.course_share_links (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  token      text not null unique,
  role       text not null check (role in ('viewer', 'contributor')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index course_share_links_course_idx on public.course_share_links(course_id);
create unique index course_share_links_active_role_idx
  on public.course_share_links(course_id, role)
  where is_active;

-- 3. Helper functions (SECURITY DEFINER — run as table owner, bypass RLS,
--    which prevents RLS recursion on course_members). -------------------
create or replace function public.is_course_member(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  ) or exists (
    select 1 from public.course_members m
    where m.course_id = p_course_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_course_contributor(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  ) or exists (
    select 1 from public.course_members m
    where m.course_id = p_course_id and m.user_id = auth.uid()
      and m.role = 'contributor'
  );
$$;

create or replace function public.is_course_owner(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  );
$$;

grant execute on function public.is_course_member(uuid)      to authenticated;
grant execute on function public.is_course_contributor(uuid) to authenticated;
grant execute on function public.is_course_owner(uuid)       to authenticated;

-- 4. documents.course_id: cascade -> set null (preserve notes on course delete)
alter table public.documents drop constraint documents_course_id_fkey;
alter table public.documents
  add constraint documents_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;

-- 5. RLS: courses (add member read; owner policies from 00003 remain) -----
create policy "Members can view shared courses"
  on public.courses for select
  using (public.is_course_member(id));

-- 6. RLS: course_members ------------------------------------------------
alter table public.course_members enable row level security;

create policy "Members can view course roster"
  on public.course_members for select
  using (public.is_course_member(course_id));

-- No user-facing INSERT policy: membership is created ONLY via the
-- join_course_via_link() SECURITY DEFINER RPC (which bypasses RLS and sets the
-- role from the share link). A raw "user_id = auth.uid()" INSERT policy would
-- let any authenticated user self-grant contributor on any course_id.

create policy "Owner manages membership"
  on public.course_members for update
  using (public.is_course_owner(course_id))
  with check (public.is_course_owner(course_id));

create policy "Owner or self can remove membership"
  on public.course_members for delete
  using (public.is_course_owner(course_id) or user_id = auth.uid());

-- 7. RLS: course_share_links (owner-only manage) ------------------------
alter table public.course_share_links enable row level security;

create policy "Owner manages share links"
  on public.course_share_links for all
  using (public.is_course_owner(course_id))
  with check (public.is_course_owner(course_id));

-- 8. RLS: course_materials — tighten INSERT, add member SELECT ----------
drop policy "Users can view own course materials"   on public.course_materials;
drop policy "Users can create own course materials" on public.course_materials;
drop policy "Users can update own course materials" on public.course_materials;
drop policy "Users can delete own course materials" on public.course_materials;

create policy "Members can view course materials"
  on public.course_materials for select
  using (public.is_course_member(course_id));
create policy "Contributors can add course materials"
  on public.course_materials for insert
  with check (auth.uid() = user_id and public.is_course_contributor(course_id));
create policy "Owner or uploader can update course materials"
  on public.course_materials for update
  using (auth.uid() = user_id or public.is_course_owner(course_id));
create policy "Owner or uploader can delete course materials"
  on public.course_materials for delete
  using (auth.uid() = user_id or public.is_course_owner(course_id));

-- 9. RLS: personal_files — same treatment -------------------------------
drop policy "Users can view own personal files"   on public.personal_files;
drop policy "Users can create own personal files" on public.personal_files;
drop policy "Users can update own personal files" on public.personal_files;
drop policy "Users can delete own personal files" on public.personal_files;

create policy "Members can view personal files"
  on public.personal_files for select
  using (public.is_course_member(course_id));
create policy "Contributors can add personal files"
  on public.personal_files for insert
  with check (auth.uid() = user_id and public.is_course_contributor(course_id));
create policy "Owner or uploader can update personal files"
  on public.personal_files for update
  using (auth.uid() = user_id or public.is_course_owner(course_id));
create policy "Owner or uploader can delete personal files"
  on public.personal_files for delete
  using (auth.uid() = user_id or public.is_course_owner(course_id));

-- 10. content_embeddings: members read shared course/personal-file rows --
create policy "Members can read shared course embeddings"
  on public.content_embeddings for select
  using (
    source_type in ('course_material', 'personal_file')
    and public.is_course_member(course_id)
  );

-- 11. match_embeddings: scope by course_id / moodle whitelist (RLS gates
--     visibility). Removes all three ce.user_id filters. Preserves the
--     match_source_ids focus filter added by 20260526120000
--     (document_context_files), which this migration runs after — so we drop
--     THAT 8-arg signature here, not the pre-focus 7-arg one. Still SECURITY
--     INVOKER; match_user_id is kept for call-site compatibility but no longer
--     filters (RLS does the gating).
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], uuid[], integer, double precision
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
  where (match_source_ids is null or ce.source_id = any(match_source_ids))
    and (
      (ce.source_type in ('course_material', 'personal_file')
        and match_course_id is not null
        and ce.course_id = match_course_id)
      or
      (ce.source_type = 'moodle_file'
        and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;

-- 12. join_course_via_link: validate token, create membership idempotently.
--     SECURITY DEFINER so it can insert despite course_members having no
--     user-facing INSERT policy.
create or replace function public.join_course_via_link(p_token text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_course_id uuid;
  v_role text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;
  select course_id, role into v_course_id, v_role
    from public.course_share_links
    where token = p_token and is_active
    limit 1;
  if v_course_id is null then
    raise exception 'invalid_or_inactive_link';
  end if;
  if exists (
    select 1 from public.courses
    where id = v_course_id and user_id = v_uid
  ) then
    return v_course_id; -- owner already has access
  end if;
  insert into public.course_members (course_id, user_id, role)
    values (v_course_id, v_uid, v_role)
    on conflict (course_id, user_id) do nothing;
  return v_course_id;
end;
$$;

grant execute on function public.join_course_via_link(text) to authenticated;

-- 13. course_moodle_view: the OWNER's moodle sync + imported file ids for a
--     shared course, exposed to any member (gated by is_course_member).
create or replace function public.course_moodle_view(p_course_id uuid)
returns table (moodle_course_id uuid, imported_file_ids uuid[])
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_mcourse uuid;
begin
  if not public.is_course_member(p_course_id) then
    return query select null::uuid, null::uuid[];
    return;
  end if;
  select user_id into v_owner from public.courses where id = p_course_id;
  select s.moodle_course_id into v_mcourse
    from public.user_course_syncs s
    where s.course_id = p_course_id and s.user_id = v_owner
    limit 1;
  if v_mcourse is null then
    return query select null::uuid, null::uuid[];
    return;
  end if;
  return query
    select
      v_mcourse,
      coalesce(array_agg(fi.moodle_file_id), array[]::uuid[])
    from public.user_file_imports fi
    where fi.user_id = v_owner
      and fi.status = 'imported'
      and fi.moodle_file_id in (
        select mf.id from public.moodle_files mf
        join public.moodle_sections ms on ms.id = mf.section_id
        where ms.course_id = v_mcourse
      );
end;
$$;

grant execute on function public.course_moodle_view(uuid) to authenticated;

-- 14. Storage: members can read objects backing shared materials --------
create policy "Members can read shared course materials"
  on storage.objects for select
  using (
    bucket_id = 'course-materials'
    and exists (
      select 1 from public.course_materials cm
      where cm.storage_path = name
        and public.is_course_member(cm.course_id)
    )
  );

create policy "Members can read shared personal files"
  on storage.objects for select
  using (
    bucket_id = 'personal-files'
    and exists (
      select 1 from public.personal_files pf
      where pf.storage_path = name
        and public.is_course_member(pf.course_id)
    )
  );
