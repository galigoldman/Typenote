# Document Context Files — Design

- **Date:** 2026-05-26
- **Status:** Approved (ready for implementation planning)
- **Branch:** `feat/document-context-files` (off latest `dev`)
- **Replaces:** the "Start Homework" flow

## 1. Summary

Replace the "Start Homework → pick an exercise → pick materials" flow with a simpler,
universal model: **you just create a document, and inside any course document you can
attach context files.** Attached files do two jobs:

1. **Focus the AI** — they tell the assistant _"these specific files are the context for
   this note,"_ so it answers questions like _"what does question 3 mean?"_ against the
   right source, on top of the existing course-wide search.
2. **Easy navigation to the source** — clicking a file (or an AI citation) opens it in a
   lightweight **read-only viewer**, including **Moodle PDFs**, so you can see exactly
   where an answer came from.

## 2. Background / current state (verified against disk)

- The course model was recently **flattened**: `course_weeks` and all `week_id` columns are
  gone (migration `20260525120000_flatten_remove_course_weeks.sql`). Documents and files
  belong directly to a **course**.
- **All imported files are already embedded on import** (this is the key enabler):
  - course materials → `indexContent({ type: 'course_material' })` in the upload routes,
  - Moodle files → `indexContent({ type: 'moodle_file' })` in `src/app/api/moodle/*`,
  - personal uploads → `indexContent({ type: 'personal_file' })` inside `createPersonalFile`.
  - `content_embeddings.source_type ∈ {moodle_file, course_material, personal_file}`.
- **`match_embeddings`** current signature (no week):
  `(query_embedding, match_user_id, match_course_id, match_moodle_course_id,
match_imported_moodle_file_ids, match_count, similarity_threshold)`. It already returns
  `segment_text`, `page_start`, `page_end`, `source_type`, `source_id`, `mime_type`.
- The AI pipeline lives in `src/lib/actions/ai-context.ts` — `searchContext` (RAG) and
  `buildAiContext` (used by the streaming `POST /api/ai/ask` route). `buildAiContext`
  already generates **signed URLs** for `moodle_file`, `course_material`, and `personal_file`
  sources for citations, but currently sets `pageRange: null`.
- **Start Homework** today: `src/components/dashboard/start-homework-dialog.tsx` +
  `src/lib/actions/homework.ts`, storing links in `homework_sessions` +
  `homework_session_materials` (polymorphic `material_type ∈ {course_material,
personal_file, document, moodle_file}`). Rendered from the course page
  (`src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`), alongside a
  `CreateDocumentDialog` ("New Document").
- AI citations render in `src/components/ai/ai-chat-panel.tsx` as badges that link to the
  signed URL in a new tab.

> Note: exact line numbers will be re-verified during implementation; the harness served
> some stale reads early in this session, so the plan must read fresh before editing.

## 3. Goals / non-goals

**Goals**

- Per-document attachment of **imported files** (course materials, imported Moodle files,
  personal uploads) on **course documents**, for both the canvas editor and the text editor.
- Attachments are an **optional enhancement** — the editor and AI work fully without them.
- A **read-only in-app viewer** for attached PDFs (incl. Moodle), with jump-to-page from
  AI citations.
- Remove the Start Homework flow entirely.

**Non-goals (this iteration)**

- Attachments on documents that don't belong to a course.
- Attaching notes/other documents as context (notes are never embedded, never context).
- A rich/editable DOCX viewer (DOCX gets a simple read-only HTML view; PDFs get the real viewer).
- Re-scoping the broad course-wide RAG (it stays unchanged).

## 4. UX design

### 4.1 Context files panel

- A **collapsible right-side panel** toggled from the editor toolbar with a 📎 icon and a
  **count badge** (pattern mirrors the existing version-history sidebar). Present on **course
  documents only**.
- Contents: list of attached files (type icon + name + source label + **✕ remove**); an
  **"＋ Add files"** action (and drag-and-drop) opening a picker of the course's **course
  materials + imported Moodle files + personal uploads**; an inviting **empty state**:
  _"No files attached — that's fine. The AI still answers using everything in this course.
  Attach the exercise sheet or slides to give it focused context."_
