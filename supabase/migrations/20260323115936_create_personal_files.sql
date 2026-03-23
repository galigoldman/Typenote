-- ============================================
-- Create personal_files table, storage bucket, and RLS
-- ============================================

-- 1. Create the personal_files table
CREATE TABLE public.personal_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'material' CHECK (category IN ('material', 'homework')),
  file_name text NOT NULL,
  display_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indices
CREATE INDEX personal_files_user_course_idx ON public.personal_files (user_id, course_id);
CREATE INDEX personal_files_user_idx ON public.personal_files (user_id);

-- 3. Enable RLS
ALTER TABLE public.personal_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personal files"
  ON public.personal_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own personal files"
  ON public.personal_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal files"
  ON public.personal_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personal files"
  ON public.personal_files FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'personal-files',
  'personal-files',
  false,
  52428800,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS policies (path-based auth: first segment = user ID)
CREATE POLICY "Users can view own personal files storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'personal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload personal files storage"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'personal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own personal files storage"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'personal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own personal files storage"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'personal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 6. Add personal_file_id to documents table
ALTER TABLE public.documents
  ADD COLUMN personal_file_id uuid REFERENCES public.personal_files(id) ON DELETE SET NULL;

-- One document per personal file per user (same pattern as material_id)
CREATE UNIQUE INDEX documents_personal_file_user_idx
  ON public.documents (personal_file_id, user_id)
  WHERE personal_file_id IS NOT NULL;

CREATE INDEX documents_personal_file_id_idx
  ON public.documents (personal_file_id)
  WHERE personal_file_id IS NOT NULL;
