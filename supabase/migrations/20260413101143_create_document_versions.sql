-- Document Version History
-- ========================
-- 1. Creates `document_versions` table to store point-in-time snapshots
-- 2. Adds composite index for efficient "get versions by document" queries
-- 3. Adds RLS policies so users can only access their own versions
-- 4. Creates `create_document_version` RPC for atomic insert + cap enforcement
-- 5. Creates `restore_document_version` RPC for atomic restore with safety snapshot
--
-- Design decisions:
-- - Full JSONB snapshots (not diffs): simple restore, negligible storage at 8-version cap
-- - Ring-buffer cap via RPC: prevents race conditions across multiple tabs
-- - SECURITY DEFINER RPCs: bypass RLS internally but validate auth.uid()
-- - ON DELETE CASCADE: versions auto-cleanup when a document is deleted
--
-- Interview concepts:
-- - Ring buffer / circular buffer pattern for fixed-size history
-- - Atomic operations via database functions (no TOCTOU races)
-- - SECURITY DEFINER vs SECURITY INVOKER in PostgreSQL
-- - Composite indexes for covering queries

-- ============================================
-- TABLE
-- ============================================

CREATE TABLE public.document_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  content     jsonb       NOT NULL DEFAULT '{}',
  pages       jsonb       DEFAULT NULL,
  title       text        NOT NULL,
  trigger     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Primary query: "get all versions for this document, newest first"
-- Also covers cap enforcement COUNT queries
CREATE INDEX document_versions_doc_created_idx
  ON public.document_versions (document_id, created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own versions"
  ON public.document_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own versions"
  ON public.document_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own versions"
  ON public.document_versions FOR DELETE
  USING (auth.uid() = user_id);

-- No UPDATE policy — versions are immutable once created

-- ============================================
-- RPC: create_document_version
-- ============================================
-- Atomically inserts a new version snapshot and prunes the oldest
-- if the document exceeds 8 versions. Reads the document's current
-- state server-side so the client only needs to pass the document ID.

CREATE OR REPLACE FUNCTION public.create_document_version(
  p_document_id uuid,
  p_trigger     text
)
RETURNS TABLE (version_id uuid, version_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid;
  v_content    jsonb;
  v_pages      jsonb;
  v_title      text;
  v_new_id     uuid;
  v_created    timestamptz;
  v_count      integer;
BEGIN
  -- 1. Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Read the current document state (also verifies ownership via user_id check)
  SELECT d.content, d.pages, d.title
    INTO v_content, v_pages, v_title
    FROM public.documents d
   WHERE d.id = p_document_id
     AND d.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- 3. Insert the new version
  INSERT INTO public.document_versions (document_id, user_id, content, pages, title, trigger)
    VALUES (p_document_id, v_user_id, v_content, v_pages, v_title, p_trigger)
    RETURNING id, created_at INTO v_new_id, v_created;

  -- 4. Count total versions for this document
  SELECT count(*) INTO v_count
    FROM public.document_versions
   WHERE document_id = p_document_id;

  -- 5. Prune oldest if over cap (8)
  IF v_count > 8 THEN
    DELETE FROM public.document_versions
     WHERE id IN (
       SELECT dv.id
         FROM public.document_versions dv
        WHERE dv.document_id = p_document_id
        ORDER BY dv.created_at ASC
        LIMIT v_count - 8
     );
  END IF;

  -- 6. Return the new version info
  RETURN QUERY SELECT v_new_id, v_created;
END;
$$;

-- ============================================
-- RPC: restore_document_version
-- ============================================
-- Atomically:
-- 1. Creates a "before_restore" snapshot of the current document state
-- 2. Overwrites the document with the target version's content
-- 3. Prunes oldest versions if over cap

CREATE OR REPLACE FUNCTION public.restore_document_version(
  p_version_id uuid
)
RETURNS TABLE (doc_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id      uuid;
  v_doc_id       uuid;
  v_ver_content  jsonb;
  v_ver_pages    jsonb;
  v_cur_content  jsonb;
  v_cur_pages    jsonb;
  v_cur_title    text;
  v_count        integer;
  v_updated      timestamptz;
BEGIN
  -- 1. Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Read the target version (verify ownership)
  SELECT dv.document_id, dv.content, dv.pages
    INTO v_doc_id, v_ver_content, v_ver_pages
    FROM public.document_versions dv
   WHERE dv.id = p_version_id
     AND dv.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;

  -- 3. Read current document state for the "before_restore" snapshot
  SELECT d.content, d.pages, d.title
    INTO v_cur_content, v_cur_pages, v_cur_title
    FROM public.documents d
   WHERE d.id = v_doc_id
     AND d.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- 4. Insert "before_restore" snapshot
  INSERT INTO public.document_versions (document_id, user_id, content, pages, title, trigger)
    VALUES (v_doc_id, v_user_id, v_cur_content, v_cur_pages, v_cur_title, 'before_restore');

  -- 5. Prune if over cap
  SELECT count(*) INTO v_count
    FROM public.document_versions
   WHERE document_id = v_doc_id;

  IF v_count > 8 THEN
    DELETE FROM public.document_versions
     WHERE id IN (
       SELECT dv.id
         FROM public.document_versions dv
        WHERE dv.document_id = v_doc_id
        ORDER BY dv.created_at ASC
        LIMIT v_count - 8
     );
  END IF;

  -- 6. Overwrite the document with the target version's content
  UPDATE public.documents
     SET content = v_ver_content,
         pages   = v_ver_pages
   WHERE id = v_doc_id
     AND user_id = v_user_id
  RETURNING updated_at INTO v_updated;

  -- 7. Return the new updated_at
  RETURN QUERY SELECT v_updated;
END;
$$;
