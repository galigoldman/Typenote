# Custom Event Contracts: PostHog Analytics

**Feature**: 014-posthog-analytics
**Date**: 2026-03-23

## Event Definitions

Each custom event has a fixed name and typed properties. These contracts define the interface between the application and PostHog.

### `document_created`

Fired when a user creates a new document.

| Property        | Type                  | Required | Description                                             |
| --------------- | --------------------- | -------- | ------------------------------------------------------- |
| `course_id`     | string (UUID) \| null | Yes      | Course the document belongs to, or null                 |
| `document_type` | string                | Yes      | Canvas type (e.g., `notebook`, `whiteboard`)            |
| `purpose`       | string \| null        | Yes      | Document purpose (e.g., `homework`, `summary`, `notes`) |

**Trigger**: After `createDocument()` or `createWeekDocument()` server action resolves successfully.

---

### `document_deleted`

Fired when a user deletes a document.

| Property      | Type          | Required | Description                |
| ------------- | ------------- | -------- | -------------------------- |
| `document_id` | string (UUID) | Yes      | ID of the deleted document |

**Trigger**: After `deleteDocument()` server action resolves successfully.

---

### `file_uploaded`

Fired when a user uploads a course material file.

| Property    | Type          | Required | Description                          |
| ----------- | ------------- | -------- | ------------------------------------ |
| `file_size` | number        | Yes      | File size in bytes                   |
| `mime_type` | string        | Yes      | MIME type of the uploaded file       |
| `week_id`   | string (UUID) | Yes      | Course week the file was uploaded to |

**Trigger**: After successful file upload in `use-file-upload.ts` hook.

---

### `ai_chat_message_sent`

Fired when a user sends a message to the AI chat.

| Property    | Type                  | Required | Description                    |
| ----------- | --------------------- | -------- | ------------------------------ |
| `course_id` | string (UUID)         | Yes      | Course context for the AI chat |
| `mode`      | `'quick'` \| `'deep'` | Yes      | AI query mode selected by user |

**Trigger**: When the user submits a question in `ai-chat-panel.tsx`.

---

### `pdf_exported`

Fired when a user exports a document as PDF.

| Property     | Type   | Required | Description                         |
| ------------ | ------ | -------- | ----------------------------------- |
| `page_count` | number | Yes      | Number of pages in the exported PDF |

**Trigger**: After successful PDF generation in `use-export-pdf.ts` hook.

---

### `course_created`

Fired when a user creates a new course.

| Property             | Type   | Required | Description                                                           |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `course_name_length` | number | Yes      | Character count of the course name (not the name itself — avoids PII) |

**Trigger**: After `createCourse()` server action resolves successfully.

---

### `document_moved`

Fired when a user moves a document to a different location.

| Property           | Type                                 | Required | Description                                   |
| ------------------ | ------------------------------------ | -------- | --------------------------------------------- |
| `destination_type` | `'folder'` \| `'course'` \| `'root'` | Yes      | Type of destination the document was moved to |

**Trigger**: After `moveDocument()` server action resolves successfully.

---

## TypeScript Interface

The implementation should define a discriminated union type:

```typescript
type AnalyticsEvent =
  | {
      event: 'document_created';
      properties: {
        course_id: string | null;
        document_type: string;
        purpose: string | null;
      };
    }
  | { event: 'document_deleted'; properties: { document_id: string } }
  | {
      event: 'file_uploaded';
      properties: { file_size: number; mime_type: string; week_id: string };
    }
  | {
      event: 'ai_chat_message_sent';
      properties: { course_id: string; mode: 'quick' | 'deep' };
    }
  | { event: 'pdf_exported'; properties: { page_count: number } }
  | { event: 'course_created'; properties: { course_name_length: number } }
  | {
      event: 'document_moved';
      properties: { destination_type: 'folder' | 'course' | 'root' };
    };
```

## Privacy Rules

- **No PII in event properties**: No emails, names, IP addresses, or note content
- **UUIDs only**: Reference entities by ID, never by name
- **Lengths over values**: Use `course_name_length` instead of `course_name`
- **No document content**: Never include text, titles, or file names in event properties
