# Homework-Focused AI Context — Phase 1: Flat Model + Unified Embedded Materials + Perf

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `course_weeks` concept (flatten everything to the course), make every imported material (Moodle + manual) embedded and per-user scoped, retire the duplicate material path, and make the course page fast.

**Architecture:** A single forward-only Supabase migration re-parents materials to `course_id` and drops the week tables/dead cache. The embedding pipeline gains a `personal_file` source type so manual imports are searchable, guarded by a DB `CHECK` so per-user scoping can't leak. The course page is parallelized and Moodle materials load lazily on expand.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase (Postgres + RLS + pgvector), TypeScript, Vitest (unit + integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-25-homework-focused-ai-context-design.md`

**Phase 2 (Homework AI context wiring) gets its own plan after Phase 1 merges** — its code depends on the post-flatten signatures produced here.

**Conventions for every task:** branch is `feat/homework-focused-ai-context` (off `origin/dev`). Run unit tests with `pnpm test`, integration with `pnpm test:integration`, E2E with `pnpm test:e2e`. Apply migrations + seed locally with `pnpm supabase db reset` (re-runs all migrations then `seed.sql`). Commit after each task.

---

## File map (what changes and why)

**Created**
- `supabase/migrations/20260525120000_flatten_remove_course_weeks.sql` — the structural flatten.
- `src/lib/actions/moodle-materials.ts` — `getMoodleMaterialsForCourse` server action (lazy Moodle load, extracted from the page).
- `src/components/dashboard/moodle-materials-section.tsx` — client component that fetches Moodle on expand.
- `src/lib/actions/__tests__/flatten-schema.integration.test.ts` — asserts the migrated schema.
- `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts` — embed-on-import + per-user scoping.

**Modified (core)**
- `src/types/database.ts` — drop `CourseWeek`, drop `week_id` fields, add `CourseMaterial.course_id`, drop `ChatSource.weekId`.
- `src/lib/queries/embeddings.ts` — drop `week_id`/`weekId` from `EmbeddingRow`/`MatchResult`/`matchEmbeddings`; delete `getWeekFileRefs`.
- `src/lib/actions/ai-context.ts` — drop week from `IndexSource`/`SearchParams`/`SearchResult`/`QuestionParams`/`QuestionResult`; add `personal_file` branch to `indexContent`; remove `weekLabel`/`weekId` from prompt + context builders; add `personal-files` signed-URL bucket.
- `src/lib/actions/personal-files.ts` — drop `weekId`; fire `indexContent` after import; drop `week_id` from `openPersonalFileAsDocument` doc inserts.
- `src/lib/actions/course-materials.ts` — `createCourseMaterial` takes `course_id`; delete `importMoodleFile`; drop `weekId` from the `indexContent` call site.
- `src/lib/ai/prompts.ts` — drop `weekLabel`; fix citation format; delete dead `SYSTEM_PROMPT`.
- `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — flat sections, `Promise.all`, lazy Moodle.
- `src/components/dashboard/start-homework-dialog.tsx` — flat material list (no week grouping), drop `weeks` prop.
- `src/lib/analytics/events.ts` — drop `week_id` from `document_moved`.

**Deleted**
- `src/lib/actions/course-weeks.ts`, `src/lib/queries/course-weeks.ts`
- `src/lib/ai/context-cache.ts` (+ its test)
- `src/components/dashboard/week-section.tsx` (+ test), `week-dialog.tsx`, `material-upload.tsx` (+ test)
- `src/components/dashboard/moodle-import-picker.tsx` (used only by week-section)
- `src/lib/actions/course-weeks-materials.integration.test.ts`

**Seed + tests touched:** `supabase/seed.sql`, and the suites listed in Task 13.

---

## Task 1: Flatten migration SQL

**Files:**
- Create: `supabase/migrations/20260525120000_flatten_remove_course_weeks.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Flatten the course model: remove course_weeks, re-parent materials to the
-- course, drop the dead week-keyed context cache, and add a per-user embedding
-- source type. Forward-only. Ordering matters: dependent FKs on course_weeks
-- must be dropped before `drop table course_weeks`.

-- 1. course_materials: add course_id, backfill from the week, enforce not-null.
alter table public.course_materials
  add column course_id uuid references public.courses(id) on delete cascade;

update public.course_materials cm
set course_id = cw.course_id
from public.course_weeks cw
where cm.week_id = cw.id;

