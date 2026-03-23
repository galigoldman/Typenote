-- Add optional week_id to personal_files (course-level or week-level)
ALTER TABLE public.personal_files
  ADD COLUMN week_id uuid REFERENCES public.course_weeks(id) ON DELETE CASCADE;

CREATE INDEX personal_files_week_idx ON public.personal_files (week_id) WHERE week_id IS NOT NULL;

-- Also update course-materials bucket to accept .docx alongside PDF
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'course-materials';
