-- ============================================
-- Moodle Materials storage bucket
-- Shared bucket: authenticated users can read,
-- only service role can write.
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moodle-materials', 'moodle-materials', false, 52428800, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain'
])
on conflict (id) do nothing;

-- Any authenticated user can read (shared materials)
create policy "Authenticated users can view moodle materials"
  on storage.objects for select
  using (bucket_id = 'moodle-materials' and auth.role() = 'authenticated');

-- Only service role can write (controlled by API routes)
-- No INSERT/UPDATE/DELETE policies for regular users
