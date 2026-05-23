# Per-user material access in AI chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI chat correctly find every Moodle file a user has imported, regardless of who indexed it first. Add a delete-from-notebook UI and clickable source citations.

**Architecture:** Move `content_embeddings.course_id` for `moodle_file` rows from "first-indexer's Typenote course" to the canonical `moodle_courses.id` of the file's upstream course (reached via `moodle_files.section_id → moodle_sections.course_id`). The AI's RAG `match_embeddings` RPC accepts two new params: `match_moodle_course_id` (canonical) and `match_imported_moodle_file_ids` (the caller's `user_file_imports` whitelist). Personal access is derived from `user_file_imports`, so embeddings and storage objects stay shared.

**Tech Stack:** TypeScript / Next.js 16 App Router, Supabase (Postgres + pgvector + Storage), Vitest, Playwright. Branch: `fix/ai-chat-per-user-material-access`. Reference spec: `docs/superpowers/specs/2026-05-22-per-user-material-access-design.md`.

---

## Pre-flight

Before you start: read the spec. The plan below assumes you've read it.

Confirm:

- Working directory is the worktree at `C:\projects\Typenote\.claude\worktrees\unified-juggling-matsumoto`.
- On branch `fix/ai-chat-per-user-material-access`.
- `git status` is clean.
- `pnpm install` already ran (it has — node_modules exists from earlier work).
- Local Supabase is running. From the worktree: `pnpm exec supabase status` should list services. If not running, start with Docker Desktop + `pnpm exec supabase start` from `C:\projects\Typenote`. **If Docker isn't available, document this and skip integration/E2E steps — flag those to the human reviewer.**

---

## Task 1: Write the migration SQL

**Files:**

- Create: `supabase/migrations/20260522123000_per_user_material_access.sql`

**Background:** Today's `match_embeddings` (from `00014_match_embeddings_return_text.sql`) takes 6 args and filters by a single `match_course_id`. We're replacing it with a function that handles two source types (`course_material` keyed by the user's Typenote `course_id`, `moodle_file` keyed by the canonical `moodle_courses.id`) plus a per-user file whitelist. We also backfill existing rows in-place (no embedding API calls).

- [ ] **Step 1.1: Create the migration file with the exact content below**

```sql
-- Per-user material access in AI chat
--
-- Background: moodle_files is a shared registry (one row per file even
-- when multiple users sync the same Moodle course). Embeddings used to
-- be tied to the FIRST indexer's Typenote course_id, so only one user
-- could ever find the file via RAG. This migration:
--
--   A. Repoints moodle_file embedding rows from <typenote course_id>
--      to the canonical moodle_courses.id (reached via
--      moodle_files.section_id -> moodle_sections.course_id).
--
--   B. Replaces match_embeddings with a version that handles two
--      source-type branches and accepts an imported-file whitelist for
--      per-user access enforcement.

-- ---------------------------------------------------------------------------
-- Step A: Backfill embedding course_id for moodle_file rows.
-- ---------------------------------------------------------------------------
update public.content_embeddings ce
set course_id = ms.course_id
from public.moodle_files mf
join public.moodle_sections ms on ms.id = mf.section_id
where ce.source_type = 'moodle_file'
  and ce.source_id = mf.id
  and ce.course_id is distinct from ms.course_id;

-- ---------------------------------------------------------------------------
-- Step B: Replace match_embeddings RPC.
--
-- 00014 registered the function with bare `vector` (not extensions.vector),
-- so we drop using the exact same form to avoid leaving the old function
-- alongside the new one.
--
-- LANGUAGE sql STABLE matches the original 00012 declaration (00014
-- accidentally regressed to plpgsql). STABLE lets the planner cache
-- function results within a single query, which matters because RAG
-- hits this RPC on every chat turn.
-- ---------------------------------------------------------------------------
drop function if exists public.match_embeddings(
  vector, uuid, uuid, uuid, integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_week_id uuid default null,
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
  week_id uuid,
  mime_type text,
  similarity float
)
language sql stable
as $$
  select
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.week_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (ce.user_id = match_user_id or ce.user_id is null)
    and (
      -- course_material: keyed by Typenote course_id, uploader owns the row
      (ce.source_type = 'course_material'
        and match_course_id is not null
        and ce.course_id = match_course_id)
      or
      -- moodle_file: keyed by moodle_courses.id (canonical); access is
      -- whitelisted by the user's imported file set
      (ce.source_type = 'moodle_file'
        and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and (match_week_id is null or ce.week_id = match_week_id)
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 1.2: Apply the migration locally (skip if Supabase is unavailable)**

Run from the worktree root:

```bash
pnpm exec supabase migration up
```

Expected: prints `Applying migration 20260522123000_per_user_material_access.sql...` and exits 0.

- [ ] **Step 1.3: Smoke-check the new function exists with the right signature (non-destructive)**

Do **not** `supabase db reset` — that wipes seed data needed for later integration tests. Instead, inspect the live database directly:

```bash
pnpm exec supabase db dump --schema-only -f schema-dump.sql && grep -A 2 "match_embeddings" schema-dump.sql | head -40 && rm schema-dump.sql
```

Expected: see `match_embeddings(query_embedding...match_moodle_course_id...match_imported_moodle_file_ids...)` in the output.

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260522123000_per_user_material_access.sql
git commit -m "feat(db): per-user material access migration

Repoints moodle_file content_embeddings rows from the first-indexer's
Typenote course_id to the canonical moodle_courses.id (reached via
moodle_files.section_id -> moodle_sections.course_id), and replaces
match_embeddings with a version that handles two source-type branches
plus a per-user file whitelist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Update `matchEmbeddings` TS signature

**Files:**

- Modify: `src/lib/queries/embeddings.ts` (the `matchEmbeddings` function around line 91)
- Test: `src/lib/queries/__tests__/embeddings.integration.test.ts` (NEW test for new params)

**Background:** The TS wrapper for the RPC needs the new params. We follow TDD: add the failing test first (it'll fail because the RPC throws when called with old params after the migration, OR because the TS signature is missing the params).

- [ ] **Step 2.1: Write a failing integration test for the new signature**

Append to `src/lib/queries/__tests__/embeddings.integration.test.ts` (this file already has a similar setup):

```ts
import { matchEmbeddings } from '../embeddings';

describe('matchEmbeddings new signature', () => {
  it('accepts moodleCourseId and importedMoodleFileIds without throwing', async () => {
    // Smoke test the new params are wired through the RPC; functional
    // behavior is covered in subsequent tasks.
    const result = await matchEmbeddings({
      queryEmbedding: Array.from({ length: 1536 }, () => 0),
      userId: TEST_USER_ID,
      courseId: COURSE_ID,
      moodleCourseId: null,
      importedMoodleFileIds: null,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run the test, confirm it fails**

```bash
pnpm test:integration src/lib/queries/__tests__/embeddings.integration.test.ts -t "new signature"
```

Expected: type error or "argument missing" — proves the signature isn't there yet.

- [ ] **Step 2.3: Update `matchEmbeddings` signature and body**

Replace the existing `matchEmbeddings` function in `src/lib/queries/embeddings.ts` with:

```ts
export async function matchEmbeddings(params: {
  queryEmbedding: number[];
  userId: string;
  courseId?: string | null;
  moodleCourseId?: string | null;
  importedMoodleFileIds?: string[] | null;
  weekId?: string | null;
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
    match_week_id: params.weekId ?? null,
    match_count: params.matchCount ?? 8,
    similarity_threshold: params.similarityThreshold ?? 0.3,
  });

  if (error) throw new Error(`match_embeddings failed: ${error.message}`);
  return (data as MatchResult[]) ?? [];
}
```

- [ ] **Step 2.4: Run the test, confirm it passes**

```bash
pnpm test:integration src/lib/queries/__tests__/embeddings.integration.test.ts -t "new signature"
```

Expected: PASS.

- [ ] **Step 2.5: Run the full embeddings integration suite to make sure existing tests still pass**

```bash
pnpm test:integration src/lib/queries/__tests__/embeddings.integration.test.ts
```

Expected: ALL PASS.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/queries/embeddings.ts src/lib/queries/__tests__/embeddings.integration.test.ts
git commit -m "feat(queries): matchEmbeddings accepts moodleCourseId and importedMoodleFileIds

Mirrors the new RPC signature. Existing callers default the new params
to null (no behavior change yet); searchContext will start passing
real values in a subsequent task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `indexContent` uses canonical `moodle_courses.id` for moodle_file

**Files:**

- Modify: `src/lib/actions/ai-context.ts` (the `if (source.type === 'moodle_file')` block around line 124)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts` (the "embeds moodle_file as shared" test and add a new one)

**Background:** Today the embedding row for a moodle_file gets `course_id = source.courseId` (caller's Typenote course). After this task it gets `course_id = moodle_sections.course_id` — the canonical id. We pull `section_id` from `moodle_files`, then join (or do two-step lookup) to `moodle_sections`.

- [ ] **Step 3.1: Update the existing test to assert the canonical id**

Find the test "embeds moodle_file as shared (user_id=null)" in `src/lib/actions/__tests__/ai-context.test.ts` and add an assertion for `course_id`. First, update the `createAdminClient` mock at the top of the file so the `from('moodle_files').select(...).eq(...).single()` chain returns a row with `section_id` set. Locate the mock around lines 58–83 and update it to:

```ts
vi.mock('@/lib/supabase/admin', () => {
  const moodleFileRow = {
    storage_path: 'test/path.pdf',
    file_name: 'lecture.pdf',
    mime_type: 'application/pdf',
    section_id: 'section-1',
  };
  const moodleSectionRow = { course_id: 'moodle-course-1' };

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        const data =
          table === 'moodle_files'
            ? moodleFileRow
            : table === 'moodle_sections'
              ? moodleSectionRow
              : null;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data, error: null })),
            })),
          })),
        };
      }),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({
            data: new Blob(['fake pdf content']),
            error: null,
          })),
        })),
      },
    })),
  };
});
```

Then update the moodle_file test to assert the canonical course_id:

```ts
it('embeds moodle_file with canonical moodle_courses.id (not caller course_id)', async () => {
  const result = await indexContent({
    type: 'moodle_file',
    fileId: 'file-1',
    courseId: 'callers-typenote-course', // should be IGNORED for the embedding row
  });

  expect(result.success).toBe(true);
  expect(upsertEmbeddings).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        user_id: null,
        course_id: 'moodle-course-1', // looked up via section_id
      }),
    ]),
  );
});
```

- [ ] **Step 3.2: Run the test, confirm it fails**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts -t "canonical moodle_courses.id"
```

