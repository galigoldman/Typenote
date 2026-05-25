# Homework-Focused AI Context + Flat Course Model

**Date:** 2026-05-25
**Branch:** `feat/homework-focused-ai-context` (off `origin/dev`)
**Status:** Design — awaiting review

---

## 1. Background & problem

Feature `046-homework-ai-context` shipped a "Start Homework" flow: a student picks an
exercise + reference materials and gets a new homework document. But it is **half-built**:

- `getHomeworkContext()` is fully implemented yet **never called** — the AI has zero
  awareness of the exercise or the chosen materials. The commit said *"AI context
  injection will be handled in a separate issue."* This is that issue.
- The app still organizes everything around **`course_weeks`**, a concept we no longer
  want. Weeks thread through 6 tables and ~6 UI components and make the course page
  slow and confusing.
- There are **two parallel "files on a course" mechanisms**: `course_materials`
  (embedded, was week-bound) and `personal_files` (NOT embedded, course-bound). A
  student sees two import buttons that do nearly the same thing, and **only one feeds
  the AI**. Manually-imported files are invisible to the tutor.
- The course page makes ~12 **sequential** DB round-trips and generates Moodle signed
  URLs **one file at a time in a loop** — it is slow.

## 2. Goals

1. **Remove `course_weeks` entirely.** A course becomes a flat bag of Documents +
   Materials + Moodle files.
2. **One "Materials" concept.** Moodle or manual — it's all "course material," and it is
   **always embedded on upload**.
3. **Per-user, per-course AI scoping (hard requirement).** Every user's AI answers from
   *their own* materials in *this* course — never another user's files, even in a shared
   Moodle course.
4. **Wire up Homework-focused AI context.** When a student works in a homework doc, the
   AI knows the exercise and the pinned materials, **prioritizes** them, but is **not
   restricted** to them — it still searches all the student's course materials and may
   use its own knowledge.
5. **Make it clear & discoverable.** Terminology "Homework"; the materials step must
   communicate that pinning *focuses* the AI, it does not *block* anything.
6. **Faster course page.** Load the minimum on first paint; lazy-load Moodle.

## 3. Non-goals

- Merging `personal_files` and `course_materials` into a single physical table (risky FK
  churn on `documents.personal_file_id`). We unify the *concept* and *embedding/scoping*,
  not the storage tables.
- Embedding the student's own documents for cross-document RAG (the current document and
  the exercise are injected directly; that is enough).
- Changing the Moodle scrape/sync pipeline.

---

## 4. Design

### 4.1 Data model — flatten weeks away

**Drop:**
- `course_weeks` table.
- `context_cache_registry` table + `get_week_file_refs()` RPC — confirmed dead (no live
  AI path references them).

**Re-parent to the course (forward-only migration):**

| Table | Today | After |
|---|---|---|
| `course_materials` | `week_id NOT NULL` | add `course_id`, backfill from `week → course`, drop `week_id` |
| `documents` | `week_id` nullable | drop `week_id` (+ drop `chk_week_requires_course`) |
| `personal_files` | `week_id` nullable | drop `week_id` |
| `content_embeddings` | `week_id` | drop `week_id` (+ drop `match_week_id` arg from `match_embeddings`) |

Backfill is guarded so no material is orphaned (every material's week resolves to a
course before we drop the column).

### 4.2 One "Materials" concept, always embedded

- **Manual import** → `personal_files` (the existing "Import File" path) **+ embed on
  upload**. New embedding `source_type = 'personal_file'`, scoped by `user_id`.
- **Moodle import** → existing `moodle_files` / `user_file_imports` flow, already embedded
  on upload, already per-user-scoped via the import whitelist.
- The **in-week `course_materials` upload UI is retired** (it only ever lived inside a
  week). Existing `course_materials` rows are re-parented to the course and continue to be
  searchable; going forward, manual imports use the single `personal_files` path.
- The course page shows **one "Materials" list** combining the user's `personal_files` and
  any legacy `course_materials`, behind **one "Import File" button**.

**Embedding pipeline changes (`indexContent` / `IndexSource`):**
- Add `{ type: 'personal_file'; fileId; courseId }` to `IndexSource`.
- Call `indexContent(...)` from the personal-file import action (fire-and-forget, same as
  Moodle).
- `match_embeddings` gains a `personal_file` branch, filtered by
  `ce.user_id = match_user_id` (per-user). Existing `course_material` (user-scoped) and
  `moodle_file` (whitelist-scoped) branches are unchanged except for dropping `week_id`.

### 4.3 AI context — Homework-aware (prioritize, don't restrict)

Client sends `homeworkSessionId` to `/api/ai/ask` when the open document is a homework doc.
Server resolves the session (`getHomeworkContext`) and builds **tiered** context:

1. **Tier 1 — Exercise (always injected):** full extracted text of the exercise (it may be
   a document, course_material, personal_file, or moodle_file — polymorphic per migration
   `20260524144454`). Labeled *"This is the exercise the student is working on."*
2. **Tier 2 — Pinned materials (always injected):** extracted text of each pinned material.
   Labeled *"Materials the student marked as most relevant."*
3. **Tier 3 — Everything else (RAG):** semantic search over **all the user's course
   materials** (course_materials + personal_files + moodle_files), exactly as today.
4. **Plus** the student's current document content (existing behavior).

