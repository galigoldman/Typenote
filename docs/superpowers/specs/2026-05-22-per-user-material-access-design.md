# Per-user material access in AI chat

**Date:** 2026-05-22
**Status:** Draft — awaiting user approval
**Branch / PR:** `fix/ai-chat-per-user-material-access` → PR #184 (force-push)

---

## 1. Problem

The shared `moodle_files` registry is one row per file even when many users sync the same upstream Moodle course. Storage objects are already deduplicated by content hash. **Embeddings are not.**

`indexContent({ type: 'moodle_file', courseId })` writes embedding rows with `course_id = <caller's Typenote course_id>`, plus a `(source_type, source_id, segment_index)` unique constraint that forbids multiple rows per file segment. The chain of effects when two users (A then B) sync the same Moodle course and import the same file F:

1. User A imports F → `indexContent` runs → no rows exist → rows inserted with `course_id = A's Typenote course`.
2. User B imports F → `indexContent` runs → content-hash matches (same file bytes) → **skipped**. No rows for B's Typenote course exist.
3. User B's chat queries `match_embeddings` with `match_course_id = B's Typenote course` → zero rows match → AI replies "no materials".

If step 2 _had_ re-indexed instead of skipping (e.g. a content change), `upsertEmbeddings` deletes by `source_id` alone — so A's rows would be wiped and replaced with B's.

Reported symptom: _"for one user (maybe the one who uploaded the files) chat has access to material and for other it doesn't."_ This is consistent with the bug.

## 2. Goals

1. **One canonical set of embeddings per Moodle file.** Storage and embedding compute cost both stay at O(1) per file regardless of how many users sync.
2. **Per-user access** to those embeddings is derived from `user_file_imports` — _"if you have it in your materials list, the AI can see it."_
3. **Delete-from-notebook** for Moodle files: removes only the caller's `user_file_imports` row. The shared storage object and the shared embedding stay alive for other users.
4. **Forward-compatible** with two near-term features:
   - personal user-uploaded files indexed like NotebookLM (each user's own files indexed into their own course),
   - clickable source citations in AI responses (the citation badge becomes a link to the source file).

## 3. Non-goals

- Bulk-delete UI for the notebook (per-row delete only in this PR).
- Changing the `course_materials` model. Course materials are inherently per-user (one upload per user) and already work correctly; we touch nothing there.
- Background re-embedding of historical files. The migration backfills metadata via SQL UPDATE; no embedding API calls.

## 4. Data model

### `content_embeddings`

| Column                                           | `moodle_file` rows (today)                  | `moodle_file` rows (after fix)                                                                                                        | `course_material` rows                     |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `user_id`                                        | `NULL` (shared)                             | `NULL` (unchanged)                                                                                                                    | `<uploader>` (unchanged)                   |
| `course_id`                                      | `<first-indexer's Typenote course>` (buggy) | `moodle_sections.course_id` (= `moodle_courses.id`, the Typenote-side UUID PK of the upstream Moodle course; canonical, one-per-file) | `<uploader's Typenote course>` (unchanged) |
| `week_id`                                        | `NULL` typically                            | `NULL` (unchanged)                                                                                                                    | `<material's week>` (unchanged)            |
| `UNIQUE (source_type, source_id, segment_index)` | enforced                                    | **unchanged** — one row per file segment globally                                                                                     | unchanged                                  |

Key insight: a Moodle file belongs to exactly one upstream Moodle course (reached in our schema via `moodle_files.section_id → moodle_sections.course_id → moodle_courses.id`). That's its canonical home and never changes. Different users mirror that course into different Typenote courses, but the file's home in the registry is invariant. So `moodle_courses.id` (referred to throughout this doc as the "moodle_course_id" — which is also how `user_course_syncs.moodle_course_id` is named, distinct from the upstream text identifier `moodle_courses.moodle_course_id`) is the right key for the embedding row.

### `user_file_imports`

No schema change. Hard-delete the row when the user removes a file from their notebook.

