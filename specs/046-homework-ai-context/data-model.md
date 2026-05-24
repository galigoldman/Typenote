# Data Model: Homework AI Context

## New Entities

### `homework_sessions`

Represents a homework session linking a working document to an exercise source and course.

| Field                  | Type        | Constraints                                              |
| ---------------------- | ----------- | -------------------------------------------------------- |
| `id`                   | uuid        | PK, default `gen_random_uuid()`                          |
| `document_id`          | uuid        | FK → `documents(id)` ON DELETE CASCADE, NOT NULL, UNIQUE |
| `exercise_document_id` | uuid        | FK → `documents(id)` ON DELETE CASCADE, NOT NULL         |
| `course_id`            | uuid        | FK → `courses(id)` ON DELETE CASCADE, NOT NULL           |
| `user_id`              | uuid        | FK → `profiles(id)` ON DELETE CASCADE, NOT NULL          |
| `created_at`           | timestamptz | default `now()`                                          |

**RLS**: Users can only read/insert/delete their own rows (`user_id = auth.uid()`). No UPDATE policy — sessions are immutable once created.

**Notes**:

- `document_id` is UNIQUE — each document can have at most one homework session.
- `exercise_document_id` is the existing document containing the homework questions.
- Deleting the homework document cascades to delete the session.
- Deleting the exercise document also cascades (the session loses its purpose).

---

### `homework_session_materials`

Junction table linking a homework session to its reference materials (polymorphic).

| Field           | Type        | Constraints                                                               |
| --------------- | ----------- | ------------------------------------------------------------------------- |
| `id`            | uuid        | PK, default `gen_random_uuid()`                                           |
| `session_id`    | uuid        | FK → `homework_sessions(id)` ON DELETE CASCADE, NOT NULL                  |
| `material_type` | text        | NOT NULL, CHECK IN (`'course_material'`, `'personal_file'`, `'document'`) |
| `material_id`   | uuid        | NOT NULL                                                                  |
| `created_at`    | timestamptz | default `now()`                                                           |

**RLS**: Inherited through parent session — SELECT requires EXISTS subquery checking `homework_sessions.user_id = auth.uid()`. INSERT requires the same. No UPDATE policy.

**Notes**:

- `material_id` is a polymorphic reference — no FK constraint since it can point to `course_materials`, `personal_files`, or `documents`.
- Unique constraint on `(session_id, material_type, material_id)` prevents duplicate entries.
- Deleting the session cascades to delete all material links.

---

## Existing Entities (No Changes)

### `documents`

No schema changes needed. The homework document is a regular document with `course_id` set and `purpose = 'homework'`. The `homework_sessions` table provides the additional context link.

### `course_materials`

No changes. Referenced polymorphically by `homework_session_materials`.

### `personal_files`

No changes. Referenced polymorphically by `homework_session_materials`.

### `ai_conversations`

No changes. Homework documents use the existing conversation system — conversations are scoped to `(user_id, course_id)` and work the same as any other document.

---

## Entity Relationships

```
courses (1) ──── (*) homework_sessions
documents (1) ── (0..1) homework_sessions  (as document_id — the working doc)
documents (1) ── (*) homework_sessions     (as exercise_document_id — the exercise source)
homework_sessions (1) ── (*) homework_session_materials
homework_session_materials ──> course_materials | personal_files | documents  (polymorphic)
```

## State Transitions

Homework sessions are **create-once, read-many**:

1. **Created** when the student confirms the "Start Homework" dialog
2. **Read** every time the homework document is opened (to load context for AI)
3. **Deleted** only when the parent document or exercise is deleted (cascade)

No intermediate states. No updates. This simplicity is intentional — if the student wants different materials, they start a new homework session.

## TypeScript Types

```ts
interface HomeworkSession {
  id: string;
  document_id: string;
  exercise_document_id: string;
  course_id: string;
  user_id: string;
  created_at: string;
}

interface HomeworkSessionMaterial {
  id: string;
  session_id: string;
  material_type: 'course_material' | 'personal_file' | 'document';
  material_id: string;
  created_at: string;
}

// Joined view for UI display
interface HomeworkContext {
  session: HomeworkSession;
  exerciseDocument: { id: string; title: string };
  materials: Array<{
    type: 'course_material' | 'personal_file' | 'document';
    id: string;
    name: string; // display name from the source table
  }>;
}
```
