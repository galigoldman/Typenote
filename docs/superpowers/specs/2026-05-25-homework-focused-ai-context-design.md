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
4. **A persisted "Homework" object.** Homework is a first-class, **saved** concept that
   *links* a working document to an exercise + specific materials. These links are
   **references, not ownership**: the same exercise or material can back many homeworks,
   the materials remain independent course content, and removing/unpinning never deletes
   them. The link exists purely to give the AI **better context** — nothing is exclusive
   to one homework.
5. **Wire up Homework-focused AI context.** When a student works in a homework doc, the
   AI knows the exercise and the pinned materials, **prioritizes** them, but is **not
   restricted** to them — it still searches all the student's course materials and may
   use its own knowledge.
6. **Make it clear & discoverable.** Terminology "Homework"; the materials step must
   communicate that pinning *focuses* the AI, it does not *block* anything.
7. **Faster course page.** Load the minimum on first paint; lazy-load Moodle.

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

**Re-parent to the course (forward-only migration).** Note `course_materials` has **no
`course_id` today** — only `week_id NOT NULL` — so we add it.

| Table | Today | After |
|---|---|---|
| `course_materials` | `week_id NOT NULL`, no `course_id` | **add `course_id`** (FK→courses), backfill `course_id = week.course_id`, set NOT NULL, drop `week_id` |
| `documents` | `week_id` nullable (FK→course_weeks) | drop `week_id` + drop `chk_week_requires_course` |
| `personal_files` | `week_id` nullable (FK→course_weeks) | drop `week_id` |
| `content_embeddings` | `week_id` (FK→course_weeks) | drop `week_id` |

**Migration ordering (must be exact, or `DROP TABLE course_weeks` fails on dependent FKs):**
1. `ALTER course_materials ADD course_id`; backfill from `course_weeks`; `SET NOT NULL`.
2. Drop index `course_materials_week_idx (week_id, category)`; create `(course_id, category)`.
3. Drop the `week_id` columns/FKs on `course_materials`, `documents`, `personal_files`,
   `content_embeddings` (this also drops their FKs to `course_weeks`).
4. `DROP TABLE context_cache_registry` (its `week_id` FK goes with it).
5. `DROP FUNCTION get_week_file_refs`.
6. `DROP TABLE course_weeks`.
7. Recreate `match_embeddings` **without** the `match_week_id` arg and the
   `ce.week_id` filter.

Backfill is total by construction (`course_materials.week_id` is NOT NULL and
`course_weeks.course_id` is NOT NULL), so no orphan is possible — but we still assert
`COUNT(course_materials WHERE course_id IS NULL) = 0` before `SET NOT NULL` as a guard.
Any **RLS policy** referencing `week_id` is rewritten to the `course_id`/`user_id` basis.

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

**Per-user scoping — leak guard (security-critical).** `match_embeddings` is `LANGUAGE sql
STABLE` (not `SECURITY DEFINER`), so `content_embeddings` RLS still applies; the RPC's
`(ce.user_id = match_user_id OR ce.user_id IS NULL)` clause exists only so *shared*
`moodle_file` rows (`user_id IS NULL`) pass. **`personal_file` and `course_material`
embeddings MUST be inserted with a non-null `user_id`** — otherwise that NULL clause would
leak one user's material to everyone in the course. We enforce this with a DB `CHECK`
(`source_type IN ('personal_file','course_material') ⇒ user_id IS NOT NULL`) and a
dedicated integration test (user B cannot retrieve user A's personal_file in a shared
Moodle course).

**Embed timing / failure (best-effort, graceful).** Embedding runs async and may use
Gemini for PDF text extraction (slow, rate-limited). The window where a file is imported
but not yet embedded only affects **Tier 3 RAG** for *other* questions — it does **not**
affect a pinned material, because Tiers 1–2 inject the file's extracted text directly
(independent of embeddings). Failures are logged and retriable via the existing
`reindexCourse` path; we surface a lightweight "indexing…" state in the Materials list.

**Retire the second Moodle path.** `importMoodleFile` (`course-materials.ts`) creates
`course_materials` with `week_id` and is wired to `moodle-import-picker.tsx`. It is
redundant in the unified model (Moodle files are already embedded via the shared registry
and surfaced in Materials) — we remove it rather than port its `week_id` to `course_id`.

### 4.3 The Homework object (persisted, non-exclusive references)

