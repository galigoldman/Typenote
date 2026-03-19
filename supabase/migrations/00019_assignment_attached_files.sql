-- ============================================
-- Link assignments to their attached files (PDFs, etc.)
-- An assignment can have multiple attachments.
-- The files themselves live in moodle_files with storage_path.
-- ============================================

create table public.moodle_assignment_files (
  id              uuid primary key default uuid_generate_v4(),
  assignment_id   uuid not null references public.moodle_assignments(id) on delete cascade,
  moodle_file_id  uuid not null references public.moodle_files(id) on delete cascade,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);

create unique index idx_assignment_files_unique
  on public.moodle_assignment_files (assignment_id, moodle_file_id);

create index idx_assignment_files_assignment
  on public.moodle_assignment_files (assignment_id, position);

alter table public.moodle_assignment_files enable row level security;

create policy "Authenticated users can read assignment files"
  on public.moodle_assignment_files for select
  using (auth.role() = 'authenticated');