- Responsive: slide-in panel on tablet; full-screen sheet on phone (`pointer-coarse`).

### 4.2 AI chat cue

- The AI chat header shows **"📎 Using N context files ▸"** when the document has
  attachments; clicking it opens the Context panel. The panel is the single source of truth
  for managing attachments (no duplicate management UI in the chat).

### 4.3 Read-only viewer

- Clicking a file in the panel, or an **AI citation**, opens a **read-only viewer**
  (overlay or side panel): scroll, zoom, page navigation, and **jump-to-page** when opened
  from a citation. Bucket-aware (`course-materials`, `moodle-materials`, `personal-files`),
  reusing the existing pdf.js loader. DOCX → simple read-only HTML (via the existing
  `convertDocxToHtml`); unsupported types → download/open in new tab.

## 5. Data model

### 5.1 New table `document_context_files`

```sql
create table public.document_context_files (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  file_type   text not null check (file_type in ('course_material','personal_file','moodle_file')),
  file_id     uuid not null,
  created_at  timestamptz not null default now(),
  unique (document_id, file_type, file_id)
);
create index document_context_files_document_idx on public.document_context_files(document_id);
```

- **RLS**: select/insert/delete allowed when the parent `documents` row is owned by
  `auth.uid()` (EXISTS subquery on `documents`), matching the existing per-document pattern.