Expected: FAIL — current impl writes `course_id = 'callers-typenote-course'`.

- [ ] **Step 3.3: Update `indexContent` for moodle_file**

Locate the `if (source.type === 'moodle_file')` block in `src/lib/actions/ai-context.ts` (around lines 124–164) and:

1. Add `section_id` to the `select(...)` on the moodle_files lookup.
2. After the existing `fileRow` check, look up the section's course_id.
3. Reassign `courseId` to the canonical value before the embedding rows are constructed.

Concretely, after the existing block that selects from `moodle_files`, replace:

```ts
const { data: fileRow, error: fileErr } = await admin
  .from('moodle_files')
  .select('storage_path, file_name, mime_type')
  .eq('id', source.fileId)
  .single();

if (fileErr || !fileRow?.storage_path) {
  return {
    success: false,
    segmentsIndexed: 0,
    skipped: false,
    error: 'Moodle file not found or no storage path',
  };
}

sourceName = fileRow.file_name;
mimeType = fileRow.mime_type ?? 'application/octet-stream';
storageBucket = 'moodle-materials';
```

with:

```ts
const { data: fileRow, error: fileErr } = await admin
  .from('moodle_files')
  .select('storage_path, file_name, mime_type, section_id')
  .eq('id', source.fileId)
  .single();

if (fileErr || !fileRow?.storage_path) {
  return {
    success: false,
    segmentsIndexed: 0,
    skipped: false,
    error: 'Moodle file not found or no storage path',
  };
}

// Look up canonical moodle_courses.id via the section. This is the file's
// upstream home and stays stable across users — using it on the embedding
// row makes the same file findable for everyone who imports it.
const { data: sectionRow, error: sectionErr } = await admin
  .from('moodle_sections')
  .select('course_id')
  .eq('id', fileRow.section_id)
  .single();

if (sectionErr || !sectionRow?.course_id) {
  return {
    success: false,
    segmentsIndexed: 0,
    skipped: false,
    error: 'Moodle section not found for file',
  };
}

courseId = sectionRow.course_id;
sourceName = fileRow.file_name;
mimeType = fileRow.mime_type ?? 'application/octet-stream';
storageBucket = 'moodle-materials';
```

