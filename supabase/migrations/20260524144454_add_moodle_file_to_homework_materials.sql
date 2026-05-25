-- Add 'moodle_file' as a valid material_type for homework sessions
ALTER TABLE homework_session_materials
  DROP CONSTRAINT homework_session_materials_material_type_check;

ALTER TABLE homework_session_materials
  ADD CONSTRAINT homework_session_materials_material_type_check
  CHECK (material_type IN ('course_material', 'personal_file', 'document', 'moodle_file'));

-- Make exercise_document_id nullable (exercise can now be any material type)
ALTER TABLE homework_sessions
  ALTER COLUMN exercise_document_id DROP NOT NULL;

-- Add polymorphic exercise reference columns
ALTER TABLE homework_sessions
  ADD COLUMN exercise_type text,
  ADD COLUMN exercise_id uuid;
