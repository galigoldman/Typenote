# Data Model: Document Version History

## New Entity: `document_versions`

| Column       | Type                     | Constraints                              | Description                                      |
| ------------ | ------------------------ | ---------------------------------------- | ------------------------------------------------ |
| `id`         | `uuid`                   | PK, default `gen_random_uuid()`          | Unique version identifier                        |
| `document_id`| `uuid`                   | FK → `documents.id` ON DELETE CASCADE    | Parent document                                  |
| `user_id`    | `uuid`                   | FK → `auth.users(id)`, NOT NULL          | Who created this version (for RLS)               |
| `content`    | `jsonb`                  | NOT NULL, default `'{}'`                 | TipTap editor state snapshot                     |
| `pages`      | `jsonb`                  | default `NULL`                           | Canvas/drawing state snapshot (null if text-only) |
| `title`      | `text`                   | NOT NULL                                 | Document title at time of snapshot               |
| `trigger`    | `text`                   | NOT NULL                                 | What caused the snapshot (see below)             |
| `created_at` | `timestamptz`            | NOT NULL, default `now()`                | When the snapshot was created                    |

### Trigger values

| Value              | When created                                   |
| ------------------ | ---------------------------------------------- |
| `'idle'`           | User stopped editing for ~30 seconds           |
| `'periodic'`       | 5-minute safety net during active editing      |
| `'close'`          | User navigated away or closed the tab          |
| `'before_restore'` | Automatically created before a restore action  |

### Indexes

```sql
-- Primary query: "get all versions for this document, newest first"
CREATE INDEX document_versions_doc_created_idx
  ON document_versions (document_id, created_at DESC);

-- Cap enforcement: "count versions for this document"
-- (covered by the above composite index)
```

### RLS Policies

```sql
-- Users can only see their own document versions
SELECT: auth.uid() = user_id
INSERT: auth.uid() = user_id
DELETE: auth.uid() = user_id
-- No UPDATE policy — versions are immutable once created
```

### RPC Function: `create_document_version`

**Purpose**: Atomically insert a new version and prune oldest if count exceeds 8.

**Parameters**:
- `p_document_id` (uuid)
- `p_content` (jsonb)
- `p_pages` (jsonb, nullable)
- `p_title` (text)
- `p_trigger` (text)

**Returns**: The new version's `id` and `created_at`.

**Logic**:
1. Get `auth.uid()` as user_id
2. INSERT new row into `document_versions`
3. COUNT versions for this document_id
4. If count > 8, DELETE the oldest (by `created_at ASC`, LIMIT count - 8)
5. RETURN new version id + created_at

**Security**: `SECURITY DEFINER` — function runs with owner privileges, but validates `auth.uid()` internally to ensure the user owns the document.

### RPC Function: `restore_document_version`

**Purpose**: Atomically create a "before_restore" snapshot, then overwrite the document.

**Parameters**:
- `p_version_id` (uuid) — the version to restore

**Returns**: The restored document's `updated_at`.

**Logic**:
1. Get `auth.uid()` as user_id
2. SELECT the target version (verify user_id matches)
3. SELECT the current document state (content, pages, title)
4. INSERT a "before_restore" snapshot with the current state
5. Prune if > 8 versions
6. UPDATE `documents` with the target version's content, pages
7. RETURN `updated_at`

## Existing Entity: `documents` (unchanged)

No schema changes to the `documents` table. Versions reference documents via foreign key. The `ON DELETE CASCADE` ensures versions are cleaned up when a document is deleted.

## TypeScript Types

```typescript
// New type in src/types/database.ts
interface DocumentVersion {
  id: string;
  document_id: string;
  user_id: string;
  content: Record<string, unknown>;
  pages: Record<string, unknown> | null;
  title: string;
  trigger: 'idle' | 'periodic' | 'close' | 'before_restore';
  created_at: string;
}
```

## Relationships

```
documents (1) ──→ (0..8) document_versions
    │                        │
    └── id ←── document_id ──┘

    ON DELETE CASCADE: deleting a document removes all its versions
```