-- Guard: no material may be left without a course before we lock it down.
do $$
begin
  if exists (select 1 from public.course_materials where course_id is null) then
    raise exception 'flatten aborted: course_materials with null course_id remain';
  end if;
end $$;

alter table public.course_materials alter column course_id set not null;

drop index if exists public.course_materials_week_idx;
create index course_materials_course_idx
  on public.course_materials(course_id, category);

alter table public.course_materials drop column week_id;

-- 2. documents: drop the week column + its guard constraint + index.
alter table public.documents drop constraint if exists chk_week_requires_course;
drop index if exists public.idx_documents_week_id;
alter table public.documents drop column if exists week_id;

-- 3. personal_files: drop the week column + index.
drop index if exists public.personal_files_week_idx;
alter table public.personal_files drop column if exists week_id;

-- 4. content_embeddings: drop week column; allow 'personal_file'; forbid
--    null user_id on owned source types (per-user scoping leak guard).
alter table public.content_embeddings drop column if exists week_id;

alter table public.content_embeddings
  drop constraint if exists content_embeddings_source_type_check;
alter table public.content_embeddings
  add constraint content_embeddings_source_type_check
  check (source_type in ('moodle_file', 'course_material', 'personal_file'));

alter table public.content_embeddings
  add constraint content_embeddings_owned_user_not_null
  check (source_type = 'moodle_file' or user_id is not null);

-- 5. Drop the dead week-keyed cache + its RPC.
drop table if exists public.context_cache_registry;
drop function if exists public.get_week_file_refs(uuid, uuid);

-- 6. Drop course_weeks (now that all FKs to it are gone).
drop table if exists public.course_weeks;

