# Server Action Contracts: Document Versioning

## `createVersionSnapshot`

**File**: `src/lib/actions/document-versions.ts`
**Type**: Next.js Server Action (`'use server'`)

**Signature**:

```typescript
async function createVersionSnapshot(
  documentId: string,
  trigger: 'idle' | 'periodic' | 'close',
): Promise<{ id: string; created_at: string } | null>;
```

**Behavior**:

- Calls `create_document_version` RPC with the current document's content, pages, and title
- The RPC reads the document state server-side (no client data needed beyond documentId)
- Returns the new version's id and created_at, or null if the document doesn't exist
- Cap enforcement (max 8) is handled inside the RPC

**Error cases**:

- Document not found → returns null
- User not authenticated → throws (Supabase auth error)
- User doesn't own document → RLS blocks the operation

---

## `getDocumentVersions`

**File**: `src/lib/queries/document-versions.ts`

**Signature**:

```typescript
async function getDocumentVersions(
  documentId: string,
): Promise<DocumentVersion[]>;
```

**Behavior**:

- SELECT from `document_versions` WHERE `document_id` = documentId
- ORDER BY `created_at DESC`
- RLS ensures only the owner's versions are returned

---

## `restoreDocumentVersion`

**File**: `src/lib/actions/document-versions.ts`
**Type**: Next.js Server Action (`'use server'`)

**Signature**:

```typescript
async function restoreDocumentVersion(
  versionId: string,
): Promise<{ updated_at: string }>;
```

**Behavior**:

- Calls `restore_document_version` RPC
- RPC atomically: snapshots current state as "before_restore" → overwrites document → prunes if > 8
- Returns the document's new `updated_at`

**Error cases**:

- Version not found → throws
- User doesn't own the version → RLS blocks

---

## Beacon Endpoint: `/api/version-snapshot`

**File**: `src/app/api/version-snapshot/route.ts`
**Method**: POST

**Purpose**: Receive `navigator.sendBeacon()` requests on page unload.

**Body** (JSON):

```typescript
{
  documentId: string;
}
```

**Response**: 204 No Content (beacon callers don't read responses)

**Behavior**:

- Authenticates via Supabase session cookie
- Calls the same `create_document_version` RPC with trigger = `'close'`
- Fire-and-forget — no response body needed
