-- Add material_id column to documents table.
-- Links a document to its source course material (PDF).
-- When a student opens a material, a document is created with this FK set,
-- allowing the canvas editor to render the PDF as a background layer.

ALTER TABLE documents
  ADD COLUMN material_id uuid REFERENCES course_materials(id) ON DELETE SET NULL;

-- One annotation document per material per user (prevents duplicates).
-- Partial index: only constrains rows where material_id is set,
-- so regular documents (material_id = NULL) are unaffected.
CREATE UNIQUE INDEX documents_material_user_idx
  ON documents (material_id, user_id)
  WHERE material_id IS NOT NULL;

-- Fast lookup when opening a material to check for existing document.
CREATE INDEX documents_material_id_idx
  ON documents (material_id)
  WHERE material_id IS NOT NULL;
