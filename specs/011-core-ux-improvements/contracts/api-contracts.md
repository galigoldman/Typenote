# API Contracts: Core UX Improvements

**Feature Branch**: `011-core-ux-improvements`

---

## New API Endpoints

### GET /api/ai/conversations

List all conversations for a course.

**Query Parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | `string` | Yes | Course to list conversations for |

**Response 200**:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "course_id": "uuid",
      "title": "How does recursion work in binary...",
      "created_at": "2026-03-18T10:00:00Z",
      "updated_at": "2026-03-18T10:05:00Z",
      "message_count": 8
    }
  ]
}
```

**Response 401**: Not authenticated
**Response 400**: Missing `courseId`

---

### GET /api/ai/conversations/[conversationId]/messages

Load all messages for a conversation.

**Response 200**:
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How does recursion work?",
      "sources_json": null,
      "model": null,
      "created_at": "2026-03-18T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Recursion is a technique where...",
      "sources_json": [
        {
          "sourceType": "course_material",
          "sourceName": "Lecture 5.pdf",
          "weekId": "uuid",
          "pageRange": "12-15"
        }
      ],
      "model": "flash",
      "created_at": "2026-03-18T10:00:05Z"
    }
  ]
}
```

**Response 401**: Not authenticated
**Response 404**: Conversation not found or not owned by user

---

### DELETE /api/ai/conversations/[conversationId]

Delete a conversation and all its messages.

**Response 200**: `{ "deleted": true }`
**Response 401**: Not authenticated
**Response 404**: Conversation not found or not owned by user

---

### PATCH /api/ai/conversations/[conversationId]

Update conversation title.

**Request Body**:
```json
{
  "title": "New title here"
}
```

**Response 200**: `{ "id": "uuid", "title": "New title here" }`
**Response 401**: Not authenticated
**Response 404**: Conversation not found or not owned by user

---

## Modified API Endpoints

### POST /api/ai/ask (existing — modified)

**Added request fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `conversationId` | `string` | No | Existing conversation to continue. If omitted, a new conversation is created. |

**Modified behavior**:
1. If `conversationId` is provided: verify ownership, load last 20 messages as history (ignore client-sent `conversationHistory`)
2. If `conversationId` is omitted: create a new `ai_conversations` row, set title from first ~50 chars of question
3. After rate limit check passes: insert user message into `ai_messages`
4. After streaming completes (on `done`): insert assistant message with `content`, `sources_json`, `model`
5. Update conversation `updated_at`

**Added SSE events**:
```
data: {"type":"conversation","conversationId":"uuid","messageId":"uuid"}
```
Sent immediately after the user message is persisted, before streaming begins. Client uses this to track the conversation for subsequent requests.

**Unchanged**: All existing fields, rate limiting, auth, streaming behavior remain identical.

---

## Modified Server Actions

### moveDocument (existing — extended)

**Old signature**:
```typescript
moveDocument(id: string, folderId: string | null)
```

**New signature**:
```typescript
moveDocument(id: string, destination: MoveDestination)

type MoveDestination =
  | { type: 'folder'; folderId: string }
  | { type: 'course'; courseId: string; weekId?: string }
  | { type: 'root' }  // remove from all — standalone document
```

**Behavior**:
- `type: 'folder'`: Set `folder_id`, clear `course_id`, `week_id`, `material_id`
- `type: 'course'`: Set `course_id` (+ optional `week_id`), clear `folder_id`. If `course_id` changes and `material_id` is set, clear `material_id`.
- `type: 'root'`: Clear `folder_id`, `course_id`, `week_id`, `material_id`

**Revalidation**: `/dashboard` and any affected course page.

---

## New Server Actions

### Conversation CRUD

```typescript
// Create a new conversation (called from AI ask endpoint)
createConversation(courseId: string, title: string): Promise<AiConversation>

// Add a message to a conversation
addMessage(conversationId: string, message: {
  role: 'user' | 'assistant';
  content: string;
  sources_json?: ChatSource[] | null;
  model?: string | null;
}): Promise<AiMessage>

// Update conversation title
updateConversationTitle(conversationId: string, title: string): Promise<void>

// Delete a conversation (cascade deletes messages)
deleteConversation(conversationId: string): Promise<void>

// Get conversations for a course (sorted by updated_at DESC)
getConversations(courseId: string): Promise<AiConversation[]>

// Get messages for a conversation (sorted by created_at ASC)
getMessages(conversationId: string): Promise<AiMessage[]>

// Get recent messages for AI context (last 20)
getRecentMessages(conversationId: string, limit?: number): Promise<AiMessage[]>
```

---

## Hook Interface Changes

### useAutoSave (extended)

**New SaveStatus type**:
```typescript
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'retrying' | 'error';
```

**New return fields**:
```typescript
{
  // ...existing fields...
  retryCount: number;           // Current retry attempt (0-3)
  errorDetails: string | null;  // Human-readable error description
  errorType: 'network' | 'auth' | 'permanent' | null;
  retryNow: () => void;         // Manual retry trigger
}
```

### useDocumentSync (extended)

**New return fields**:
```typescript
{
  // ...existing fields...
  manualSave: () => Promise<void>;  // Explicit save triggered by button
}
```