-- 7. Recreate match_embeddings WITHOUT match_week_id, and add a per-user
--    'personal_file' branch keyed on the Typenote course_id.
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], uuid, integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_count int default 8,
  similarity_threshold float default 0.3
)
returns table (
  id bigint,
  source_type text,
  source_id uuid,
  source_name text,
  segment_text text,
  page_start integer,
  page_end integer,
  course_id uuid,
  mime_type text,
  similarity float
)
language sql stable
as $$
  select
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (
      (ce.source_type = 'course_material'
        and match_course_id is not null
        and ce.course_id = match_course_id
        and ce.user_id = match_user_id)
      or
      (ce.source_type = 'personal_file'
        and match_course_id is not null
        and ce.course_id = match_course_id
        and ce.user_id = match_user_id)
      or
      (ce.source_type = 'moodle_file'
        and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Apply locally and verify it runs clean**

Run: `pnpm supabase db reset`
Expected: all migrations apply with no error; the new migration runs after `seed.sql` is rebuilt (seed is updated in Task 12 — for now `db reset` may fail at seed; if so, comment out the week inserts in `seed.sql` temporarily, finish Task 1's commit, and Task 12 fixes seed properly). To verify the migration alone before seed, run it against a fresh db: `pnpm supabase db reset --no-seed` if supported, else inspect with: `pnpm supabase db diff` shows no pending drift.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525120000_flatten_remove_course_weeks.sql
git commit -m "feat(db): flatten course model — drop course_weeks, re-parent materials, add personal_file embeddings"
```

---

## Task 2: Schema integration test (TDD anchor for the migration)

**Files:**
- Create: `src/lib/actions/__tests__/flatten-schema.integration.test.ts`

- [ ] **Step 1: Write the test** (uses the project's integration Supabase client; mirror the connection setup in `src/lib/actions/courses.integration.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

describe('flatten migration schema', () => {
  const admin = createAdminClient();

  it('course_weeks table no longer exists', async () => {
    const { error } = await admin.from('course_weeks').select('id').limit(1);
    expect(error?.message ?? '').toMatch(/does not exist|could not find/i);
  });

  it('course_materials has course_id and no week_id', async () => {
    const { error } = await admin
      .from('course_materials')
      .select('id, course_id')
      .limit(1);
    expect(error).toBeNull();
    const { error: weekErr } = await admin
      .from('course_materials')
      .select('week_id')
      .limit(1);
    expect(weekErr?.message ?? '').toMatch(/week_id/i);
  });

  it('content_embeddings rejects a course_material row with null user_id', async () => {
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'course_material',
      source_id: '00000000-0000-0000-0000-000000000001',
      segment_index: 0,
      embedding: JSON.stringify(Array(1536).fill(0)),
      user_id: null,
      course_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/owned_user_not_null|violates check/i);
  });

  it('match_embeddings no longer accepts match_week_id', async () => {
    const { error } = await admin.rpc('match_embeddings', {
      query_embedding: JSON.stringify(Array(1536).fill(0)),
      match_user_id: '00000000-0000-0000-0000-000000000001',
      match_week_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/match_week_id|function .* does not exist/i);
  });
});
```

- [ ] **Step 2: Run — expect pass after `db reset`**

Run: `pnpm test:integration -- flatten-schema`
Expected: PASS (run `pnpm supabase db reset` first if not already migrated).

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/__tests__/flatten-schema.integration.test.ts
git commit -m "test(db): assert flattened schema + per-user embedding check"
```

---

## Task 3: TypeScript types — drop weeks

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Remove the `CourseWeek` interface** (lines 46-54). Delete the whole block.

- [ ] **Step 2: Edit `CourseMaterial`** — remove `week_id`, add `course_id`:

```ts
export interface CourseMaterial {
  id: string;
  course_id: string;
  user_id: string;
  category: MaterialCategory;
  storage_path: string;
  file_name: string;
  label: string | null;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Remove `week_id` lines** from `Document` (line 75) and `PersonalFile` (line 94), and remove `weekId` from `ChatSource` (line 192).

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: errors ONLY in files we modify in later tasks (ai-context.ts, embeddings.ts, page.tsx, dialog, etc.) — these guide Tasks 4-11. No errors that reference a still-existing `week` usage we don't plan to touch.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "refactor(types): drop CourseWeek and week_id fields"
```

---

## Task 4: Embeddings query layer — drop week, keep wrapper in sync with RPC

**Files:**
- Modify: `src/lib/queries/embeddings.ts`

- [ ] **Step 1: Remove `week_id` from `EmbeddingRow`** (delete line 14 `week_id: string | null;`).

- [ ] **Step 2: Remove `week_id` from `MatchResult`** (delete line 86 `week_id: string | null;`).

- [ ] **Step 3: Drop `weekId` from `matchEmbeddings`** — remove the `weekId?` param and the `match_week_id` rpc arg:

```ts
export async function matchEmbeddings(params: {
  queryEmbedding: number[];
  userId: string;
  courseId?: string | null;
  moodleCourseId?: string | null;
  importedMoodleFileIds?: string[] | null;
  matchCount?: number;
  similarityThreshold?: number;
}): Promise<MatchResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: JSON.stringify(params.queryEmbedding),
    match_user_id: params.userId,
    match_course_id: params.courseId ?? null,
    match_moodle_course_id: params.moodleCourseId ?? null,
    match_imported_moodle_file_ids: params.importedMoodleFileIds ?? null,
    match_count: params.matchCount ?? 8,
    similarity_threshold: params.similarityThreshold ?? 0.3,
  });

  if (error) throw new Error(`match_embeddings failed: ${error.message}`);
  return (data as MatchResult[]) ?? [];
}
```

- [ ] **Step 4: Delete `getWeekFileRefs` and the `FileRef` interface** (lines 117-137).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/embeddings.ts
git commit -m "refactor(embeddings): drop week_id from query layer; remove getWeekFileRefs"
```

---

## Task 5: `indexContent` — add `personal_file`, drop week

**Files:**
- Modify: `src/lib/actions/ai-context.ts`

- [ ] **Step 1: Replace the `IndexSource` union (lines 25-32):**

```ts
export type IndexSource =
  | { type: 'moodle_file'; fileId: string; courseId: string }
  | { type: 'course_material'; materialId: string; courseId: string }
  | { type: 'personal_file'; fileId: string; courseId: string };
```

- [ ] **Step 2: Remove week from `SearchParams` (delete `weekId?`, line 44), `SearchResult` (delete `weekId`, line 57), `QuestionParams` (delete `weekId?` line 65 and `weekLabel?` line 69), `QuestionResult.sources` (delete `weekId` line 80).**

- [ ] **Step 3: Rewrite the body of `indexContent` to branch on three source types and drop `weekId`.** Replace the `let weekId` declaration and the whole `if (source.type === 'moodle_file') { ... } else { ... }` block + the `week_id: weekId` row field. The moodle branch is unchanged except it no longer sets `weekId`. Add the `personal_file` branch alongside `course_material`:

```ts
    let fileBuffer: Buffer;
    let sourceName = '';
    let sourceType = '';
    let sourceId = '';
    let userId: string | null = null;
    let courseId: string | null = null;
    let mimeType = 'application/octet-stream';
    let storageBucket = '';

    if (source.type === 'moodle_file') {
      // ...UNCHANGED moodle branch, but DELETE the `weekId = source.weekId ?? null;`
      // line and the `let weekId` declaration above...
    } else if (source.type === 'course_material') {
      const supabase = await createClient();
      userId = await getAuthUserId();
      sourceType = 'course_material';
      sourceId = source.materialId;
      courseId = source.courseId;

      const { data: matRow, error: matErr } = await supabase
        .from('course_materials')
        .select('storage_path, file_name, mime_type')
        .eq('id', source.materialId)
        .single();
      if (matErr || !matRow) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Course material not found' };
      }
      sourceName = matRow.file_name;
      mimeType = matRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'course-materials';
      const { data: fileData, error: dlErr } = await supabase.storage
        .from(storageBucket).download(matRow.storage_path);
      if (dlErr || !fileData) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download course material' };
      }
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    } else {
      // personal_file
      const supabase = await createClient();
      userId = await getAuthUserId();
      sourceType = 'personal_file';
      sourceId = source.fileId;
      courseId = source.courseId;

      const { data: fileRow, error: fileErr } = await supabase
        .from('personal_files')
        .select('storage_path, file_name, mime_type')
        .eq('id', source.fileId)
        .single();
      if (fileErr || !fileRow) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Personal file not found' };
      }
      sourceName = fileRow.file_name;
      mimeType = fileRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'personal-files';
      const { data: fileData, error: dlErr } = await supabase.storage
        .from(storageBucket).download(fileRow.storage_path);
      if (dlErr || !fileData) {
        return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download personal file' };
      }
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    }
```

- [ ] **Step 4: Remove `week_id: weekId,` from the `rows.push({...})` `EmbeddingRow` (line 279).**

- [ ] **Step 5: In `searchContext`** — remove `weekId: params.weekId ?? null` from the `matchEmbeddings` call (line 358) and `weekId: m.week_id` from the returned mapping (line 371).

- [ ] **Step 6: In `askQuestion` and `buildAiContext`** — remove `weekLabel` from the destructure and from `buildSystemPrompt({...})`; remove `weekId: r.weekId` from each `sources.push({...})`. Add a `personal-files` bucket path to the signed-URL block in `buildAiContext`:

In `buildAiContext`, extend the id-collection and bucket map (around lines 608-662) so `personal_file` sources also get signed URLs:

```ts
  const personalIds = sourceIds
    .filter((s) => s.sourceType === 'personal_file')
    .map((s) => s.sourceId);
  // ...existing moodleIds / materialIds...

  const personalPaths: Record<string, string> = {};
  if (personalIds.length > 0) {
    const { data } = await supabase
      .from('personal_files')
      .select('id, storage_path')
      .in('id', personalIds);
    for (const row of (data ?? []) as { id: string; storage_path: string }[]) {
      personalPaths[row.id] = row.storage_path;
    }
  }
