-- ============================================================
-- Homework Sessions: links a homework document to an exercise
-- source document and reference materials for AI context.
-- ============================================================

-- 1. homework_sessions — one per homework document
CREATE TABLE homework_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE
    REFERENCES documents(id) ON DELETE CASCADE,
  exercise_document_id uuid NOT NULL
    REFERENCES documents(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL
    REFERENCES courses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL
    REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_homework_sessions_user ON homework_sessions(user_id);

-- 2. homework_session_materials — polymorphic junction table
CREATE TABLE homework_session_materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL
    REFERENCES homework_sessions(id) ON DELETE CASCADE,
  material_type  text NOT NULL
    CHECK (material_type IN ('course_material', 'personal_file', 'document')),
  material_id    uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, material_type, material_id)
);

CREATE INDEX idx_homework_session_materials_session
  ON homework_session_materials(session_id);

-- ============================================================
-- RLS — homework_sessions
-- ============================================================
ALTER TABLE homework_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own homework sessions"
  ON homework_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own homework sessions"
  ON homework_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own homework sessions"
  ON homework_sessions FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- RLS — homework_session_materials (via parent session)
-- ============================================================
ALTER TABLE homework_session_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own homework session materials"
  ON homework_session_materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM homework_sessions
      WHERE homework_sessions.id = homework_session_materials.session_id
        AND homework_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own homework session materials"
  ON homework_session_materials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM homework_sessions
      WHERE homework_sessions.id = homework_session_materials.session_id
        AND homework_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own homework session materials"
  ON homework_session_materials FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM homework_sessions
      WHERE homework_sessions.id = homework_session_materials.session_id
        AND homework_sessions.user_id = auth.uid()
    )
  );