The existing `homework_sessions` + `homework_session_materials` tables are exactly the
right shape and we keep them (they have no `week_id`, so the flatten doesn't touch them):

- `homework_sessions` — links one **working document** to an **exercise** (polymorphic:
  document / course_material / personal_file / moodle_file) + the course + the user. Saved
  once at creation; reopening the doc restores the context.
- `homework_session_materials` — the **pinned materials**: a polymorphic junction
  (`material_type` + `material_id`, **no FK**) pointing at course materials / personal
  files / documents / moodle files.

**Semantics (important):**
- **References, not ownership.** The exercise and pinned materials are normal course
  content that exists independently. A homework only *points at* them.
- **Non-exclusive / reusable.** The same exercise or material can be referenced by many
  homeworks. Pinning a material to homework A does not remove it from the course or from
  homework B, and does not hide it from the AI in any other context.
- **Durable but loosely coupled.** Because the junction has no FK, deleting an underlying
  material leaves a dangling reference; `getHomeworkContext()` already degrades gracefully
  (shows "Unknown material" and skips it). The flatten migration preserves all references
  because row `id`s are unchanged when we re-parent materials to `course_id`.

### 4.4 AI context — Homework-aware (prioritize, don't restrict)

**Plumbing (net-new — the client is homework-unaware today).** Nothing currently threads
the open document's id or homework status to the chat. We:
1. On the document page (server), call `getHomeworkContext({ documentId })`; if it returns
   a session, pass `homeworkSessionId` + the resolved context down through
   `DocumentWithAi → AiChatWrapper → AiChatPanel`.
2. `AiChatPanel` includes `homeworkSessionId` in the `/api/ai/ask` POST body.
3. `/api/ai/ask` accepts `homeworkSessionId`, re-resolves the session **server-side**
   (never trust client-supplied material lists), and builds the tiered context below.

Server builds **tiered** context:

1. **Tier 1 — Exercise (always injected):** the exercise's extracted text.
2. **Tier 2 — Pinned materials (always injected):** each pinned material's extracted text.
   Labeled *"Materials the student marked as most relevant."*
3. **Tier 3 — Everything else (RAG):** semantic search over **all the user's course
   materials** (course_materials + personal_files + moodle_files), exactly as today.
4. **Plus** the student's current document content (existing behavior).

**Text extraction per source type (B1 — the hard part).** The exercise and pinned items
are polymorphic; each type needs its own extraction path, all **server-side**:
- `document` — documents store **ProseMirror/TipTap JSON** (`pages`/`content` JSONB), not
  text, and the only existing extractor walks *live browser editors*. We add a **new
  server-side `extractDocumentText(doc)`** that walks the stored JSON and concatenates text
  nodes. **This is the common case** (today every exercise is a document), so it is
  required, not optional.
- `course_material` → download from `course-materials` bucket → existing PDF/DOCX extractor.
- `personal_file` → download from `personal-files` bucket → existing extractor.
- `moodle_file` → download from `moodle-materials` bucket (admin client) → existing
  extractor. (Requires finishing `moodle_file` support end-to-end — see §4.5.)

**Token budget (explicit).** Per-source cap (reuse `MAX_DOC_CHARS`-style limit, e.g. ~15k
chars each); cap the number of pinned sources injected verbatim (e.g. ≤ 5); enforce a
**total Tier-1+2 budget**; anything beyond it falls back to Tier-3 RAG rather than being
injected. Tier 3 keeps the existing top-k.

**Embed-on-pin:** when a material pinned into a homework is not yet embedded, trigger
`indexContent` so Tier 3 also covers it (Tiers 1–2 don't depend on embeddings).

**System prompt (`buildSystemPrompt`)** gains a homework mode:
- When `isHomeworkMode`, instruct the AI: ground answers in the exercise + pinned material
  *first*, but **freely use other course materials and your own knowledge**; **tutor** the
  student (guide, explain, hint) rather than just handing over the full solution.
- Drop the now-dead `"- Week X — Material Name"` citation format → `"- Material Name: …"`.

Non-homework documents keep today's behavior unchanged (RAG + current document).

### 4.5 UI / UX

- **Course page:** flat sections — **Documents**, **Materials** (one list, one "Import
  File" button), **Moodle** (collapsed, lazy-loaded). The **"Start Homework"** button stays
  prominent.
- **Start Homework dialog (rewrite — it currently groups materials by week):**
  - Step 1 — *"Which exercise are you working on?"* (required).
  - Step 2 — *"Pin the most relevant materials (optional)"* with the line:
    *"The AI always sees all your course materials — pinning just tells it what to focus on
    first."* This directly defuses the "does it block other docs?" fear.
  - Both steps list materials **flat** (no week sections) across all types: documents,
    materials (course_materials + personal_files), and Moodle files. `moodle_file` becomes
    a first-class pinnable type (and `getHomeworkContext` is extended to resolve its name
    from `moodle_files`, which it does not do today).
- **Inside a homework doc:** a small **"Homework context" chip/strip** showing the exercise
  + pinned materials, so the student *sees* what the AI is focused on. This is what finally
  consumes `getHomeworkContext()`.

### 4.6 Performance

- **Parallelize** the course-page queries with `Promise.all` (course, documents, materials,
  imports) instead of ~12 sequential awaits.
- **Lazy-load Moodle:** do **not** fetch Moodle sections/files or generate signed URLs on
  first paint. Load them via a server action only when the user expands the Moodle section.
  This removes the per-file signed-URL loop from the hot path.

### 4.7 Migration & data safety

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

- **Unit (Vitest):** `buildSystemPrompt` homework mode; context tiering/truncation logic;
  **`extractDocumentText`** (ProseMirror JSON → text).
- **Integration:** the flatten migration + RLS; embed-on-import for `personal_files`;
  `match_embeddings` per-user scoping — explicitly the **`personal_file` branch** (user B
  cannot retrieve user A's personal_file in a shared Moodle course).
- **E2E (Playwright), real user flow:** log in → open a course → **Import a file**
  (verify it appears in Materials) → **Start Homework** → pick exercise + pin a material →
  in the homework doc, **ask the AI about the exercise** → assert the answer reflects the
  exercise/material context. Add scenarios to `e2e/TEST_REGISTRY.md`. Uses the shared
  `e2e/helpers/auth.ts`; no `test.skip`.
- **Migrate existing tests + seed (will otherwise fail at setup):** `seed.sql` inserts
  `course_weeks` / `course_materials(week_id)` / `documents(week_id)` — rewrite to the flat
  model. Suites that insert or assert on `week_id` must be updated:
  `course-weeks-materials.integration.test.ts` (largely deleted), `embeddings.integration`,
  `schema.integration`, `rls-isolation.integration`, `ai-context.test`, `documents.integration`,
  `courses.integration`, `conversations.integration`, `search/validation.test`, plus component
  tests `move-document-dialog.test`, `material-upload.test`, `week-section.test`, `events.test`.

---

## 7. Shipping plan (one spec, reviewable phases)

Implemented together (as requested). The review showed Phases 1 and 3 are coupled — the
Start Homework dialog groups by week, so flattening *forces* the dialog rewrite — so we use
**two** honest, independently-testable phases rather than three:

1. **Phase 1 — Flat model + unified, embedded Materials + perf.** Migration (re-parent,
   FK-drop ordering, drop dead cache/RPC, drop `course_weeks`); remove all week UI; rewrite
   the Start Homework dialog to a flat material list; retire `importMoodleFile`; embed
   `personal_files` on import with the non-null `user_id` guard; one Materials list + one
   import button; parallelize the page + lazy-load Moodle; rewrite seed + broken tests.
   *Exit:* course page works on the flat model, every import is embedded + per-user scoped.
2. **Phase 2 — Homework AI context.** `extractDocumentText` + per-type extraction;
   `documentId`/`homeworkSessionId` plumbing through the chat; server-side session resolve;
   tiered injection + token budget; homework system-prompt mode; homework-context chip;
   extend `getHomeworkContext` for `moodle_file`. *Exit:* AI answers a homework doc with the
   exercise + pinned materials prioritized, all other materials still reachable.

Each phase is a PR to `dev`; CI (lint/format/unit/integration/build/E2E) must pass.

## 8. Risks

- **Document-text extraction (was a blocker)** — exercises are always documents, which
  store ProseMirror JSON, not text. Mitigated by the new server-side `extractDocumentText`
  (§4.4); covered by a unit test.
- **Per-user leak via `user_id IS NULL`** — manual-import embeddings must be non-null
  `user_id`. Mitigated by DB `CHECK` + a targeted RLS/RPC integration test (§4.2, §6).
- **Migration ordering** — dependent FKs must drop before `DROP TABLE course_weeks`
  (§4.1). Backfill is total by construction; we still assert zero-null before `SET NOT
  NULL`.
- **Token budget** — large pinned PDFs/exercise. Mitigated by per-source cap + max pinned
  count + total Tier-1+2 budget with RAG fallback (§4.4).
- **Blast radius** — ~29 source files + seed + ~12 test suites reference weeks; all must be
  updated in Phase 1 or CI fails. Tracked in §6.
- **dev/main divergence** — `main` has a near-duplicate "show Moodle files" fix
  (`eeea0f6`) vs dev's (`b7684f8`). We work off `dev`; this reconciles in the normal
  dev→main promote. No action needed now.

## 9. Cleanup carried in (nits from review)

- Delete the dead `SYSTEM_PROMPT` export when refactoring `prompts.ts`.
- Update `QuestionResult.sources` shape + any UI badge that reads `weekId` (compile break
  otherwise) and the `document_moved` analytics event's `week_id` property.
- Legacy `course_materials` in the flat Materials list stay **deletable** (via the existing
  `deleteCourseMaterial`) — **decided**.
- Add a `homework_context_used` analytics event for observability of AI-context injection.

## 10. Resolved decisions

- Terminology: **Homework** (keeps `homework_sessions` table; no rename).
- Homework is a **persisted object** that **references** (does not own) an exercise +
  materials; references are **non-exclusive/reusable** and exist only to improve AI context.
- AI behavior: **prioritize, don't restrict.**
- Materials: **one concept**, Moodle + manual, **always embedded**, **per-user scoped**.
- Weeks: **removed for good** (no data preservation needed).
- Base branch: **`origin/dev`.**