```

And in the `Promise.all(sourceIds.map(...))` bucket/path resolver, add the third case:

```ts
      const bucket =
        sourceType === 'moodle_file' ? 'moodle-materials'
        : sourceType === 'course_material' ? 'course-materials'
        : sourceType === 'personal_file' ? 'personal-files'
        : null;
      const path =
        sourceType === 'moodle_file' ? moodlePaths[sourceId]
        : sourceType === 'course_material' ? materialPaths[sourceId]
        : sourceType === 'personal_file' ? personalPaths[sourceId]
        : null;
      // personal-files is user-owned -> use the user-scoped `supabase` client, not admin
      const client = bucket === 'moodle-materials' ? admin : supabase;
```

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `ai-context.ts` (callers in route/components fixed in later tasks).

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/ai-context.ts
git commit -m "feat(ai): index personal_file sources; drop week from context pipeline"
```

---

## Task 6: Embed personal files on import

**Files:**
- Modify: `src/lib/actions/personal-files.ts`

- [ ] **Step 1: Drop `weekId` from `createPersonalFile`** — remove `weekId?` from the param type (line 9) and `week_id: data.weekId ?? null,` from the insert (line 30).

- [ ] **Step 2: Fire embedding after the insert succeeds** (only for embeddable mime types). Replace the tail of `createPersonalFile`:

