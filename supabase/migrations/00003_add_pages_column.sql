-- Add pages JSONB column for canvas editor data (strokes, text boxes, flow content)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS pages jsonb DEFAULT '{"pages":[]}';
