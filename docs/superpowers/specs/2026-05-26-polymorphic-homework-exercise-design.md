# Polymorphic Homework Exercise — Design

**Date:** 2026-05-26
**Branch:** `feat/polymorphic-homework-exercise` (off `dev`, after PR #199 merged)
**Status:** design — awaiting user review before plan + implementation

## Goal

In the **Start Homework** dialog, let Step 1 ("Select the Exercise") pick the
exercise from **any imported source** — typed documents, course materials,
personal files, or Moodle files — not just typed `documents`. The created
homework document remains the blank workspace where the student writes their
solution.

## Context — current state

- **Dialog** (`src/components/dashboard/start-homework-dialog.tsx`): Step 1 lists
  only `documents` (single-select radio, value = bare document id). Step 2
  ("Materials") already lists all four sources as `${type}:${id}` checkboxes.
- **Server action** `createHomeworkSession` (`src/lib/actions/homework.ts`):
  takes `exerciseDocumentId: string`, validates it is a `documents` row owned by
  the user in the course, and writes `homework_sessions.exercise_document_id`.
- **Readers** assume the exercise is a document:
  - `getHomeworkContext` (`homework.ts`) reads `exercise_document_id` → returns
    `exerciseDocument: { id, title }` for the chip.
  - `resolveHomeworkContext` (`src/lib/ai/homework-context.ts`) reads
    `exercise_document_id`, extracts its text into Tier 1.
- **Schema is already polymorphic-ready.** Migration
  `20260524144454_add_moodle_file_to_homework_materials.sql` (shipped in #199)
  made `exercise_document_id` **nullable** and added `exercise_type text` +
  `exercise_id uuid`; `homework_session_materials.material_type` already includes
  `moodle_file`. **No migration is needed** — this work is application-layer only.

## Design

Reuse the existing `HomeworkMaterialType` for the exercise:

```ts
// the exercise can be any of the same four sources Step 2 already supports
type HomeworkExerciseType = HomeworkMaterialType;
// 'course_material' | 'personal_file' | 'document' | 'moodle_file'
```

### Data model — write & read

- **Write** (`createHomeworkSession`): always set `exercise_type = type` and
  `exercise_id = id`. Additionally set `exercise_document_id = id` **only when
  `type === 'document'`** (otherwise `null`). The legacy column is kept in sync
  for documents so any un-migrated reader and the unique/back-compat paths still
  work.
- **Read** (both readers): compute an _effective_ exercise ref with a fallback
  for pre-feature / seeded rows:

  ```ts
  const exercise = session.exercise_type
    ? { type: session.exercise_type, id: session.exercise_id }
    : { type: 'document', id: session.exercise_document_id }; // legacy rows
  ```

  This keeps the **seeded** homework session (`supabase/seed.sql`, which only
  sets `exercise_document_id`) and the existing homework E2E green without a
  data backfill.

### Change 1 — Dialog Step 1 (exercise picker)

- Render the same four source groups Step 2 renders, but as **single-select
  radios**, with `value = ${type}:${id}` (the same key format Step 2 uses for
  checkboxes). `selectedExercise` becomes the selected key string (or `null`).
- Step 2 already excludes the chosen document; **generalize** that exclusion to
  skip whichever `${type}:${id}` equals `selectedExercise`, across all groups.
- `handleSubmit` parses the key (reusing the existing `parseMaterialKey`) into
  `{ type, id }` and passes it as `exercise`.
- Moodle sections are already lazy-loaded on dialog open for Step 2; Step 1
  reuses that same state — no extra fetch.

### Change 2 — `createHomeworkSession`

- Signature: `{ courseId, exercise: { type, id }, materialRefs }` (replaces
  `exerciseDocumentId`).
- Validate + resolve the exercise display name via a new helper
  `resolveHomeworkSourceName(supabase, admin, type, id)` (below). The
  user-scoped `supabase` client means RLS returns `null` for any row the user
  can't access, so a `null` result doubles as the ownership check — throw
  `Exercise not found`. This preserves today's per-user guarantee for documents
  and extends it to the other source types.
- Title: `HW — ${name}` (name from the helper, e.g. `HW — homework-1.pdf`).
- Insert `exercise_type` / `exercise_id` (+ `exercise_document_id` for documents).

### Change 3 — name resolver + `getHomeworkContext` + chip

- Add `resolveHomeworkSourceName(supabase, admin, type, id)` →
  `Promise<string | null>` (name only — no storage download):
  - `document` → `documents.title`
  - `course_material` → `course_materials.label ?? file_name`
  - `personal_file` → `personal_files.display_name`
  - `moodle_file` → `moodle_files.file_name` via the **admin** client (shared
    registry; mirrors the existing material-name resolution in `getHomeworkContext`).
- `getHomeworkContext`: compute the effective exercise (with fallback), resolve
  its name via the helper, and return it in the existing
  `exerciseDocument: { id, title }` shape (`title` = resolved name).
  - **Minimal-churn choice:** keep the `HomeworkContext.exerciseDocument` field
    name and the chip unchanged — `title` now holds the source name regardless of
    type. A rename to `exercise` is deferred (see Non-goals).
  - DRY: replace the inline material-name resolution in `getHomeworkContext`'s
    loop with the same helper (low-risk cleanup, since we're editing this code).

### Change 4 — `resolveHomeworkContext` (AI Tier 1)

- Compute the effective exercise (with fallback), then branch:
  - `type === 'document'` → query `documents(title, content, pages)`;
    `exerciseName = title`, `exerciseText = cap(extractDocumentText(...))`
    (today's behavior).
  - **file types** → resolve **name only** (no storage download/extract);
    `exerciseText = ''`.
- **No change to `prompts.ts` or `ai-context.ts`.** The Tier-1 verbatim block is
  already gated on `homework?.exerciseText` being non-empty
  (`ai-context.ts:723`), and `buildSystemPrompt` only uses the exercise **name**.
  So a file exercise (`exerciseText === ''`) is named in the system prompt with
  **no verbatim dump**, and its content reaches the model through Tier-3 RAG
  (imported files are embedded at import time). `homeworkContextUsed` stays
  `true` because it is derived from `!!homework`, not from the injected text.

## Why (the "why" for interviews)

Notes and imported files use **different content pipelines**: a typed note lives
as ProseMirror JSON and is **not** RAG-indexed, so the AI needs its text injected
verbatim; an imported file is extracted, chunked, and **embedded at import**, so
RAG already covers its content and re-injecting it verbatim would waste the token
budget. Branching the exercise on type routes each source to the channel that
already exists for it — and keeps the design consistent with the
already-polymorphic `homework_session_materials`.

## Validation / security

`resolveHomeworkSourceName` enforces ownership by **construction**: it queries
`document` / `personal_file` / `course_material` through the **user-scoped**
`supabase` client, so RLS restricts results to rows the user may read and the
helper returns `null` for anything else (a cross-user or cross-course id simply
won't resolve). Only `moodle_file` is read through the **admin** client, because
that registry is intentionally shared (same trust model as Step-2 Moodle pinning
and the existing `getHomeworkContext`). `createHomeworkSession` treats `null` as
`Exercise not found`. Step-2 `materialRefs` remain unvalidated, exactly as today
(out of scope).

## Edge cases

- **Legacy / seeded rows** (`exercise_type` null): the read-side fallback treats
  them as `document` via `exercise_document_id`. The seeded homework E2E (open
  doc → chip shows "Problem Set 1: Variables") stays green with no backfill.
- **Unresolvable name:** helper returns `null` → `createHomeworkSession` throws
  `Exercise not found`; readers degrade to `"Exercise"` / `"Exercise unavailable"`.
- **Exercise also pinned as a material:** prevented in the UI (Step 2 excludes the
  chosen key). Backend doesn't enforce it; harmless duplication if it ever occurs.
- **Deleting a file exercise:** `exercise_id` is a plain `uuid` (no FK), so unlike
  the old `exercise_document_id` (`ON DELETE CASCADE`) deleting the source file
  does **not** cascade-delete the homework document/session — the session just
  resolves to "Exercise unavailable". This matches how
  `homework_session_materials.material_id` already behaves. Accepted.

## Testing

- **Unit** (`src/lib/ai/__tests__/homework-context.test.ts`): with a file-type
  exercise, `resolveHomeworkContext` returns the file name and `exerciseText === ''`
  (mock clients, no download). Existing document-exercise test stays green via the
  fallback path.
- **Integration** (`*.integration.test.ts`, service-role client + seeded data):
  `createHomeworkSession` with a file exercise writes `exercise_type`/`exercise_id`;
  `getHomeworkContext` returns the file's name in `exerciseDocument.title`.
- **E2E** (no Gemini key — mock `/api/ai/*` as the existing homework spec does):
  start homework from the course page (client-side nav), pick an **imported file**
  as the exercise, click Start, assert navigation to the new doc and that the chip
  shows the file name. Update `e2e/TEST_REGISTRY.md`.

## Non-goals (YAGNI)

- No dialog or terminology redesign — keep the two-step layout and the "Materials"
  wording.
- No rename of `HomeworkContext.exerciseDocument` (deferred to avoid churn across
  the type, chip, and tests).
- No verbatim extraction of file exercises — RAG covers them (explicit user call).
- No backfill migration of existing rows — the read-side fallback handles them.