```ts
  if (error) throw new Error(error.message);

  // Embed the file so the AI tutor can find it (manual imports were invisible
  // before). Fire-and-forget — failures are logged in indexContent and the file
  // still appears in Materials. Only PDF/DOCX/PPTX are extractable today.
  const embeddable =
    data.mimeType === 'application/pdf' ||
    data.mimeType.includes('wordprocessingml') ||
    data.mimeType.includes('presentationml');
  if (embeddable) {
    const { indexContent } = await import('@/lib/actions/ai-context');
    void indexContent({
      type: 'personal_file',
      fileId: file.id,
      courseId: data.courseId,
    });
  }

  revalidatePath('/dashboard');
  return { id: file.id };
```

- [ ] **Step 3: Drop `week_id` from both `documents` inserts** in `openPersonalFileAsDocument` (lines 135 and 192: remove `week_id: file.week_id ?? null,`).

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` (expect clean for this file)
```bash
git add src/lib/actions/personal-files.ts
git commit -m "feat(files): embed personal files on import; drop week_id"
```

---

## Task 7: Per-user embedding scoping integration test

**Files:**
- Create: `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts`

- [ ] **Step 1: Write the test** — two users, same course id; insert a `personal_file` embedding owned by user A; assert `match_embeddings` for user B (same course) returns zero rows, user A returns the row. (Insert embeddings directly via admin client to avoid needing real files; pattern follows `embeddings.integration.test.ts`.)

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

const admin = createAdminClient();
const COURSE = '00000000-0000-0000-0000-0000000000aa';
const USER_A = '00000000-0000-0000-0000-0000000000a1';
const USER_B = '00000000-0000-0000-0000-0000000000b1';
const SRC = '00000000-0000-0000-0000-0000000000c1';
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('personal_file per-user embedding scoping', () => {
  beforeAll(async () => {
    // seed profiles USER_A/USER_B + a course owned by USER_A in your test setup
    // helper, then:
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
    await admin.from('content_embeddings').insert({
      source_type: 'personal_file', source_id: SRC, segment_index: 0,
      segment_text: 'secret note', embedding: vec(0.01),
      user_id: USER_A, course_id: COURSE, source_name: 'a.pdf',
    });
  });

  it('owner (A) retrieves the personal_file', async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01), match_user_id: USER_A,
      match_course_id: COURSE, match_count: 8, similarity_threshold: 0,
    });
    expect((data ?? []).some((r: { source_id: string }) => r.source_id === SRC)).toBe(true);
  });

  it('other user (B) cannot retrieve A\'s personal_file', async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01), match_user_id: USER_B,
      match_course_id: COURSE, match_count: 8, similarity_threshold: 0,
    });
    expect((data ?? []).some((r: { source_id: string }) => r.source_id === SRC)).toBe(false);
  });
});
```

> Note: `match_embeddings` is `STABLE` (not `SECURITY DEFINER`); when called via the admin client RLS is bypassed, so this test exercises the RPC's own `user_id` filter — which is exactly the leak guard we care about.

- [ ] **Step 2: Run — expect pass**

Run: `pnpm test:integration -- personal-file-embedding`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/__tests__/personal-file-embedding.integration.test.ts
git commit -m "test(ai): personal_file embeddings are per-user scoped"
```

---

## Task 8: course-materials action — course_id, drop importMoodleFile

**Files:**
- Modify: `src/lib/actions/course-materials.ts`

- [ ] **Step 1: `createCourseMaterial`** — change the param `week_id: string` → `course_id: string` and the insert `week_id: data.week_id` → `course_id: data.course_id`.

- [ ] **Step 2: Delete `importMoodleFile` entirely** (lines 71-128). It created `course_materials` with `week_id` and is only used by `moodle-import-picker.tsx` (deleted in Task 11).

- [ ] **Step 3: Find the `indexContent` call site for `course_material`** (any caller passing `weekId`) and drop `weekId`. Run: `grep -rn "type: 'course_material'" src` — update each to the new `{ type, materialId, courseId }` shape.

- [ ] **Step 4: Typecheck + commit**

```bash
git add src/lib/actions/course-materials.ts
git commit -m "refactor(materials): course_id instead of week_id; remove importMoodleFile"
```

---

## Task 9: Prompts — drop weekLabel, fix citations, delete dead export

**Files:**
- Modify: `src/lib/ai/prompts.ts`

- [ ] **Step 1: Replace `SystemPromptContext` + `buildSystemPrompt`:**

```ts
export interface SystemPromptContext {
  courseName?: string;
  hasDocumentContent: boolean;
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  const { courseName, hasDocumentContent } = context;