The existing `status` enum (`'imported'`, `'removed_from_moodle'`) stays. `'removed_from_moodle'` continues to mean _"upstream removed this; we preserved an audit row"_ and is already excluded from the import-list filter in §5.2, so those rows correctly produce no RAG hits. If upstream later re-adds a file, the existing moodle-sync flow flips the status back to `'imported'` (via `recordUserFileImport`) on the user's next sync — no spec change needed.

User-initiated delete is just a `DELETE`, which is simpler and lossless (the user can re-import to re-create).

## 5. Code changes

### 5.1 `src/lib/actions/ai-context.ts` — `indexContent`

For `source.type === 'moodle_file'`:

- Select `storage_path, file_name, mime_type, section_id` from `moodle_files`, then resolve `section_id → moodle_sections.course_id`. (Alternatively: a single query with an inner-join via Supabase's `.select('storage_path, file_name, mime_type, moodle_sections!inner(course_id)')`.)
- Use the resolved `moodle_sections.course_id` (the `moodle_courses.id` of the file's upstream course) as the `courseId` variable for the embedding rows. **Ignore** `source.courseId` (the caller's Typenote course id) for the embedding row.
- The content-hash gate is now stable: any user importing file F looks up the row by `(source_type, source_id)` — the existing `(source_type, source_id, segment_index)` UNIQUE ensures there is only one row, with the canonical `course_id` — sees the existing hash, and short-circuits. No wasted re-embedding.

For `source.type === 'course_material'`: unchanged.

### 5.2 `src/lib/actions/ai-context.ts` — `searchContext`

Add a "resolve user's view" pre-step:

Use the regular (RLS-scoped) client — both `user_course_syncs` and `user_file_imports` have SELECT policies of `auth.uid() = user_id`, so the regular client naturally restricts results to the caller. No admin client needed.

```ts
const supabase = await createClient();

// 1. Resolve Typenote course → moodle_courses.id (if synced)
const { data: sync } = await supabase
  .from('user_course_syncs')
  .select('moodle_course_id')
  .eq('course_id', params.courseId)
  .maybeSingle();
const moodleCourseId = sync?.moodle_course_id ?? null;

// 2. Fetch the set of moodle files the user has imported
let importedMoodleFileIds: string[] | null = null;
if (moodleCourseId) {
  const { data: imports } = await supabase
    .from('user_file_imports')
    .select('moodle_file_id')
    .eq('status', 'imported');
  importedMoodleFileIds = (imports ?? []).map((i) => i.moodle_file_id);
}

// 3. Pass both to the RPC
const matches = await matchEmbeddings({
  queryEmbedding,
  userId,
  courseId: params.courseId,
  moodleCourseId,
  importedMoodleFileIds,
  ...
});
```

### 5.3 `src/lib/queries/embeddings.ts` — `matchEmbeddings`

Signature extends with two optional params; both default null:

```ts
matchEmbeddings({
  queryEmbedding,
  userId,
  courseId,
  moodleCourseId,
  importedMoodleFileIds,
  weekId,
  matchCount,
  similarityThreshold,
});
```

### 5.4 `supabase/migrations/20260522123000_per_user_material_access.sql`

```sql
-- Step A: Backfill — repoint moodle_file embeddings to the canonical
-- moodle_courses.id (today they point at the first-indexer's Typenote
-- course id, which causes the access bug for every later user).
-- moodle_files has no course_id — we reach the course through
-- moodle_sections.
UPDATE public.content_embeddings ce
SET course_id = ms.course_id
FROM public.moodle_files mf
JOIN public.moodle_sections ms ON ms.id = mf.section_id
WHERE ce.source_type = 'moodle_file'
  AND ce.source_id = mf.id
  AND ce.course_id IS DISTINCT FROM ms.course_id;

-- Step B: Replace match_embeddings RPC. The 00014 migration registered
-- the function with bare `vector` (not `extensions.vector`); we drop
-- using the exact form it was created with to avoid leaving the old
-- function alongside the new one.
DROP FUNCTION IF EXISTS public.match_embeddings(
  vector, uuid, uuid, uuid, integer, double precision
);

-- LANGUAGE sql STABLE matches the original 00012 declaration (00014
-- accidentally regressed to plpgsql). STABLE lets the planner cache
-- function results within a single query, which matters because RAG
-- hits this RPC on every chat turn.
CREATE OR REPLACE FUNCTION public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid DEFAULT NULL,
  match_moodle_course_id uuid DEFAULT NULL,
  match_imported_moodle_file_ids uuid[] DEFAULT NULL,
  match_week_id uuid DEFAULT NULL,
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id bigint,
  source_type text,
  source_id uuid,
  source_name text,
  segment_text text,
  page_start integer,
  page_end integer,
  course_id uuid,
  week_id uuid,
  mime_type text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.week_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM public.content_embeddings ce
  WHERE (ce.user_id = match_user_id OR ce.user_id IS NULL)
    AND (
      -- course_material: keyed by Typenote course_id, uploader owns the row
      (ce.source_type = 'course_material'
        AND match_course_id IS NOT NULL
        AND ce.course_id = match_course_id)
      OR
      -- moodle_file: keyed by moodle_courses.id (canonical); access is
      -- whitelisted by the user's imported file set
      (ce.source_type = 'moodle_file'
        AND match_moodle_course_id IS NOT NULL
        AND ce.course_id = match_moodle_course_id
        AND (match_imported_moodle_file_ids IS NULL
             OR ce.source_id = ANY(match_imported_moodle_file_ids)))
    )
    AND (match_week_id IS NULL OR ce.week_id = match_week_id)
    AND 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 5.5 Delete-from-notebook

**Server action** (new): `src/lib/actions/personal-materials.ts` (or extend an existing moodle-sync action file)

```ts
'use server';
export async function removeMoodleFileFromNotebook(
  moodleFileId: string,
  courseId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // RLS already enforces user_id = auth.uid(); the .eq() is
  // belt-and-suspenders.
  const { error } = await supabase
    .from('user_file_imports')
    .delete()
    .eq('moodle_file_id', moodleFileId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  // Codebase convention is literal-path revalidation
  // (src/lib/actions/documents.ts:152). The caller passes courseId
  // from the page so we don't derive it here.
  revalidatePath('/dashboard/courses/' + courseId);
}
```

**UI:** add a trash-icon button on each Moodle file row in `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`'s Moodle Materials section. Click → confirm dialog → server action → page revalidates and the row disappears.

For `course_materials`, the existing delete flow stays — same UX, different action.

### 5.6 Clickable source citations (in this PR)

The AI's source array currently looks like:

```ts
{
  (sourceType, sourceName, weekId, pageRange);
}
```

To make citations linkable:

1. In `buildAiContext`, after assembling `sources` from the match results, batch-fetch `storage_path` for each:
   - `moodle_file` source_ids → `SELECT id, storage_path FROM moodle_files WHERE id IN (...)`
   - `course_material` source_ids → `SELECT id, storage_path FROM course_materials WHERE id IN (...)`
2. Generate signed URLs in a single `Promise.all` over all storage paths: `supabase.storage.from(bucket).createSignedUrl(path, 3600)` (1 hr expiry).
3. Add `signedUrl: string | null` to each source.
4. In `ai-chat-panel.tsx`, render the citation badge as an `<a href={signedUrl} target="_blank" rel="noopener noreferrer">` when `signedUrl` is present; fall back to `<span>` otherwise.

Two batched DB queries + N parallel signed-URL generations adds well under 500 ms to the first SSE chunk. Acceptable for chat latency.

The SSE event `{ type: 'sources', sources: [...] }` payload gains the optional `signedUrl` field — backward compatible (older clients ignore unknown fields).

**Known wart:** signed URLs live for 1 hour. If a user deletes a file from their notebook after the AI cites it, the existing chat message's link will still resolve until expiry. Acceptable for v1 — the file isn't gone, the user just removed their personal access record; the signed URL is a direct storage handle that doesn't go through `user_file_imports`.

## 6. Backwards compatibility

- Existing embedding rows: the migration's `UPDATE` repoints them to `moodle_course_id` in-place. No row deletions, no embedding API calls.
- API contract: `match_embeddings` RPC signature changes, but only `searchContext` (in this repo) calls it. No external consumers.
- `user_file_imports` schema: unchanged. Existing rows untouched.

## 6.1 Edge-case behavior of the new RPC

| Caller state                                      | `match_course_id` | `match_moodle_course_id` | `match_imported_moodle_file_ids` | Result for moodle_file rows                                                              |
| ------------------------------------------------- | ----------------- | ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Course is Moodle-synced, user has imports         | typenote uuid     | moodle uuid              | non-empty `uuid[]`               | matched iff in the imported set                                                          |
| Course is Moodle-synced, user has no imports yet  | typenote uuid     | moodle uuid              | `[]`                             | none (correct — nothing in notebook)                                                     |
| Course is not Moodle-synced                       | typenote uuid     | `NULL`                   | `NULL`                           | none (no moodle branch fires). `course_material` rows still match via `match_course_id`. |
| Caller passes `NULL` for imported list explicitly | typenote uuid     | moodle uuid              | `NULL`                           | all moodle files in that Moodle course (today's permissive behavior)                     |

We deliberately treat `NULL` as "no filter" so the RPC remains usable for admin/diagnostic queries without changing its semantics from the caller side. `searchContext` always passes a concrete array (possibly empty); it never passes `NULL` for `match_imported_moodle_file_ids` when `match_moodle_course_id` is set.

## 7. Risk + rollback

- Risk: a user whose `user_course_syncs` row is missing (edge case — they imported files but the sync row got cleaned up) would not be able to see their moodle files in chat because `moodle_course_id` resolves to null. Mitigation: defensive null-check in `searchContext`; we can fall back to "no moodle results" cleanly, never to "leak other users' data".
- Rollback: revert the migration commit **and** the TS caller change in `src/lib/queries/embeddings.ts` (`matchEmbeddings` signature gains two params, all callers must revert in lockstep with the RPC). The old RPC signature is preserved in `00014_match_embeddings_return_text.sql` history; resurrecting it is a small inverse migration.

## 8. Test plan

- **Unit (Vitest):**
  - `indexContent` for `moodle_file` writes embedding row with `course_id = fileRow.course_id` (not `source.courseId`).
  - `searchContext` calls `matchEmbeddings` with both `courseId` and `moodleCourseId`/`importedMoodleFileIds` derived from the user's sync + imports.
  - `removeMoodleFileFromNotebook` deletes the right row and rejects unauthenticated calls.
- **Integration (against local Supabase):**
  - Seed two users, one shared moodle_file row, both users have `user_file_imports` for it. Both users' `match_embeddings` calls return the row.
  - Delete user B's import row. User B's `match_embeddings` no longer returns it. User A still does.
  - User has `user_course_syncs` but **zero imports** → `match_embeddings` returns no moodle_file rows (even though the embeddings exist).
  - Course with no Moodle sync but with `course_material` uploads → `match_embeddings` still returns the course_material rows via `match_course_id`.
  - Verify the backfill `UPDATE` repoints existing rows without violating the `UNIQUE` constraint.
  - Orphan-row resilience: an embedding row whose `moodle_files` parent was hard-deleted upstream remains in the table with a stale `course_id`. The backfill `UPDATE` simply skips it (no row in `mf`). Verify it doesn't break the migration; verify that orphaned moodle_file embeddings are eventually cleaned by `deleteEmbeddingsBySource` when the upstream sync flags the file removed (existing behavior — sanity-check it still runs).
- **E2E (Playwright):** two-user scenario per the original symptom. Logged in as A, import file, ask AI — answer cites the file. Logged in as B (same Moodle source), import the same file via the course page, ask AI — answer cites the file. Then delete from B's notebook, ask AI — no longer cited; A still works.
- **Manual:** clickable citation opens the file in a new tab via signed URL.
- **TEST_REGISTRY:** add the two-user RAG visibility scenario and the delete-from-notebook scenario to `e2e/TEST_REGISTRY.md`.

## 9. Out of scope follow-ups

- Bulk-select delete on the course page.
- "Restore from removed" UI if we later want to reverse `removed_from_moodle` rows.
- NotebookLM-style personal uploads at course scope — likely a small extension of `course_materials` with no model changes.
