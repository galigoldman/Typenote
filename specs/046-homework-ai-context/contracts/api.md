# API Contracts: Homework AI Context

## Server Actions

### `createHomeworkSession`

Creates a homework document, session record, and material links in a single flow.

**Input**:
```ts
{
  courseId: string;
  exerciseDocumentId: string;
  materialRefs: Array<{
    type: 'course_material' | 'personal_file' | 'document';
    id: string;
  }>;
}
```

**Output**:
```ts
{
  documentId: string;  // the newly created homework document
  sessionId: string;   // the homework session record
}
```

**Behavior**:
1. Validates `courseId` belongs to the authenticated user
2. Validates `exerciseDocumentId` belongs to the authenticated user and is in the same course
3. Creates a new document with `course_id`, `purpose = 'homework'`, title = `"HW — {exercise title}"`
4. Creates a `homework_sessions` row linking the new document to the exercise
5. Creates `homework_session_materials` rows for each material reference
6. Returns the new document ID for client-side navigation

**Errors**: Throws if course/exercise not found, not owned by user, or DB insert fails.

---

### `getHomeworkContext`

Fetches the homework session and associated materials for a document.

**Input**:
```ts
{
  documentId: string;
}
```

**Output**:
```ts
HomeworkContext | null  // null if document has no homework session
```

Where `HomeworkContext` is:
```ts
{
  session: HomeworkSession;
  exerciseDocument: { id: string; title: string };
  materials: Array<{
    type: 'course_material' | 'personal_file' | 'document';
    id: string;
    name: string;
  }>;
}
```

**Behavior**:
1. Queries `homework_sessions` by `document_id`
2. If no session exists, returns `null`
3. Fetches the exercise document title
4. Fetches each material's display name from the appropriate source table based on `material_type`
5. Returns the assembled `HomeworkContext`

---

## Extended API: `/api/ai/ask`

### Request Body Extension

The existing `/api/ai/ask` endpoint receives an additional optional field:

```ts
{
  // ... existing fields ...
  homeworkSessionId?: string;  // if present, server fetches exercise + material content
}
```

### Behavior Change

When `homeworkSessionId` is provided:
1. Server fetches the homework session + exercise document content + material content
2. Exercise content is injected as a synthetic conversation turn: `"The student is working on this exercise: [exercise content]"`
3. Material content (from stored files or document content) is injected as another turn: `"Here are the relevant course materials: [material content]"`
4. These are prepended before any RAG results and the actual conversation history
5. The system prompt receives `isHomeworkMode: true` which adds pedagogical instructions

### Response

No changes to the response format — same SSE stream with `sources`, `conversation`, `text`, `done` events.