  const courseContext = courseName
    ? `You are a tutor for **${courseName}**.`
    : 'You are a course tutor.';

  const documentContext = hasDocumentContent
    ? `\n\n## STUDENT'S DOCUMENT\nThe student has shared their current document with you. When they ask about their own writing (e.g., "is my solution correct?"), refer to its content specifically.`
    : '';

  return `${courseContext} You are a knowledgeable, friendly tutor and study partner. You have deep expertise in the subject matter AND access to the student's course materials.

## HOW TO USE COURSE MATERIALS

- **Course materials are your primary source.** When they contain relevant information, ground your answers in them and cite them.
- **You are also a smart AI.** If the materials don't cover something, use your own knowledge to help the student.
- **Be clear about what comes from where.** Cite materials you actually see; never fabricate citations.

## RESPONSE GUIDELINES

1. **ALWAYS match the language of the question.** If the student writes in English, respond in English even if materials are in Hebrew, and vice versa.
2. **Use LaTeX for math** wrapped in dollar signs (e.g., $E = mc^2$, $$\\int_0^\\infty f(x)\\,dx$$).
3. **Be pedagogical.** Explain step by step; guide toward understanding rather than just giving answers.
4. **Structure your answers** with markdown.
5. **Source citations format.** When you referenced course materials, list them at the end:
[Sources]
- Material Name: brief description of what was referenced
${documentContext}`;
}
```

- [ ] **Step 2: Delete the deprecated `SYSTEM_PROMPT` export** (the `export const SYSTEM_PROMPT = buildSystemPrompt({ hasDocumentContent: false });` line). Grep first: `grep -rn "SYSTEM_PROMPT\b" src` — if anything imports it, replace with a direct `buildSystemPrompt({ hasDocumentContent: false })` call there.

- [ ] **Step 3: Typecheck + commit**

```bash
git add src/lib/ai/prompts.ts
git commit -m "refactor(ai): drop weekLabel from system prompt; remove dead SYSTEM_PROMPT"
```

---

## Task 10: Lazy Moodle — server action + client section

**Files:**
- Create: `src/lib/actions/moodle-materials.ts`
- Create: `src/components/dashboard/moodle-materials-section.tsx`

- [ ] **Step 1: Extract the Moodle-loading logic** (currently inline in `page.tsx:121-227`) into a server action that returns sections + signed URLs, generating URLs in parallel:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type MoodleSectionDto = {
  id: string;
  title: string;
  files: Array<{
    id: string;
    file_name: string;
    type: string;
    mime_type: string | null;
    file_size: number | null;
    href: string;
    isStored: boolean;
  }>;
};

export async function getMoodleMaterialsForCourse(
  courseId: string,
): Promise<MoodleSectionDto[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: sync } = await admin
    .from('user_course_syncs')
    .select('moodle_course_id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  if (!sync?.moodle_course_id) return [];

  const { data: sections } = await admin
    .from('moodle_sections')
    .select('id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)')
    .eq('course_id', sync.moodle_course_id)
    .order('position');

  type FileRow = { id: string; file_name: string; type: string; moodle_url: string; storage_path: string | null; mime_type: string | null; file_size: number | null; position: number };
  type Sec = { id: string; title: string; position: number; moodle_files: FileRow[] };

  const allFileIds = (sections ?? [])
    .flatMap((s) => (s as Sec).moodle_files)
    .filter((f) => f.storage_path)
    .map((f) => f.id);

  let importedIds = new Set<string>();
  if (allFileIds.length > 0) {
    const { data: imports } = await admin
      .from('user_file_imports')
      .select('moodle_file_id')
      .eq('user_id', user.id)
      .eq('status', 'imported')
      .in('moodle_file_id', allFileIds);
    importedIds = new Set((imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id));
  }

  const visible = ((sections ?? []) as Sec[])
    .map((s) => ({ ...s, moodle_files: s.moodle_files.filter((f) => f.storage_path && importedIds.has(f.id)) }))
    .filter((s) => s.moodle_files.length > 0);

  // Generate all signed URLs in parallel (the old page did this one-by-one).
  const signed = new Map<string, string>();
  await Promise.all(
    visible.flatMap((s) => s.moodle_files).map(async (f) => {
      if (!f.storage_path) return;
      const { data } = await admin.storage.from('moodle-materials').createSignedUrl(f.storage_path, 3600);
      if (data?.signedUrl) signed.set(f.id, data.signedUrl);
    }),
  );

  return visible.map((s) => ({
    id: s.id,
    title: s.title,
    files: s.moodle_files
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        id: f.id, file_name: f.file_name, type: f.type, mime_type: f.mime_type,
        file_size: f.file_size, href: signed.get(f.id) ?? f.moodle_url, isStored: signed.has(f.id),
      })),
  }));
}
```