**Token safety:** Tier 1 + Tier 2 injected text is capped/truncated per source so a huge
PDF cannot blow the context window; Tier 3 keeps the existing top-k.

**Embed-on-pin:** when a material is pinned into a homework that is not yet embedded
(shouldn't happen once 4.2 lands, but defensively), trigger `indexContent` so Tier 3 also
covers it.

**System prompt (`buildSystemPrompt`)** gains a homework mode:
- When `isHomeworkMode`, instruct the AI: ground answers in the exercise + pinned material
  *first*, but **freely use other course materials and your own knowledge**; **tutor** the
  student (guide, explain, hint) rather than just handing over the full solution.
- Drop the now-dead `"- Week X — Material Name"` citation format → `"- Material Name: …"`.

Non-homework documents keep today's behavior unchanged (RAG + current document).

### 4.4 UI / UX

- **Course page:** flat sections — **Documents**, **Materials** (one list, one "Import
  File" button), **Moodle** (collapsed, lazy-loaded). The **"Start Homework"** button stays
  prominent.
- **Start Homework dialog:**
  - Step 1 — *"Which exercise are you working on?"* (required).
  - Step 2 — *"Pin the most relevant materials (optional)"* with the line:
    *"The AI always sees all your course materials — pinning just tells it what to focus on
    first."* This directly defuses the "does it block other docs?" fear.
- **Inside a homework doc:** a small **"Homework context" chip/strip** showing the exercise
  + pinned materials, so the student *sees* what the AI is focused on. This is what finally
  consumes `getHomeworkContext()`.

### 4.5 Performance

- **Parallelize** the course-page queries with `Promise.all` (course, documents, materials,
  imports) instead of ~12 sequential awaits.
- **Lazy-load Moodle:** do **not** fetch Moodle sections/files or generate signed URLs on
  first paint. Load them via a server action only when the user expands the Moodle section.
  This removes the per-file signed-URL loop from the hot path.

### 4.6 Migration & data safety

Weeks are intentionally discarded (confirmed). The migration re-parents
materials/documents/files to `course_id`, then drops `course_weeks`,
`context_cache_registry`, and `get_week_file_refs`. Forward-only; backfill guarded so no
row is orphaned. Local dev seed (`supabase/seed.sql`) updated to the flat model.

---

## 5. Component boundaries (what each unit does)

- **Migration SQL** — purely structural; re-parent + drop. No app logic.
- **`indexContent` / embeddings query** — "given a source, embed it, store per-user-scoped
  rows; given a query + user + course, return that user's matching segments."
- **`getHomeworkContext` (exists)** — "given a homework document, return the exercise +
  pinned materials with display names." Consumed by both the API route (for injection) and
  the UI chip.
- **`/api/ai/ask`** — orchestrates: resolve homework context → build tiered context →
  stream. Does not own retrieval or prompt text.
- **`buildSystemPrompt`** — pure function: context flags in → prompt string out.
- **Course page (server component)** — fetch-minimum + render; Moodle behind a lazy client
  boundary.

---

## 6. Testing (per CLAUDE.md — all levels must pass)

- **Unit (Vitest):** `buildSystemPrompt` homework mode; context tiering/truncation logic.
- **Integration:** the flatten migration + RLS; embed-on-import for `personal_files`;
  `match_embeddings` per-user scoping (user A cannot retrieve user B's material in a shared
  Moodle course).
- **E2E (Playwright), real user flow:** log in → open a course → **Import a file**
  (verify it appears in Materials) → **Start Homework** → pick exercise + pin a material →
  in the homework doc, **ask the AI about the exercise** → assert the answer reflects the
  exercise/material context. Add scenarios to `e2e/TEST_REGISTRY.md`. Uses the shared
  `e2e/helpers/auth.ts`; no `test.skip`.

---

## 7. Shipping plan (one spec, reviewable phases)

Implemented together (as requested), but in independently-testable phases:

1. **Phase 1 — Flatten weeks + perf.** Migration, re-parent, drop dead cache, remove week
   UI, parallelize + lazy Moodle. Course page works on the flat model.
2. **Phase 2 — Embed all imports + unify Materials.** Embed `personal_files` on import, one
   Materials list, one import button, per-user scoping verified.
3. **Phase 3 — Homework AI wiring + UX.** `homeworkSessionId` through the chat → tiered
   context injection → homework system prompt → "pin" dialog copy → homework context chip.

Each phase is a PR to `dev`; CI (lint/format/unit/integration/build/E2E) must pass.

## 8. Risks

- **Migration correctness** — orphaning a material if a week→course backfill misses. Guard
  with a not-null check before dropping `week_id`; integration test covers it.
- **Token budget** — large pinned PDFs. Mitigated by per-source truncation in Tier 1/2.
- **dev/main divergence** — `main` has a near-duplicate "show Moodle files" fix
  (`eeea0f6`) vs dev's (`b7684f8`). We work off `dev`; this reconciles in the normal
  dev→main promote. No action needed now.

## 9. Resolved decisions

- Terminology: **Homework** (keeps `homework_sessions` table; no rename).
- AI behavior: **prioritize, don't restrict.**
- Materials: **one concept**, Moodle + manual, **always embedded**, **per-user scoped**.
- Weeks: **removed for good** (no data preservation needed).
- Base branch: **`origin/dev`.**