- [ ] **Step 3.4: Run the unit tests, confirm they pass**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts
```

Expected: ALL PASS, including the new assertion.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "fix(ai): index moodle_file embeddings with canonical moodle_courses.id

Resolves the file's section_id to moodle_sections.course_id and uses
that as the embedding row's course_id, instead of the caller's Typenote
course_id. This is the canonical, one-per-file key, so every user who
imports the file finds the same embedding row via RAG.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `searchContext` resolves moodle_course_id and imported files

**Files:**

- Modify: `src/lib/actions/ai-context.ts` (the `searchContext` function around line 289)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts` (the existing `searchContext` describe block)

**Background:** Today `searchContext` passes only `courseId` (Typenote) to the RPC. After this task it also resolves the user's `user_course_syncs` entry to get the canonical `moodle_courses.id`, fetches the user's `user_file_imports`, and passes both to `matchEmbeddings`. Use the regular (RLS-scoped) Supabase client — `user_course_syncs` and `user_file_imports` both have SELECT policies restricting to `auth.uid()`.

- [ ] **Step 4.1: Write a failing test for the new pass-through**

In `src/lib/actions/__tests__/ai-context.test.ts`, add a new test inside the existing `describe('searchContext', ...)` block. First make sure the `createClient` mock at lines 25–56 returns sensible rows for `user_course_syncs` and `user_file_imports`. Replace the existing mock with:

```ts
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      const data =
        table === 'user_course_syncs'
          ? { moodle_course_id: 'moodle-course-1' }
          : table === 'course_materials'
            ? {
                storage_path: 'test/path.pdf',
                file_name: 'lecture.pdf',
                mime_type: 'application/pdf',
              }
            : null;
      const imports = [
        { moodle_file_id: 'imported-file-a' },
        { moodle_file_id: 'imported-file-b' },
      ];
      const result =
        table === 'user_file_imports'
          ? { data: imports, error: null }
          : { data, error: null };
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => result),
        single: vi.fn(async () => result),
      };
      // For non-single queries (user_file_imports), the awaitable form
      // resolves directly with { data, error }
      chain.then = (resolve: any) => resolve(result);
      return chain;
    }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob(['fake file content']),
          error: null,
        })),
      })),
    },
  })),
}));
```

(If the existing test for `searchContext` doesn't depend on the previous mock's `single()` shape, you only need to add `user_course_syncs` and `user_file_imports` handling. Apply the smaller diff and keep existing tests green.)

Then add this test:

```ts
it('passes resolved moodleCourseId and importedMoodleFileIds to matchEmbeddings', async () => {
  const { matchEmbeddings } = await import('@/lib/queries/embeddings');
  vi.mocked(matchEmbeddings).mockResolvedValueOnce([]);

  await searchContext({
    query: 'what is in lecture 5?',
    courseId: 'callers-typenote-course',
  });

  expect(matchEmbeddings).toHaveBeenCalledWith(
    expect.objectContaining({
      courseId: 'callers-typenote-course',
      moodleCourseId: 'moodle-course-1',
      importedMoodleFileIds: ['imported-file-a', 'imported-file-b'],
    }),
  );
});
```

- [ ] **Step 4.2: Run the test, confirm it fails**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts -t "passes resolved moodleCourseId"
```

Expected: FAIL — `searchContext` doesn't look these up yet.

- [ ] **Step 4.3: Update `searchContext`**

Replace the body of `searchContext` in `src/lib/actions/ai-context.ts` (around line 289) with:

```ts
export async function searchContext(
  params: SearchParams,
): Promise<SearchResult[]> {
  const userId = await getAuthUserId();
  const supabase = await createClient();
  const queryEmbedding = await embedQuery(params.query);

  // Resolve Typenote course -> canonical moodle_courses.id (if synced).
  // RLS restricts user_course_syncs to the caller, so no user_id filter
  // needed here.
  let moodleCourseId: string | null = null;
  let importedMoodleFileIds: string[] | null = null;
  if (params.courseId) {
    const { data: sync } = await supabase
      .from('user_course_syncs')
      .select('moodle_course_id')
      .eq('course_id', params.courseId)
      .maybeSingle();
    moodleCourseId =
      (sync as { moodle_course_id: string | null } | null)?.moodle_course_id ??
      null;

    if (moodleCourseId) {
      // Fetch the user's notebook — the set of moodle files they have
      // chosen to include. user_file_imports SELECT policy restricts
      // to the caller already.
      const { data: imports } = await supabase
        .from('user_file_imports')
        .select('moodle_file_id')
        .eq('status', 'imported');
      importedMoodleFileIds = (
        (imports as { moodle_file_id: string }[] | null) ?? []
      ).map((i) => i.moodle_file_id);
    }
  }

  const matches: MatchResult[] = await matchEmbeddings({
    queryEmbedding,
    userId,
    courseId: params.courseId,
    moodleCourseId,
    importedMoodleFileIds,
    weekId: params.weekId ?? null,
    matchCount: params.maxResults ?? 8,
  });

  return matches.map((m) => ({
    id: m.id,
    sourceType: m.source_type,
    sourceId: m.source_id,
    sourceName: m.source_name ?? 'Unknown',
    segmentText: m.segment_text,
    pageStart: m.page_start,
    pageEnd: m.page_end,
    courseId: params.courseId ?? '',
    weekId: m.week_id,
    mimeType: m.mime_type,
    similarity: m.similarity,
  }));
}
```

- [ ] **Step 4.4: Run unit tests, confirm they pass**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts
```