- [ ] **Step 2: Client section that loads on expand:**

```tsx
'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getMoodleMaterialsForCourse, type MoodleSectionDto } from '@/lib/actions/moodle-materials';
import { MoodleFileRow } from './moodle-file-row';

export function MoodleMaterialsSection({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<MoodleSectionDto[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && sections === null && !loading) {
      setLoading(true);
      try {
        setSections(await getMoodleMaterialsForCourse(courseId));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-6">
      <button onClick={toggle} className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        Moodle Materials
      </button>
      {open && (
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {sections?.length === 0 && <p className="text-sm text-muted-foreground">No imported Moodle files.</p>}
          {sections?.map((section) => (
            <div key={section.id} className="rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-medium">{section.title}</h3>
              </div>
              <div className="divide-y">
                {section.files.map((f) => (
                  <MoodleFileRow
                    key={f.id} fileId={f.id} fileName={f.file_name} fileType={f.type}
                    mimeType={f.mime_type} fileSize={f.file_size} href={f.href}
                    isStored={f.isStored} courseId={courseId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
git add src/lib/actions/moodle-materials.ts src/components/dashboard/moodle-materials-section.tsx
git commit -m "perf(moodle): lazy-load Moodle materials with parallel signed URLs"
```

---

## Task 11: Rewrite the course page (flat + parallel + lazy Moodle) and remove week UI

**Files:**
- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`
- Modify: `src/components/dashboard/start-homework-dialog.tsx`
- Delete: `week-section.tsx` (+ test), `week-dialog.tsx`, `material-upload.tsx` (+ test), `moodle-import-picker.tsx`
- Modify: `move-document-dialog.tsx`, `personal-file-upload.tsx`
- Delete: `src/lib/actions/course-weeks.ts`, `src/lib/queries/course-weeks.ts`, `src/lib/ai/context-cache.ts`

- [ ] **Step 1: Rewrite `page.tsx`.** Remove all week imports/fetches. Fetch course + documents + course_materials (by `course_id`) + personal_files (by `course_id`) + folder **in parallel** with `Promise.all`. Drop the inline Moodle block entirely (now lazy). Render flat sections: **Documents**, **Materials** (combined `course_materials` + `personal_files`, one list), then `<MoodleMaterialsSection courseId={courseId} />`. Keep the header buttons but drop `<WeekDialog>`; `StartHomeworkDialog` no longer receives `weeks`. Use this data-loading skeleton:

```tsx
const [{ data: documents }, { data: materials }, { data: personalFiles }] =
  await Promise.all([
    supabase.from('documents').select('*').eq('course_id', courseId).order('position'),
    supabase.from('course_materials').select('*').eq('course_id', courseId).order('created_at'),
    supabase.from('personal_files').select('*').eq('course_id', courseId).order('created_at'),
  ]);
```

(Keep the existing `linkedFileIds` filtering so personal files with a linked document are hidden.)

- [ ] **Step 2: Rewrite `start-homework-dialog.tsx`.** Read the current file. Remove the `weeks: CourseWeek[]` prop, the `CourseWeek` import, the `weekMap`, and the week-grouped materials block (lines ~106-107 and ~214-241). Replace Step-2's "Course materials grouped by week" with a single flat list mapping over the `materials` prop (now course-scoped). Keep documents + personal-files groups. Add the pin-context helper line under the Step-2 header:

```tsx
<p className="text-xs text-muted-foreground">
  The AI always sees all your course materials — pinning just tells it what to focus on first.
</p>
```

- [ ] **Step 3: Delete the week-only components and actions/queries** listed above. Then resolve fallout:
  - `move-document-dialog.tsx`: remove the week fetch/grouping + the `weekId` move destination (move targets become folder/course only).
  - `personal-file-upload.tsx`: remove the `weekId` prop.

- [ ] **Step 4: Typecheck — must be clean now**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no remaining `week` references in source).
Then: `grep -rn "week" src --include=*.ts --include=*.tsx | grep -iv "weekday\|weekly" | grep -i week` → expect only intentional matches (ideally none).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(course): flat course page, parallel fetch, lazy Moodle; remove week UI"
```

---

## Task 12: Analytics + seed

