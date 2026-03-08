-- Add default_background column to folders table
-- Allows folders to set a default canvas background for new documents
ALTER TABLE folders ADD COLUMN default_background TEXT NOT NULL DEFAULT 'blank';