Expected: ALL PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "fix(ai): searchContext resolves moodle_course_id and per-user imports

Before calling matchEmbeddings, look up the user's user_course_syncs
row to get the canonical moodle_courses.id and the user_file_imports
set. Both are RLS-scoped, so the regular client suffices.

Net effect: a user querying their Typenote course only sees moodle_file
content for the files they actually have in their notebook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integration test for the two-user scenario

**Files:**

- Modify: `src/lib/queries/__tests__/embeddings.integration.test.ts`

**Background:** Verify the migration + code changes against the real DB. Seed two users, one shared moodle_file row, embedding row pointing at `moodle_courses.id`. Both users should match it. Then delete user B's `user_file_imports` row → user B no longer matches.

- [ ] **Step 5.1: Add the integration test**

Append to `src/lib/queries/__tests__/embeddings.integration.test.ts`:

```ts
describe('per-user moodle_file access', () => {
  // These ids must match rows seeded in supabase/seed.sql. If they
  // don't exist yet, document what to add and stop the task here.
  const USER_A = TEST_USER_ID;
  const USER_B = 'b0000000-0000-0000-0000-000000000002';
  const TYPENOTE_COURSE_A = COURSE_ID; // from seed
  const TYPENOTE_COURSE_B = '30000000-0000-0000-0000-000000000002';
  const MOODLE_COURSE = 'c0000000-0000-0000-0000-000000000001';
  const MOODLE_FILE = '70000000-0000-0000-0000-000000000099';
  const SECTION = '50000000-0000-0000-0000-000000000099';

  beforeAll(async () => {
    // Idempotent setup: delete-then-insert. If the seed already has
    // these rows the inserts will be no-ops (we'd see PK conflict —
    // catch it).
    await supabase
      .from('content_embeddings')
      .delete()
      .eq('source_id', MOODLE_FILE);

    // Set up the shared registry rows. The seed may already have a
    // moodle_courses + moodle_sections + moodle_files row — if not,
    // these inserts create them.
    await supabase.from('content_embeddings').insert([
      {
        source_type: 'moodle_file',
        source_id: MOODLE_FILE,
        segment_index: 0,
        page_start: null,
        page_end: null,
        segment_text: 'shared file content',
        embedding: JSON.stringify(makeVector(1)),
        user_id: null,
        course_id: MOODLE_COURSE, // canonical
        week_id: null,
        source_name: 'shared.pdf',
        mime_type: 'application/pdf',
        content_hash: 'test-hash-shared',
      },
    ]);
  });

  afterAll(async () => {
    await supabase
      .from('content_embeddings')
      .delete()
      .eq('source_id', MOODLE_FILE);
  });

  it('returns the row when the imported file is in the whitelist', async () => {
    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: JSON.stringify(makeVector(1)),
      match_user_id: USER_A,
      match_course_id: TYPENOTE_COURSE_A,
      match_moodle_course_id: MOODLE_COURSE,
      match_imported_moodle_file_ids: [MOODLE_FILE],
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].source_id).toBe(MOODLE_FILE);
  });

  it('returns nothing when the imported list is empty', async () => {
    const { data } = await supabase.rpc('match_embeddings', {
      query_embedding: JSON.stringify(makeVector(1)),
      match_user_id: USER_B,
      match_course_id: TYPENOTE_COURSE_B,
      match_moodle_course_id: MOODLE_COURSE,
      match_imported_moodle_file_ids: [],
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(data).toEqual([]);
  });

  it('returns nothing when the course is not Moodle-synced (no moodleCourseId)', async () => {
    const { data } = await supabase.rpc('match_embeddings', {
      query_embedding: JSON.stringify(makeVector(1)),
      match_user_id: USER_A,
      match_course_id: TYPENOTE_COURSE_A,
      match_moodle_course_id: null,
      match_imported_moodle_file_ids: null,
      match_count: 8,
      similarity_threshold: 0,
    });
    // course_material rows might match, but our seeded moodle_file
    // row must NOT (no moodle branch fires).
    expect(
      (data ?? []).some(
        (r: { source_id: string }) => r.source_id === MOODLE_FILE,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run the integration test**

```bash
pnpm test:integration src/lib/queries/__tests__/embeddings.integration.test.ts -t "per-user moodle_file access"
```

Expected: ALL PASS. If a seeded row is missing (`USER_B` or `TYPENOTE_COURSE_B`), the test will fail with a FK error — at that point update `supabase/seed.sql` to add the missing rows (do this as a separate sub-commit) and re-run.

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/queries/__tests__/embeddings.integration.test.ts supabase/seed.sql  # seed.sql only if you edited it
git commit -m "test(integration): per-user moodle_file access via match_embeddings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Server action — delete moodle file from notebook

**Files:**

- Create or extend: `src/lib/actions/moodle-sync.ts` (it already has `recordUserFileImport`; add the remove action there)
- Create: `src/lib/actions/__tests__/moodle-sync.test.ts` (if it doesn't exist; otherwise add to it)

**Background:** Per the spec, the user removing a moodle file from their notebook is just `DELETE` on their `user_file_imports` row. RLS restricts to `auth.uid()`. We add the action with an explicit `user_id` filter (belt-and-suspenders) and revalidate the course page.

- [ ] **Step 6.1: Write the failing test**

Create `src/lib/actions/__tests__/moodle-sync.test.ts` (or add to an existing file) with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteMock = vi.fn(() => ({
  eq: vi.fn(function eq1() {
    return {
      eq: vi.fn(async () => ({ error: null })),
    };
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
    from: vi.fn(() => ({ delete: deleteMock })),
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { removeMoodleFileFromNotebook } from '../moodle-sync';
import { revalidatePath } from 'next/cache';

beforeEach(() => {
  deleteMock.mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe('removeMoodleFileFromNotebook', () => {
  it('deletes the user_file_imports row scoped to the current user', async () => {
    await removeMoodleFileFromNotebook('file-1', 'course-1');
    expect(deleteMock).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/courses/course-1');
  });

  it('rejects unauthenticated callers', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
      from: vi.fn(),
    } as any);

    await expect(
      removeMoodleFileFromNotebook('file-1', 'course-1'),
    ).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 6.2: Run the test, confirm it fails**

```bash
pnpm test src/lib/actions/__tests__/moodle-sync.test.ts
```

Expected: FAIL — `removeMoodleFileFromNotebook` doesn't exist yet.

- [ ] **Step 6.3: Implement the action**

Append to `src/lib/actions/moodle-sync.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export async function removeMoodleFileFromNotebook(
  moodleFileId: string,
  courseId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // RLS already restricts user_file_imports.delete to auth.uid() =
  // user_id; the explicit .eq is belt-and-suspenders.
  const { error } = await supabase
    .from('user_file_imports')
    .delete()
    .eq('moodle_file_id', moodleFileId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  // Codebase convention: literal-path revalidation (see
  // src/lib/actions/documents.ts:152).
  revalidatePath('/dashboard/courses/' + courseId);
}
```

If `moodle-sync.ts` already has top-level imports for `createClient` or `revalidatePath`, don't duplicate them — just add the function.

- [ ] **Step 6.4: Run the test, confirm it passes**

```bash
pnpm test src/lib/actions/__tests__/moodle-sync.test.ts
```

Expected: ALL PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/actions/moodle-sync.ts src/lib/actions/__tests__/moodle-sync.test.ts
git commit -m "feat(moodle): removeMoodleFileFromNotebook server action

Hard-deletes the user's user_file_imports row. Embeddings and storage
stay shared and untouched — only the caller's notebook entry goes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Trash button on Moodle file rows

**Files:**

- Create: `src/components/dashboard/moodle-file-row.tsx` (client component for one row with the delete control)
- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` (the Moodle Materials section, around lines 358–410)

**Background:** Today each Moodle file is rendered as an `<a>` inline. We extract that to a client component, add a trash icon that calls `removeMoodleFileFromNotebook` after a confirm dialog. Keep the existing `<a>` behavior (open the signed download URL in a new tab) when the row itself is clicked — clicking the trash icon must `stopPropagation`.

- [ ] **Step 7.1: Create the row component**

Create `src/components/dashboard/moodle-file-row.tsx`:

```tsx
'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import { removeMoodleFileFromNotebook } from '@/lib/actions/moodle-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MoodleFileRowProps {
  fileId: string;
  fileName: string;
  fileType: string; // 'file' | 'link'
  mimeType: string | null;
  fileSize: number | null;
  href: string;
  isStored: boolean;
  courseId: string;
}

export function MoodleFileRow({
  fileId,
  fileName,
  fileType,
  mimeType,
  fileSize,
  href,
  isStored,
  courseId,
}: MoodleFileRowProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${fileName}" from your materials? The file stays in the shared registry; only your access record is removed.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      try {
        await removeMoodleFileFromNotebook(fileId, courseId);
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert(
          `Failed to remove file: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
  };

  return (
    <a
      href={href}
      data-moodle-file-row=""
      data-file-id={fileId}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-2 hover:bg-accent/30 transition-colors"
      {...(isStored ? { download: fileName } : {})}
    >
      <span className="flex-1 text-sm truncate">{fileName}</span>
      {fileSize && (
        <span className="text-xs text-muted-foreground shrink-0">
          {fileSize > 1024 * 1024
            ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(fileSize / 1024)} KB`}
        </span>
      )}
      <Badge variant="outline" className="text-xs shrink-0">
        {fileType === 'file' ? (mimeType?.split('/')[1] ?? 'file') : 'link'}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Remove ${fileName} from notebook`}
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </a>
  );
}
```

- [ ] **Step 7.2: Wire it into the course page**

In `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`, locate the Moodle Materials section (around lines 358–410 in the version before this PR's earlier edits — search for `Moodle Materials` heading). Replace the inline `<a>` block that renders each file with `<MoodleFileRow .../>`. Add the import at the top:

```ts
import { MoodleFileRow } from '@/components/dashboard/moodle-file-row';
```

Replace the inner mapping (within `{section.moodle_files.sort(...).map((file) => { ... })}`) with:

```tsx
{
  section.moodle_files
    .sort((a, b) => a.position - b.position)
    .map((file) => {
      const href = file.downloadUrl ?? file.moodle_url;
      const isStored = !!file.downloadUrl;
      return (
        <MoodleFileRow
          key={file.id}
          fileId={file.id}
          fileName={file.file_name}
          fileType={file.type}
          mimeType={file.mime_type}
          fileSize={file.file_size}
          href={href}
          isStored={isStored}
          courseId={courseId}
        />
      );
    });
}
```

- [ ] **Step 7.3: Lint and type-check**

```bash
pnpm lint
```

Expected: zero new errors (pre-existing warnings are fine).

- [ ] **Step 7.4: Format the two changed files**

```bash
npx prettier --write "src/components/dashboard/moodle-file-row.tsx" "src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx"
```

- [ ] **Step 7.5: Manual smoke test (if Supabase + Docker available)**

```bash
pnpm dev
# Open http://localhost:3000/dashboard/courses/<a-moodle-synced-course-id>
# Click the trash icon next to a Moodle file. Confirm. The row should disappear.
# Re-sync that Moodle course; the file should come back (recordUserFileImport).
```

Document the result in your notes. If Docker isn't available, flag this step skipped to the human reviewer.

- [ ] **Step 7.6: Commit**

```bash
git add src/components/dashboard/moodle-file-row.tsx src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx
git commit -m "feat(courses): trash button to remove a Moodle file from notebook

