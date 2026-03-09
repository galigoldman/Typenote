-- ============================================
-- Create course-materials storage bucket + RLS
-- ============================================

-- 1. Create the storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- 2. Storage RLS policies (path-based auth: first segment = user ID)

-- Storage SELECT policy
create policy "Users can view own course materials"
  on storage.objects for select
  using (bucket_id = 'course-materials' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage INSERT policy
create policy "Users can upload course materials"
  on storage.objects for insert
  with check (bucket_id = 'course-materials' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage UPDATE policy
create policy "Users can update own course materials"
  on storage.objects for update
  using (bucket_id = 'course-materials' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage DELETE policy
create policy "Users can delete own course materials"
  on storage.objects for delete
  using (bucket_id = 'course-materials' and auth.uid()::text = (storage.foldername(name))[1]);
