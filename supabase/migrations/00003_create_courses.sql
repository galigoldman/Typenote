-- ============================================
-- Typenote Phase 3: Course Materials Schema
-- ============================================

-- ============================================
-- COURSES
-- ============================================
create table public.courses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  name text not null default 'Untitled Course',
  code text,
  semester text,
  color text not null default '#6B7280',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_user_folder_idx on public.courses(user_id, folder_id);

create trigger courses_updated_at
  before update on public.courses
  for each row execute function public.handle_updated_at();

-- Courses RLS
alter table public.courses enable row level security;

create policy "Users can view own courses"
  on public.courses for select
  using (auth.uid() = user_id);

create policy "Users can create own courses"
  on public.courses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own courses"
  on public.courses for update
  using (auth.uid() = user_id);

create policy "Users can delete own courses"
  on public.courses for delete
  using (auth.uid() = user_id);

-- ============================================
-- COURSE WEEKS
-- ============================================
create table public.course_weeks (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_number integer not null,
  topic text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, week_number)
);

create index course_weeks_course_idx on public.course_weeks(course_id, week_number);

create trigger course_weeks_updated_at
  before update on public.course_weeks
  for each row execute function public.handle_updated_at();

-- Course Weeks RLS
alter table public.course_weeks enable row level security;

create policy "Users can view own course weeks"
  on public.course_weeks for select
  using (auth.uid() = user_id);

create policy "Users can create own course weeks"
  on public.course_weeks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own course weeks"
  on public.course_weeks for update
  using (auth.uid() = user_id);

create policy "Users can delete own course weeks"
  on public.course_weeks for delete
  using (auth.uid() = user_id);

-- ============================================
-- COURSE MATERIALS
-- ============================================
create table public.course_materials (
  id uuid primary key default uuid_generate_v4(),
  week_id uuid not null references public.course_weeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('material', 'homework')),
  storage_path text not null,
  file_name text not null,
  label text,
  file_size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index course_materials_week_idx on public.course_materials(week_id, category);
create index course_materials_user_idx on public.course_materials(user_id);

create trigger course_materials_updated_at
  before update on public.course_materials
  for each row execute function public.handle_updated_at();

-- Course Materials RLS
alter table public.course_materials enable row level security;

create policy "Users can view own course materials"
  on public.course_materials for select
  using (auth.uid() = user_id);

create policy "Users can create own course materials"
  on public.course_materials for insert
  with check (auth.uid() = user_id);

create policy "Users can update own course materials"
  on public.course_materials for update
  using (auth.uid() = user_id);

create policy "Users can delete own course materials"
  on public.course_materials for delete
  using (auth.uid() = user_id);