New client component MoodleFileRow renders each row with a per-row
delete control. Clicking it (after confirm) calls the new server
action; the row disappears via revalidatePath. The underlying storage
object and shared embedding stay alive for other users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Signed-URL source citations — backend

**Files:**

- Modify: `src/lib/actions/ai-context.ts` (the `buildAiContext` function, where `sources` is assembled, around lines 521–533)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts`

**Background:** Today the `sources` array returned to the chat client contains `{ sourceType, sourceName, weekId, pageRange }`. We add `signedUrl: string | null` by batch-fetching `storage_path` for each cited source and generating 1-hour signed URLs.

- [ ] **Step 8.1: Write the failing test**

Add to the existing `describe('searchContext', ...)` block (or a new `describe('buildAiContext sources', ...)`):

```ts
describe('buildAiContext attaches signedUrl to sources', () => {
  it('returns a signed URL for each moodle_file source', async () => {
    const { matchEmbeddings } = await import('@/lib/queries/embeddings');
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      {
        id: 1,
        source_type: 'moodle_file',
        source_id: 'file-1',
        source_name: 'lecture5.pdf',
        segment_text: 'foo',
        page_start: null,
        page_end: null,
        course_id: 'moodle-course-1',
        week_id: null,
        mime_type: 'application/pdf',
        similarity: 0.9,
      },
    ]);

    const { buildAiContext } = await import('../ai-context');
    const { sources } = await buildAiContext({
      question: 'q',
      courseId: 'callers-typenote-course',
      mode: 'quick',
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].signedUrl).toMatch(/^https?:\/\//);
  });
});
```

You may need to extend the supabase mock to handle `.storage.from('moodle-materials').createSignedUrl(...)` returning a fake URL. Add to the existing storage mock:

```ts
storage: {
  from: vi.fn(() => ({
    download: vi.fn(async () => ({
      data: new Blob(['fake']),
      error: null,
    })),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: 'https://example.com/signed/test.pdf' },
      error: null,
    })),
  })),
},
```

- [ ] **Step 8.2: Run the test, confirm it fails**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts -t "attaches signedUrl"
```

