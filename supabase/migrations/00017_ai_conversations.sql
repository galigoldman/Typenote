-- 011-core-ux-improvements: AI conversation persistence per course
--
-- Why this migration?
-- AI chat history lives only in React state — closing the panel or navigating
-- away permanently destroys the conversation. Students need to reference prior
-- AI answers across study sessions. This adds two tables:
-- (1) ai_conversations — chat threads scoped to a user + course
-- (2) ai_messages — individual messages within a conversation
--
-- Why per-course instead of per-document?
-- Students think about AI help at the course level. They ask questions spanning
-- multiple documents, weeks, and topics within a single conversation thread.
-- The document open at the time provides context but doesn't scope the thread.
--
-- Why normalized (two tables) instead of a JSONB array?
-- Normalized design allows efficient pagination, individual message queries,
-- and future search indexing. JSONB arrays grow unbounded, can't be indexed
-- for text search, and require full-document reads for any access.
--
-- Interview concepts:
-- - Normalized vs denormalized storage: trade-offs for read/write patterns
-- - CASCADE deletes: referential integrity across related tables
-- - RLS with subqueries: securing child tables via parent ownership
-- - Composite indexes with sort direction: optimizing common query patterns

-- 1. Create ai_conversations table
-- One row per chat thread. Scoped to (user_id, course_id).
-- The title is auto-generated from the first ~50 chars of the first message.
CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index for listing conversations: "show me all conversations for
-- this course, most recent first." The DESC on updated_at means the DB can
-- serve this query directly from the index without a sort step.
CREATE INDEX ai_conversations_user_course_idx
  ON ai_conversations (user_id, course_id, updated_at DESC);

-- Simple user-level index for any cross-course queries (e.g., "all my conversations").
CREATE INDEX ai_conversations_user_idx
  ON ai_conversations (user_id);

-- Auto-update timestamp trigger (reuses handle_updated_at from 00001_initial_schema)
CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Row Level Security
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON ai_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON ai_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON ai_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON ai_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Create ai_messages table
-- Individual messages within a conversation. Immutable once created (no UPDATE policy).
-- The sources_json column stores citation metadata as a JSONB array matching
-- the existing ChatSource interface from the AI chat panel.
CREATE TABLE ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources_json jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for loading messages in chronological order within a conversation.
-- ASC on created_at matches the natural display order (oldest first).
CREATE INDEX ai_messages_conversation_idx
  ON ai_messages (conversation_id, created_at ASC);

-- Row Level Security
-- Messages don't have a direct user_id column. Access is controlled via
-- the parent conversation's ownership. This uses an EXISTS subquery —
-- it hits a small table (ai_conversations) with a PK lookup, so it's fast.
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own conversations"
  ON ai_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
  ));

CREATE POLICY "Users can add messages to own conversations"
  ON ai_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete messages in own conversations"
  ON ai_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()
  ));
