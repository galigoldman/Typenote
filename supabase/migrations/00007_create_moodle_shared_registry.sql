-- ============================================
-- Moodle Shared Registry: shared tables for
-- Moodle instances, courses, sections, and files.
-- No user_id ownership; any authenticated user
-- can SELECT. Writes go through service role.
-- ============================================

-- moodle_instances
create table public.moodle_instances (
  id uuid primary key default uuid_generate_v4(),
  domain text unique not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger moodle_instances_updated_at
  before update on public.moodle_instances
  for each row execute function public.handle_updated_at();

alter table public.moodle_instances enable row level security;

create policy "Authenticated users can view moodle instances"
  on public.moodle_instances for select
  using (auth.role() = 'authenticated');

-- moodle_courses
create table public.moodle_courses (
  id uuid primary key default uuid_generate_v4(),
  instance_id uuid not null references public.moodle_instances(id) on delete cascade,
  moodle_course_id text not null,
  name text not null,
  moodle_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, moodle_course_id)
);

create index moodle_courses_instance_idx on public.moodle_courses(instance_id);

create trigger moodle_courses_updated_at
  before update on public.moodle_courses
  for each row execute function public.handle_updated_at();

alter table public.moodle_courses enable row level security;

create policy "Authenticated users can view moodle courses"
  on public.moodle_courses for select
  using (auth.role() = 'authenticated');

-- moodle_sections
create table public.moodle_sections (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid not null references public.moodle_courses(id) on delete cascade,
  moodle_section_id text,
  title text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, moodle_section_id)
);

create index moodle_sections_course_idx on public.moodle_sections(course_id, position);

create trigger moodle_sections_updated_at
  before update on public.moodle_sections
  for each row execute function public.handle_updated_at();

alter table public.moodle_sections enable row level security;

create policy "Authenticated users can view moodle sections"
  on public.moodle_sections for select
  using (auth.role() = 'authenticated');

-- moodle_files
create table public.moodle_files (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.moodle_sections(id) on delete cascade,
  type text not null check (type in ('file', 'link')),
  moodle_url text not null,
  file_name text not null,
  content_hash text,
  storage_path text,
  external_url text,
  file_size bigint,
  mime_type text,
  position integer not null default 0,
  is_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, moodle_url)
);

create index moodle_files_section_idx on public.moodle_files(section_id, position);
create index moodle_files_hash_idx on public.moodle_files(content_hash);

create trigger moodle_files_updated_at
  before update on public.moodle_files
  for each row execute function public.handle_updated_at();

alter table public.moodle_files enable row level security;

create policy "Authenticated users can view moodle files"
  on public.moodle_files for select
  using (auth.role() = 'authenticated');
