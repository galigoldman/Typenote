-- moodle_assignments (shared, same RLS as moodle_files)
CREATE TABLE moodle_assignments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id    uuid NOT NULL REFERENCES moodle_sections(id) ON DELETE CASCADE,
  moodle_url    text NOT NULL,
  moodle_module_id text,
  title         text NOT NULL,
  description_html text NOT NULL DEFAULT '',
  due_date      timestamptz,
  is_removed    boolean NOT NULL DEFAULT false,
  content_version integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_moodle_assignments_section_url
  ON moodle_assignments (section_id, moodle_url);

ALTER TABLE moodle_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignments"
  ON moodle_assignments FOR SELECT TO authenticated USING (true);

-- assignment_splits (shared by default, personal splits only visible to creator)
CREATE TABLE assignment_splits (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id   uuid NOT NULL REFERENCES moodle_assignments(id) ON DELETE CASCADE,
  creator_type    text NOT NULL CHECK (creator_type IN ('ai', 'student')),
  creator_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_personal     boolean NOT NULL DEFAULT false,
  content_version integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignment_splits_assignment
  ON assignment_splits (assignment_id, created_at DESC);

-- FR-014: at most one personal split per assignment per student
CREATE UNIQUE INDEX idx_assignment_splits_one_personal
  ON assignment_splits (assignment_id, creator_id)
  WHERE is_personal = true;

ALTER TABLE assignment_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read shared splits or own personal splits"
  ON assignment_splits FOR SELECT TO authenticated
  USING (is_personal = false OR creator_id = auth.uid());

CREATE POLICY "Authenticated users can create splits"
  ON assignment_splits FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid() OR creator_type = 'ai');

CREATE POLICY "Creators can delete their own splits"
  ON assignment_splits FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- split_questions (inherit visibility from parent split)
CREATE TABLE split_questions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id        uuid NOT NULL REFERENCES assignment_splits(id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES split_questions(id) ON DELETE SET NULL,
  label           text NOT NULL,
  position        integer NOT NULL DEFAULT 0,
  boundary_start  integer NOT NULL,
  boundary_end    integer NOT NULL,
  preamble_start  integer,
  preamble_end    integer,
  low_confidence  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_split_questions_split
  ON split_questions (split_id, position);

ALTER TABLE split_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read questions if can read parent split"
  ON split_questions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignment_splits s
    WHERE s.id = split_questions.split_id
      AND (s.is_personal = false OR s.creator_id = auth.uid())
  ));

CREATE POLICY "Insert questions for own splits"
  ON split_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM assignment_splits s
    WHERE s.id = split_questions.split_id
      AND (s.creator_id = auth.uid() OR s.creator_type = 'ai')
  ));

CREATE POLICY "Delete questions for own splits"
  ON split_questions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM assignment_splits s
    WHERE s.id = split_questions.split_id
      AND s.creator_id = auth.uid()
  ));
