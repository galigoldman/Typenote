-- ============================================
-- Add course_id to documents table
-- ============================================

alter table public.documents
  add column course_id uuid references public.courses(id) on delete cascade;

create index documents_user_course_idx on public.documents(user_id, course_id);

alter table public.documents
  add constraint documents_folder_or_course
  check (not (folder_id is not null and course_id is not null));
