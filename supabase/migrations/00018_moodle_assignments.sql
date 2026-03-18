-- ============================================
-- Moodle Assignments: shared assignment entities,
-- question splits (boundary data), and individual
-- split questions. Same shared registry pattern
-- as moodle_files — any authenticated user can read.
-- ============================================

-- moodle_assignments (shared, same RLS pattern as moodle_files)
create table public.moodle_assignments (
  id               uuid primary key default uuid_generate_v4(),
  section_id       uuid not null references public.moodle_sections(id) on delete cascade,
  moodle_url       text not null,
  moodle_module_id text,
  title            text not null,
  description_html text not null default '',
  due_date         timestamptz,
  is_removed       boolean not null default false,
  content_version  integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index idx_moodle_assignments_section_url
  on public.moodle_assignments (section_id, moodle_url);

create trigger moodle_assignments_updated_at
  before update on public.moodle_assignments
  for each row execute function public.handle_updated_at();

alter table public.moodle_assignments enable row level security;

create policy "Authenticated users can read assignments"
  on public.moodle_assignments for select
  using (auth.role() = 'authenticated');

-- assignment_splits (shared by default, personal splits only visible to creator)
-- Personal splits cannot have a null creator_id.
create table public.assignment_splits (
  id              uuid primary key default uuid_generate_v4(),
  assignment_id   uuid not null references public.moodle_assignments(id) on delete cascade,
  creator_type    text not null check (creator_type in ('ai', 'student')),
  creator_id      uuid references public.profiles(id) on delete set null,
  is_personal     boolean not null default false,
  content_version integer not null default 1,
  created_at      timestamptz not null default now(),
  -- Ensure personal splits always have a creator
  check (not (is_personal = true and creator_id is null))
);

create index idx_assignment_splits_assignment
  on public.assignment_splits (assignment_id, created_at desc);

-- FR-014: at most one personal split per assignment per student
create unique index idx_assignment_splits_one_personal
  on public.assignment_splits (assignment_id, creator_id)
  where is_personal = true;

alter table public.assignment_splits enable row level security;

-- Shared splits: everyone can read. Personal splits: only the creator.
create policy "Read shared splits or own personal splits"
  on public.assignment_splits for select
  using (is_personal = false or creator_id = auth.uid());

-- Students can create splits attributed to themselves only.
-- AI splits are created via service role (bypasses RLS), not through this policy.
create policy "Students can create their own splits"
  on public.assignment_splits for insert
  with check (creator_type = 'student' and creator_id = auth.uid());

create policy "Creators can delete their own splits"
  on public.assignment_splits for delete
  using (creator_id = auth.uid());

-- split_questions (inherit visibility from parent split)
create table public.split_questions (
  id             uuid primary key default uuid_generate_v4(),
  split_id       uuid not null references public.assignment_splits(id) on delete cascade,
  parent_id      uuid references public.split_questions(id) on delete set null,
  label          text not null,
  position       integer not null default 0,
  boundary_start integer not null,
  boundary_end   integer not null,
  preamble_start integer,
  preamble_end   integer,
  low_confidence boolean not null default false,
  created_at     timestamptz not null default now()
);

create index idx_split_questions_split
  on public.split_questions (split_id, position);

alter table public.split_questions enable row level security;

create policy "Read questions if can read parent split"
  on public.split_questions for select
  using (exists (
    select 1 from public.assignment_splits s
    where s.id = split_questions.split_id
      and (s.is_personal = false or s.creator_id = auth.uid())
  ));

-- Students can insert questions for their own splits only.
-- AI split questions are inserted via service role (bypasses RLS).
create policy "Insert questions for own splits"
  on public.split_questions for insert
  with check (exists (
    select 1 from public.assignment_splits s
    where s.id = split_questions.split_id
      and s.creator_type = 'student'
      and s.creator_id = auth.uid()
  ));

create policy "Delete questions for own splits"
  on public.split_questions for delete
  using (exists (
    select 1 from public.assignment_splits s
    where s.id = split_questions.split_id
      and s.creator_id = auth.uid()
  ));
