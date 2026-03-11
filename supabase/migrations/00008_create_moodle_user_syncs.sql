-- ============================================
-- Moodle User Syncs: per-user tables for
-- connections, course syncs, and file imports.
-- Standard user_id RLS ownership.
-- ============================================

-- user_moodle_connections
create table public.user_moodle_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  instance_id uuid not null references public.moodle_instances(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, instance_id)
);

alter table public.user_moodle_connections enable row level security;

create policy "Users can view own moodle connections"
  on public.user_moodle_connections for select
  using (auth.uid() = user_id);

create policy "Users can create own moodle connections"
  on public.user_moodle_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own moodle connections"
  on public.user_moodle_connections for delete
  using (auth.uid() = user_id);

-- user_course_syncs
create table public.user_course_syncs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  moodle_course_id uuid not null references public.moodle_courses(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_course_id)
);

create trigger user_course_syncs_updated_at
  before update on public.user_course_syncs
  for each row execute function public.handle_updated_at();

alter table public.user_course_syncs enable row level security;

create policy "Users can view own course syncs"
  on public.user_course_syncs for select
  using (auth.uid() = user_id);

create policy "Users can create own course syncs"
  on public.user_course_syncs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own course syncs"
  on public.user_course_syncs for update
  using (auth.uid() = user_id);

create policy "Users can delete own course syncs"
  on public.user_course_syncs for delete
  using (auth.uid() = user_id);

-- user_file_imports
create table public.user_file_imports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  moodle_file_id uuid not null references public.moodle_files(id) on delete cascade,
  sync_id uuid not null references public.user_course_syncs(id) on delete cascade,
  status text not null default 'imported' check (status in ('imported', 'removed_from_moodle')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, moodle_file_id)
);

create index user_file_imports_user_idx on public.user_file_imports(user_id);
create index user_file_imports_sync_idx on public.user_file_imports(sync_id);

create trigger user_file_imports_updated_at
  before update on public.user_file_imports
  for each row execute function public.handle_updated_at();

alter table public.user_file_imports enable row level security;

create policy "Users can view own file imports"
  on public.user_file_imports for select
  using (auth.uid() = user_id);

create policy "Users can create own file imports"
  on public.user_file_imports for insert
  with check (auth.uid() = user_id);

create policy "Users can update own file imports"
  on public.user_file_imports for update
  using (auth.uid() = user_id);

create policy "Users can delete own file imports"
  on public.user_file_imports for delete
  using (auth.uid() = user_id);