- `file_id` is intentionally **not** a hard FK (it's polymorphic across three tables);
  integrity is enforced in the server action that creates the row.

### 5.2 Migration from the homework tables

In the same migration, **forward-only**:

1. Copy file-typed material links into the new table:
   `insert ... select hs.document_id, hsm.material_type, hsm.material_id
from homework_session_materials hsm join homework_sessions hs on hs.id = hsm.session_id
where hsm.material_type in ('course_material','personal_file','moodle_file')`
   (on conflict do nothing).
2. Copy any **file-typed exercise** (`homework_sessions.exercise_type in
('course_material','personal_file','moodle_file')`, `exercise_id`) into the new table for
   that `document_id`. Drop `document`-typed exercises (notes are no longer context).
3. `drop table homework_session_materials; drop table homework_sessions;`

- Leave the `documents.purpose` column intact (used elsewhere, e.g. personal-file imports);
  we simply stop grouping by it in the UI.

### 5.3 `match_embeddings` — add an optional focus filter

Add a backward-compatible parameter so we can retrieve **only** the attached files' chunks:

```
match_source_ids uuid[] default null
```

…with an added clause `and (match_source_ids is null or ce.source_id = any(match_source_ids))`.
Existing callers (passing no `match_source_ids`) behave exactly as today.

## 6. AI behavior (RAG, no full-text injection)

In `buildAiContext` (and mirror in `askQuestion` if still used):

1. Course-wide RAG runs unchanged (top-K over all of the course's embedded content).
2. **Focus pass**: load the document's attached `(file_type, file_id)` rows, then call the
   search scoped via `match_source_ids` to **guarantee** the attached files' most relevant
   chunks are present; merge with the course-wide results (dedupe by `source_id`+segment),
   **ranking attached-file chunks first**.
3. Add a short context/system line naming them:
   _"The student attached these files as the primary context for this note: <names>. Treat
   them as the main reference and assume questions refer to them unless stated otherwise."_
4. **Citations carry page numbers**: propagate `page_start/page_end` into each source's
   `pageRange` so the viewer can jump to the cited page. Attached files already get signed
   URLs in `buildAiContext`.

Content reaches the model **only through RAG chunks**, never by dumping whole files into the
prompt (explicit design decision — keeps the context window safe and respects the existing
architecture).

## 7. Server actions & queries (new/changed)

- `attachContextFile({ documentId, fileType, fileId })` — validates the document is owned by
  the user and in a course, validates the file exists & belongs to the user/course, inserts
  the row. Returns the resolved file (id, type, name, mime).
- `detachContextFile({ documentId, fileType, fileId })`.
- `getContextFiles(documentId)` — returns attached files with resolved display name + mime +
  source label, for the panel and the AI focus pass. (Lightweight rows only — do **not**
  pass heavy DB rows / JSONB to client components.)
- A signed-URL helper for the viewer (bucket-aware: course-materials / moodle-materials /
  personal-files).
- `matchEmbeddings` wrapper + `searchContext` gain an optional `sourceIds` param.
- Fix: `deletePersonalFile` calls `deleteEmbeddingsBySource('personal_file', fileId)` (mirror
  of the course-material cleanup) so deleted personal files don't orphan embeddings. Detach
  rows for a deleted file are handled by app logic / cascade where applicable.

## 8. Components (new/changed)

- **New** `ContextFilesPanel` (client) — list, add-picker, remove, open-in-viewer; reads a
  lightweight list via the server action; collapsible with count badge.
- **New** `FileViewer` (client) — read-only pdf.js renderer with page nav + jump-to-page;
  DOCX → read-only HTML.
- **Changed** `DocumentWithAi` and `TiptapEditorWithVersions` — host the Context panel +
  viewer + the toolbar toggle; pass `documentId`/`courseId`.
- **Changed** `AiChatPanel` — "Using N context files" header cue; citations open the
  `FileViewer` at the page (instead of new-tab signed URL).
- **Removed** `StartHomeworkDialog`; **changed** course page to drop the Start Homework
  button and any "My Solutions" grouping, leaving `New Document` as the primary CTA.
- **Removed** `src/lib/actions/homework.ts` and homework types in `src/types/database.ts`.

## 9. Testing plan

**Unit (Vitest)**

- attach/detach/get actions: ownership + course checks, dedupe, polymorphic validation.
- `match_source_ids` wrapper behavior (param passthrough).
- buildAiContext focus pass: attached chunks present + ranked first; prompt line added;
  pageRange propagated.
- migration logic reasoning covered via action/data tests.

**Integration (local Supabase)**

- attach a course material / Moodle file / personal file → row created with RLS; detach.
- getContextFiles resolves names across the three source tables.
- deletePersonalFile removes embeddings.

**E2E (Playwright) — real user flows, shared `e2e/helpers/auth.ts`, no `test.skip`**

1. **Attach & detach a file**: log in → open a course document → open Context panel → attach
   a course material/Moodle file → see it listed → detach it.
2. **Open Moodle PDF in viewer**: attach an imported Moodle PDF → click it → read-only viewer
   opens and renders the PDF.
3. **AI answer → citation → viewer (mocked AI)**: mock the AI response (`page.route`, per the
   existing no-Gemini-key-in-CI pattern) returning an answer with a citation → click citation
   → viewer opens at the cited page.
4. **Start Homework is gone**: the old entry point no longer exists; `New Document` is the
   primary action on the course page.

- Update `e2e/TEST_REGISTRY.md` with these scenarios before writing the tests.

**Full suite gate:** `pnpm test && pnpm test:integration && pnpm test:e2e` must pass.

## 10. Phasing (incremental, testable)

1. **DB**: `document_context_files` + RLS + homework-tables migration + `match_source_ids`
   param. Types in `src/types/database.ts`.
2. **Actions/AI**: attach/detach/get actions; `searchContext`/`matchEmbeddings` focus param;
   `buildAiContext` focus pass + prompt line + pageRange; `deletePersonalFile` embedding fix.
3. **UI — Context panel** wired into both editors with the add-picker + empty state.
4. **UI — read-only viewer** + citation jump-to-page.
5. **Remove Start Homework** (dialog, actions, types, course-page button + grouping).
6. **Tests** at every level + `TEST_REGISTRY.md`; run the full suite.

## 11. Risks / open items

- **DOCX viewing** is intentionally minimal in v1 (read-only HTML); revisit if needed.
- **Focus-pass ranking**: ensure attached chunks aren't crowded out — covered by the scoped
  `match_source_ids` retrieval, merged attached-first.
- **Migration on real data**: likely minimal (homework feature is new on `dev`), but written
  to be idempotent/forward-only and to drop non-file exercise/material links cleanly.
- **Stale-read caution**: implementation must re-read target files fresh before editing.