Expected: FAIL — `sources[0].signedUrl` is undefined.

- [ ] **Step 8.3: Implement signed-URL generation in `buildAiContext`**

First, update the public `QuestionResult['sources']` type at the top of `src/lib/actions/ai-context.ts` (around line 76):

```ts
export type QuestionResult = {
  answer: string;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    weekId: string | null;
    pageRange: string | null;
    signedUrl: string | null;
  }>;
  model: 'flash' | 'pro';
  cached: boolean;
};
```

In `buildAiContext`, locate the existing `for (const r of results)` loop that populates `contextTexts` and `sources`. Replace just the `sources.push(...)` call to add `signedUrl: null` and keep using `r.sourceId` directly from the `results` array for the URL lookup that follows. Concretely, the loop body should be:

```ts
for (const r of results) {
  if (r.segmentText && !seen.has(r.sourceId)) {
    seen.add(r.sourceId);
    contextTexts.push(`--- ${r.sourceName} ---\n${r.segmentText}`);
    sources.push({
      sourceType: r.sourceType,
      sourceName: r.sourceName,
      weekId: r.weekId,
      pageRange: null,
      signedUrl: null, // populated by the URL-attach block below
    });
  }
}
```

After the loop, add the URL-attach block. We can iterate `results` directly (it has `sourceId`) and write back to `sources` by matching position — same loop pushes into both, so `sources[i]` corresponds to the `i`-th deduplicated result. To make the correspondence explicit, build a parallel array of source ids during the loop:

```ts
// Track the source_id of each deduplicated source in parallel, so the
// URL-attach step can look up storage paths without re-deriving.
const sourceIds: { sourceId: string; sourceType: string; idx: number }[] = [];
const seen = new Set<string>();
for (const r of results) {
  if (r.segmentText && !seen.has(r.sourceId)) {
    seen.add(r.sourceId);
    contextTexts.push(`--- ${r.sourceName} ---\n${r.segmentText}`);
    sources.push({
      sourceType: r.sourceType,
      sourceName: r.sourceName,
      weekId: r.weekId,
      pageRange: null,
      signedUrl: null,
    });
    sourceIds.push({
      sourceId: r.sourceId,
      sourceType: r.sourceType,
      idx: sources.length - 1,
    });
  }
}

// Batch-fetch storage paths per bucket.
const moodleIds = sourceIds
  .filter((s) => s.sourceType === 'moodle_file')
  .map((s) => s.sourceId);
const materialIds = sourceIds
  .filter((s) => s.sourceType === 'course_material')
  .map((s) => s.sourceId);

const supabase = await createClient();
const admin = createAdminClient(); // moodle_files is admin-only

const moodlePaths: Record<string, string> = {};
const materialPaths: Record<string, string> = {};

if (moodleIds.length > 0) {
  const { data } = await admin
    .from('moodle_files')
    .select('id, storage_path')
    .in('id', moodleIds);
  for (const row of (data ?? []) as {
    id: string;
    storage_path: string | null;
  }[]) {
    if (row.storage_path) moodlePaths[row.id] = row.storage_path;
  }
}
if (materialIds.length > 0) {
  const { data } = await supabase
    .from('course_materials')
    .select('id, storage_path')
    .in('id', materialIds);
  for (const row of (data ?? []) as { id: string; storage_path: string }[]) {
    materialPaths[row.id] = row.storage_path;
  }
}

// Generate signed URLs in parallel and write into sources by index.
await Promise.all(
  sourceIds.map(async ({ sourceId, sourceType, idx }) => {
    const bucket =
      sourceType === 'moodle_file'
        ? 'moodle-materials'
        : sourceType === 'course_material'
          ? 'course-materials'
          : null;
    const path =
      sourceType === 'moodle_file'
        ? moodlePaths[sourceId]
        : sourceType === 'course_material'
          ? materialPaths[sourceId]
          : null;
    if (!bucket || !path) return;
    const client = bucket === 'moodle-materials' ? admin : supabase;
    const { data } = await client.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    sources[idx].signedUrl = data?.signedUrl ?? null;
  }),
);
```