**Files:**
- Modify: `src/lib/analytics/events.ts`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Remove `week_id` from the `document_moved` event** in `events.ts` (`AnalyticsEventMap`) and any `trackEvent('document_moved', {...week_id...})` call site (`grep -rn "document_moved" src`).

- [ ] **Step 2: Rewrite the week-based seed.** In `supabase/seed.sql`, delete the `course_weeks` inserts; change `course_materials` inserts to use `course_id` (the test course id) instead of `week_id`; remove `week_id` from `documents` inserts. Keep the same number of materials so existing E2E counts still hold where possible.

- [ ] **Step 3: Apply + verify**

Run: `pnpm supabase db reset`
Expected: clean apply + seed with no error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/events.ts supabase/seed.sql
git commit -m "chore: drop week_id from analytics + reseed flat course model"
```

---

## Task 13: Fix the broken existing tests

**Files (update each to the flat model):**
`embeddings.integration.test.ts`, `schema.integration.test.ts`, `rls-isolation.integration.test.ts`, `ai-context.test.ts`, `documents.integration.test.ts`, `courses.integration.test.ts`, `conversations.integration.test.ts`, `search/validation.test.ts`, `move-document-dialog.test.tsx`, `events.test.ts`. **Delete:** `course-weeks-materials.integration.test.ts` (and the already-removed `material-upload.test.tsx`, `week-section.test.tsx`).

- [ ] **Step 1: Delete obsolete tests**

```bash
git rm src/lib/actions/course-weeks-materials.integration.test.ts
```

- [ ] **Step 2: For each remaining suite**, remove `week_id` from inserts/assertions and `weekId` from `indexContent`/`matchEmbeddings`/`searchContext` calls; change `course_materials` inserts to `course_id`. Run each suite to confirm green (work one file at a time).

- [ ] **Step 3: Full unit + integration run**

Run: `pnpm test && pnpm test:integration`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: migrate suites + seed to flat course model"
```

---

## Task 14: E2E — import file is embedded & searchable; flat course page

**Files:**
- Modify: `e2e/TEST_REGISTRY.md`
- Create/Modify: `e2e/course-materials.spec.ts` (or the existing course spec)

- [ ] **Step 1: Add scenarios to `e2e/TEST_REGISTRY.md`** describing: (a) course page renders flat Documents + Materials, no "Weeks" section; (b) importing a file shows it under Materials; (c) expanding Moodle loads on demand.

- [ ] **Step 2: Write the Playwright test** using `e2e/helpers/auth.ts` (`test@typenote.dev` / `Test1234`), no `test.skip`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('course page shows flat Documents + Materials and no Weeks section', async ({ page }) => {
  await login(page);
  await page.goto('/dashboard');
  // navigate into the seeded course (reuse the course-card helper)
  await page.getByRole('link', { name: /CS101|seeded course name/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Weeks' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Materials/i })).toBeVisible();
});
```

- [ ] **Step 3: Run E2E**

Run: `pnpm test:e2e -- course-materials`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/TEST_REGISTRY.md e2e/course-materials.spec.ts
git commit -m "test(e2e): flat course page + imported-file appears in Materials"
```

---

## Task 15: Full suite + open PR to dev

- [ ] **Step 1: Run everything**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: ALL PASS.

- [ ] **Step 2: Lint + format + build**

Run: `pnpm lint && pnpm exec prettier --check . && pnpm build`
Expected: clean.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/homework-focused-ai-context
gh pr create --base dev --title "Phase 1: flat course model + unified embedded materials + perf" --body "Implements Phase 1 of docs/superpowers/specs/2026-05-25-homework-focused-ai-context-design.md"
```

---

## Self-review notes (author)

- Spec §4.1 (flatten, FK ordering) → Tasks 1-2. §4.2 (embed all imports, non-null guard, retire importMoodleFile) → Tasks 5-8. §4.6 (perf, lazy Moodle) → Tasks 10-11. §4.5 dialog flat → Task 11 Step 2. §6 tests/seed → Tasks 2, 7, 12-14. §9 cleanup (SYSTEM_PROMPT, ChatSource.weekId, document_moved) → Tasks 3, 9, 12.
- Homework AI wiring (§4.3/§4.4) is intentionally **not** here — it is Phase 2.
- Type names are consistent across tasks: `IndexSource` personal_file shape `{ type, fileId, courseId }`; `matchEmbeddings` params drop `weekId`; `CourseMaterial.course_id`.
