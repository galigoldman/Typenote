-- Migration: Add week_id and purpose to documents
-- Allows documents to be associated with specific weeks and categorized by purpose

ALTER TABLE documents
  ADD COLUMN week_id UUID REFERENCES course_weeks(id) ON DELETE SET NULL,
  ADD COLUMN purpose TEXT CHECK (purpose IN ('homework', 'summary', 'notes'));

-- Index for querying documents by week
CREATE INDEX idx_documents_week_id ON documents(user_id, week_id) WHERE week_id IS NOT NULL;

-- Ensure week_id can only be set if course_id is also set
ALTER TABLE documents
  ADD CONSTRAINT chk_week_requires_course
  CHECK (week_id IS NULL OR course_id IS NOT NULL);