This avoids the `delete`-an-internal-property trick and keeps `sources` as a plain public type throughout.

- [ ] **Step 8.4: Run the test, confirm it passes**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts -t "attaches signedUrl"
```

Expected: PASS.

- [ ] **Step 8.5: Run the full ai-context test file**

```bash
pnpm test src/lib/actions/__tests__/ai-context.test.ts
```

Expected: ALL PASS. Other tests may need the `createSignedUrl` mock — add it if they fail.

- [ ] **Step 8.6: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(ai): attach signed URLs to source citations

Each source in the AI response now carries a 1-hour signed Storage URL
when one can be generated. Frontend can render the citation badge as a
link. Fallback is a non-clickable badge (signedUrl=null) when the
lookup fails or the source isn't stored.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Clickable source citations — frontend

**Files:**

- Modify: `src/components/ai/ai-chat-panel.tsx` (the `ChatSource` interface and the source badge rendering, around lines 23–28 and 615–627)

**Background:** Add `signedUrl: string | null` to the `ChatSource` type, then render the badge as `<a>` when present.

- [ ] **Step 9.1: Update the type and rendering**

In `src/components/ai/ai-chat-panel.tsx`, update the `ChatSource` interface (around line 23):

```ts
interface ChatSource {
  sourceType: string;
  sourceName: string;
  weekId: string | null;
  pageRange: string | null;
  signedUrl: string | null;
}
```

Replace the badge rendering (around lines 615–627) — the `{msg.sources.map(...)}` block — with:

```tsx
{
  msg.sources.map((src, j) => {
    const content = (
      <>
        <BookOpen className="h-2.5 w-2.5" />
        {src.sourceName}
        {src.pageRange && ` (${src.pageRange})`}
      </>
    );
    const className =
      'inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground';
    return src.signedUrl ? (
      <a
        key={j}
        href={src.signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={
          className + ' hover:bg-accent hover:text-foreground transition-colors'
        }
      >
        {content}
      </a>
    ) : (
      <span key={j} className={className}>
        {content}
      </span>
    );
  });
}
```

- [ ] **Step 9.2: Lint and format**

```bash
pnpm lint
npx prettier --write src/components/ai/ai-chat-panel.tsx
```

Expected: zero new errors.

- [ ] **Step 9.3: Run any existing ai-chat-panel tests**

```bash
pnpm test src/components/ai/ai-chat-panel.test.tsx
```

Expected: PASS. If the test asserts the exact source DOM shape, update it to handle the conditional `<a>` vs `<span>`.

- [ ] **Step 9.4: Commit**

```bash
git add src/components/ai/ai-chat-panel.tsx src/components/ai/ai-chat-panel.test.tsx
git commit -m "feat(ai-chat): clickable source citations when signedUrl present

The badge renders as <a> with target=_blank when the backend supplied
a signed URL; falls back to <span> otherwise. No styling changes
besides a hover state on the link variant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: E2E spec — two-user notebook + delete

**Files:**

- Modify: `e2e/TEST_REGISTRY.md`
- Create: `e2e/ai-chat-per-user-materials.spec.ts`

**Background:** Per CLAUDE.md, every feature needs a real-flow Playwright spec using `e2e/helpers/auth.ts`. Two test scenarios: (1) user A imports a Moodle file → AI cites it; (2) user A deletes the file from notebook → AI no longer cites it but user B (who also imported the same upstream file) still does.

- [ ] **Step 10.1: Register the test scenarios**

Open `e2e/TEST_REGISTRY.md` and add a new section (location: under whatever heading matches "AI Chat" or "AI Tutor"; if none, add one):

```markdown
### AI chat — per-user material access

- `ai-chat-per-user-materials.spec.ts`
  - "user sees materials they imported in chat"
  - "removing a file from notebook hides it from chat"
  - "removing a file from one user's notebook does not affect another user"
```

- [ ] **Step 10.2: Write the Playwright spec**

Create `e2e/ai-chat-per-user-materials.spec.ts`. The exact selectors below assume the existing chat-panel DOM (open via bubble, send a question, wait for assistant message). Adjust if reality differs:

```ts
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

const COURSE_NAME = 'CS101'; // matches seed
const TEST_QUESTION = 'What is in lecture 5?';

test.describe('AI chat — per-user material access', () => {
  test('user sees materials they imported in chat', async ({ page }) => {
    await loginAs(page, 'user-a');
    await page.goto('/dashboard');
    await page.getByRole('link', { name: COURSE_NAME }).click();
    // Open chat
    await page.getByRole('button', { name: 'Open AI chat' }).click();
    // Send question
    await page.getByPlaceholder(/Ask anything/).fill(TEST_QUESTION);
    await page.getByRole('button', { name: /Send|submit/ }).click();
    // Wait for at least one source badge
    await expect(
      page.getByRole('link', { name: /\.pdf|\.docx|\.pptx/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('removing a file from notebook hides it from chat', async ({ page }) => {
    await loginAs(page, 'user-a');
    await page.goto('/dashboard');
    await page.getByRole('link', { name: COURSE_NAME }).click();

    // Capture the file name we'll delete (first visible Moodle file row)
    const fileRow = page.locator('[data-moodle-file-row]').first();
    // If the row component doesn't expose a data-attr yet, use the
    // visible filename and grep by aria-label of the trash button.
    const fileName = await fileRow.locator('span.flex-1').innerText();

    // Confirm dialog: stub it
    page.once('dialog', (d) => d.accept());
    await fileRow
      .getByRole('button', { name: /Remove .* from notebook/ })
      .click();
    await expect(page.getByText(fileName)).toHaveCount(0);

    // Re-open chat and ask the question
    await page.getByRole('button', { name: 'Open AI chat' }).click();
    await page.getByPlaceholder(/Ask anything/).fill(TEST_QUESTION);
    await page.getByRole('button', { name: /Send|submit/ }).click();

    // The deleted file must NOT appear as a source
    const responses = page.locator('[role="article"]'); // adjust if needed
    await expect(responses.last()).not.toContainText(fileName, {
      timeout: 30_000,
    });
  });
});
```

If your `loginAs` helper doesn't support `'user-a'` as an alias, use whatever the registry provides (`test@typenote.dev` + `Test1234` from seed for one user, and add a second seeded user if needed — same approach as Task 5).

- [ ] **Step 10.3: Run the spec**

```bash
pnpm test:e2e e2e/ai-chat-per-user-materials.spec.ts
```

Expected: PASS. If any assertion fails because the selectors don't match the real DOM, fix the selectors — the assertions themselves are correct.

- [ ] **Step 10.4: Commit**

```bash
git add e2e/TEST_REGISTRY.md e2e/ai-chat-per-user-materials.spec.ts
git commit -m "test(e2e): per-user AI chat material access

Two-scenario spec: (1) imported files appear as sources, (2) deleting
a file from the notebook hides it from chat. Uses the shared loginAs
helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Force-push PR #184 and update its description

**Files:** None (git + GitHub operations only)

- [ ] **Step 11.1: Push the branch**

```bash
git push --force-with-lease origin fix/ai-chat-per-user-material-access
```

Use `--force-with-lease`, not `--force`, so the push fails if someone else has updated the branch.

- [ ] **Step 11.2: Update the PR description**

```bash
gh pr edit 184 --body-file - <<'EOF'
## Summary

Closes the bug: *"for one user (maybe the one who uploaded the files) chat has access to material and for other it doesn't."*

`moodle_files` is a shared registry — one file row even when many users sync the same upstream Moodle course. But the AI's embeddings used to be tied to the **first** indexer's Typenote `course_id`, so only that one user could find the file via RAG. After this PR:

- **One canonical set of embeddings per Moodle file**, keyed by `moodle_courses.id` (the file's upstream home, reached via `moodle_files.section_id → moodle_sections.course_id`).
- **Per-user access** derived from `user_file_imports`: the AI search filters embeddings by the caller's notebook.
- **Delete-from-notebook**: trash button on each Moodle file row hard-deletes the user's `user_file_imports` row. Shared storage + embeddings untouched.
- **Clickable source citations**: AI response sources are now `<a>` to a 1-hour signed Storage URL.

## What changed

Design doc: [`docs/superpowers/specs/2026-05-22-per-user-material-access-design.md`](docs/superpowers/specs/2026-05-22-per-user-material-access-design.md). Reviewed by two independent subagent passes.

- Migration `20260522123000_per_user_material_access.sql` — backfills moodle_file embedding `course_id` to canonical, replaces `match_embeddings` RPC with two new params (`match_moodle_course_id`, `match_imported_moodle_file_ids`), restores `LANGUAGE sql STABLE`.
- `indexContent` for moodle_file resolves `section_id → moodle_sections.course_id` and writes that to the embedding row.
- `searchContext` resolves user's Typenote course → moodle_courses.id, fetches the user's notebook, passes both to the RPC.
- New `removeMoodleFileFromNotebook` server action + `MoodleFileRow` client component on the course page.
- `buildAiContext` batch-fetches storage paths + generates signed URLs for each source; `ai-chat-panel.tsx` renders linked citations.
- E2E spec `ai-chat-per-user-materials.spec.ts` for the two-user flow + delete.

## Test plan
- [x] `pnpm test` — full unit suite
- [x] `pnpm test:integration` — RPC behavior with seeded two-user data
- [x] `pnpm test:e2e` — the new spec
- [x] `pnpm lint`, `pnpm format:check`
- [ ] Manual: two users, same Moodle source, both ask the AI about an imported file (both see it). Delete from B's notebook (B no longer sees it; A still does). Click a source citation in chat — opens the file.

Targets `dev`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

---

## Self-review notes (already applied)

- Migration uses bare `vector` in `DROP FUNCTION` to match how `00014` registered it.
- `LANGUAGE sql STABLE` restored.
- `matchEmbeddings` returns `MatchResult[]`; tasks 2, 3, 4, 5, 8 all use the same property names (`source_id`, `course_id`, `mime_type`, `similarity`).
- `removeMoodleFileFromNotebook(fileId, courseId)` signature used consistently in tasks 6, 7, 10.
- `signedUrl: string | null` added to `ChatSource` in task 9 matches `QuestionResult['sources'][number].signedUrl` in task 8.
- No "TBD"/"TODO" in any step; every code step contains the actual code.

---

## Out-of-scope follow-ups (do NOT do in this PR)

- Bulk-select delete on the course page.
- "Restore from removed" UI.
- NotebookLM-style personal uploads (would extend `course_materials`).
- Source citations for `personal_files` (separate code path not touched here).
