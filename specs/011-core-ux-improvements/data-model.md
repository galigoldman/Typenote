# Data Model: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`
**Migration**: `00017_ai_conversations.sql`

---

## New Tables

### ai_conversations

Stores AI chat threads scoped to a user + course.

| Column       | Type          | Constraints                                   | Notes                                         |
| ------------ | ------------- | --------------------------------------------- | --------------------------------------------- |
| `id`         | `uuid`        | PK, default `gen_random_uuid()`               |                                               |
| `user_id`    | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | Owner                                         |
| `course_id`  | `uuid`        | NOT NULL, FK `courses(id)` ON DELETE CASCADE  | Course scope                                  |
| `title`      | `text`        | NOT NULL, default `'New conversation'`        | Auto-generated from first message (~50 chars) |
| `created_at` | `timestamptz` | NOT NULL, default `now()`                     |                                               |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`                     | Bumped on each new message                    |

**Indexes**:

- `ai_conversations_user_course_idx` on `(user_id, course_id, updated_at DESC)` — list conversations for a course, most recent first
- `ai_conversations_user_idx` on `(user_id)` — user-level queries

**Trigger**: `ai_conversations_updated_at` → calls `handle_updated_at()` before UPDATE

**RLS Policies**:

- SELECT: `user_id = auth.uid()`
- INSERT: `user_id = auth.uid()`
- UPDATE: `user_id = auth.uid()`
- DELETE: `user_id = auth.uid()`

**Cascade behavior**: When a course is deleted, all its conversations are deleted (ON DELETE CASCADE on `course_id`). When a user is deleted, all their conversations are deleted (ON DELETE CASCADE on `user_id`).

---

### ai_messages

Stores individual messages within a conversation.

| Column            | Type          | Constraints                                           | Notes                                       |
| ----------------- | ------------- | ----------------------------------------------------- | ------------------------------------------- |
| `id`              | `uuid`        | PK, default `gen_random_uuid()`                       |                                             |
| `conversation_id` | `uuid`        | NOT NULL, FK `ai_conversations(id)` ON DELETE CASCADE | Parent conversation                         |
| `role`            | `text`        | NOT NULL, CHECK `(role IN ('user', 'assistant'))`     | Message sender                              |
| `content`         | `text`        | NOT NULL                                              | Message text                                |
| `sources_json`    | `jsonb`       | nullable                                              | Citation metadata for assistant messages    |
| `model`           | `text`        | nullable                                              | `'flash'` or `'pro'` for assistant messages |
| `created_at`      | `timestamptz` | NOT NULL, default `now()`                             |                                             |

**Indexes**:

- `ai_messages_conversation_idx` on `(conversation_id, created_at ASC)` — load messages in order

**RLS Policies** (via join to `ai_conversations`):

- SELECT: `EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid())`
- INSERT: `EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid())`
- DELETE: `EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND user_id = auth.uid())`

**Note**: No UPDATE policy on messages — messages are immutable once created. Only conversation titles are editable.

---

## Modified Tables

### documents (existing)

No schema changes. The `moveDocument` server action is extended to support updating `course_id`, `week_id`, and `folder_id` atomically, respecting the existing constraint:

```
CHECK: NOT (folder_id IS NOT NULL AND course_id IS NOT NULL)
CHECK: week_id IS NULL OR course_id IS NOT NULL
```

When moving:

- **To a course/week**: Set `course_id` (+ optional `week_id`), clear `folder_id`. If different course, clear `material_id`.
- **To a folder**: Set `folder_id`, clear `course_id`, `week_id`, `material_id`.
- **Between weeks (same course)**: Update `week_id` only.

---

## Entity Relationships

```
profiles (1) ──< (N) ai_conversations
courses  (1) ──< (N) ai_conversations
ai_conversations (1) ──< (N) ai_messages
```

**Full context**:

```
profiles ──< courses ──< course_weeks ──< course_materials
    │            │                            │
    │            └──< documents ──────────────┘ (material_id FK)
    │            │
    │            └──< ai_conversations ──< ai_messages
    │
    └──< folders ──< documents (folder_id FK, mutually exclusive with course_id)
```

---

## sources_json Schema

The `sources_json` column stores citation metadata as a JSONB array, matching the existing `ChatSource` interface:

```json
[
  {
    "sourceType": "moodle_file" | "course_material",
    "sourceName": "Lecture 5 - Binary Trees.pdf",
    "weekId": "uuid" | null,
    "pageRange": "12-15" | null
  }
]
```

---

## Seed Data Requirements

Migration `00017` creates the tables. Seed data in `supabase/seed.sql` must be updated to include:

- 2 conversations for the CS101 course (seeded as `11111111-1111-1111-1111-111111111111`)
- 1 conversation for the Linear Algebra course
- 3-4 messages per conversation (alternating user/assistant roles)
- At least one message with `sources_json` populated
- Conversations with different `updated_at` timestamps to test ordering

---

## TypeScript Types (additions to `src/types/database.ts`)

```typescript
export interface AiConversation {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources_json: ChatSource[] | null;
  model: 'flash' | 'pro' | null;
  created_at: string;
}
```
