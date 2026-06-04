# Homework-Focused AI Context — Phase 1: Flat Model + Unified Embedded Materials + Perf

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `course_weeks` concept (flatten everything to the course), make every imported material (Moodle + manual) embedded and per-user scoped, retire the duplicate material path, and make the course page fast.

**Architecture:** A single forward-only Supabase migration re-parents materials to `course_id` and drops the week tables/dead cache. The embedding pipeline gains a `personal_file` source type so manual imports are searchable, guarded by a DB `CHECK` so per-user scoping can't leak. The whole `week` surface (29 files) is removed; the course page is parallelized and Moodle materials load lazily on expand.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Supabase (Postgres + RLS + pgvector), TypeScript, Vitest (unit + integration), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-05-25-homework-focused-ai-context-design.md`

**Phase 2 (Homework AI context wiring) gets its own plan after Phase 1 merges** — its code depends on the post-flatten signatures produced here.

**Conventions:** branch `feat/homework-focused-ai-context` (off `origin/dev`). Unit: `pnpm test`. Integration: `pnpm test:integration`. E2E: `pnpm test:e2e`. Apply migrations+seed locally: `pnpm supabase db reset`. **Integration tests in this repo import the client + seeded users from `@/test/supabase-client`** (`createAdminClient`, `TEST_USER_A`, `TEST_USER_B`, `TEST_USER_ID`) — never from `@/lib/supabase/admin` (that throws without env vars). `content_embeddings.user_id` still FKs `profiles`, so test rows must use those seeded ids. Commit after each task.

---

## Complete week-surface file map (all 29 — every one is handled)

**Created**

- `supabase/migrations/20260525120000_flatten_remove_course_weeks.sql` (T1)
- `src/lib/actions/moodle-materials.ts` (T15) + `src/components/dashboard/moodle-materials-section.tsx` (T15)
- `src/lib/actions/__tests__/flatten-schema.integration.test.ts` (T3)
- `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts` (T8)

**Modified**

- `src/types/database.ts` (T4) · `src/lib/queries/embeddings.ts` (T5) · `src/lib/actions/ai-context.ts` (T6) · `src/lib/actions/personal-files.ts` (T7) · `src/lib/actions/documents.ts` (T9) · `src/lib/actions/course-materials.ts` (T10) · `src/lib/actions/courses.ts` (T10) · `src/lib/ai/prompts.ts` (T11) · `src/app/api/ai/ask/route.ts` (T12) · `src/app/api/ai/search/route.ts` (T12) · `src/components/ai/ai-chat-panel.tsx` (T13) · `src/components/ai/ai-chat-wrapper.tsx` (T13) · `src/components/ai/document-with-ai.tsx` (T13) · `src/components/editor/tiptap-editor-with-versions.tsx` (T13) · `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` (T13) · `src/components/dashboard/move-document-dialog.tsx` (T14) · `src/components/dashboard/personal-file-upload.tsx` (T14) · `src/lib/queries/course-materials.ts` (T14) · `src/lib/queries/personal-files.ts` (T14) · `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` (T16) · `src/components/dashboard/start-homework-dialog.tsx` (T16) · `src/components/dashboard/material-item.tsx` (T16) · `src/lib/analytics/events.ts` (T17) · `supabase/seed.sql` (T2)

**Deleted**

- `src/lib/actions/course-weeks.ts`, `src/lib/queries/course-weeks.ts` (T14)
- `src/lib/ai/context-cache.ts` (+ its test) (T14)
- `src/components/dashboard/week-section.tsx` (+ test), `week-dialog.tsx`, `material-upload.tsx` (+ test), `moodle-import-picker.tsx` (T14)
- `src/lib/actions/course-weeks-materials.integration.test.ts` (T18)

---

## Task 1: Flatten migration SQL

**Files:** Create `supabase/migrations/20260525120000_flatten_remove_course_weeks.sql`

- [ ] **Step 1: Write the migration** (constraint/index/function names verified against 00003/00006/00012/20260323143358/00013/20260522123000)

```sql
-- Flatten the course model. Forward-only. Dependent FKs on course_weeks must
-- be dropped before `drop table course_weeks`.

-- 1. course_materials: add course_id, backfill from week, enforce not-null.
alter table public.course_materials
  add column course_id uuid references public.courses(id) on delete cascade;

update public.course_materials cm
set course_id = cw.course_id
from public.course_weeks cw
where cm.week_id = cw.id;

do $$
begin
  if exists (select 1 from public.course_materials where course_id is null) then
    raise exception 'flatten aborted: course_materials with null course_id remain';
  end if;
end $$;

alter table public.course_materials alter column course_id set not null;
drop index if exists public.course_materials_week_idx;
create index course_materials_course_idx on public.course_materials(course_id, category);
alter table public.course_materials drop column week_id;

-- 2. documents: drop the week column + guard constraint + index.
alter table public.documents drop constraint if exists chk_week_requires_course;
drop index if exists public.idx_documents_week_id;
alter table public.documents drop column if exists week_id;

-- 3. personal_files: drop the week column + index.
drop index if exists public.personal_files_week_idx;
alter table public.personal_files drop column if exists week_id;

-- 4. content_embeddings: drop week column; allow 'personal_file'; forbid null
--    user_id on owned source types (per-user scoping leak guard).
alter table public.content_embeddings drop column if exists week_id;
alter table public.content_embeddings
  drop constraint if exists content_embeddings_source_type_check;
alter table public.content_embeddings
  add constraint content_embeddings_source_type_check
  check (source_type in ('moodle_file', 'course_material', 'personal_file'));
alter table public.content_embeddings
  add constraint content_embeddings_owned_user_not_null
  check (source_type = 'moodle_file' or user_id is not null);

-- 5. Drop dead week-keyed cache + RPC.
drop table if exists public.context_cache_registry;
drop function if exists public.get_week_file_refs(uuid, uuid);

-- 6. Drop course_weeks.
drop table if exists public.course_weeks;

-- 7. Recreate match_embeddings WITHOUT match_week_id; add per-user personal_file
--    branch keyed on Typenote course_id. (Drop sig matches 20260522123000 exactly.)
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
  id bigint, source_type text, source_id uuid, source_name text,
  segment_text text, page_start integer, page_end integer, course_id uuid,
  mime_type text, similarity float
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
      (ce.source_type = 'course_material' and match_course_id is not null
        and ce.course_id = match_course_id and ce.user_id = match_user_id)
      or
      (ce.source_type = 'personal_file' and match_course_id is not null
        and ce.course_id = match_course_id and ce.user_id = match_user_id)
      or
      (ce.source_type = 'moodle_file' and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Commit** (don't `db reset` yet — seed still has week inserts; Task 2 fixes seed, then we reset)

```bash
git add supabase/migrations/20260525120000_flatten_remove_course_weeks.sql
git commit -m "feat(db): flatten course model — drop course_weeks, re-parent materials, add personal_file embeddings"
```

---

## Task 2: Rewrite seed to the flat model (do this before any `db reset`)

**Files:** Modify `supabase/seed.sql`

- [ ] **Step 1:** Delete the `course_weeks` insert block (≈ lines 256-270). Change every `course_materials` insert to use `course_id` (the seeded test course id) instead of `week_id` (≈ lines 276-286). Remove `week_id` from every `documents` insert. Scrub `"weekId":"…"` keys from any `sources_json` JSON literals (≈ lines 444, 489) — leave the rest of those objects.

- [ ] **Step 2: Apply + verify clean**

Run: `pnpm supabase db reset`
Expected: all migrations apply, then seed loads with **no error**.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): reseed flat course model (no weeks)"
```

---

## Task 3: Schema integration test

**Files:** Create `src/lib/actions/__tests__/flatten-schema.integration.test.ts`

- [ ] **Step 1: Write the test** (client + seeded user from `@/test/supabase-client`)

```ts
import { describe, it, expect } from 'vitest';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

const admin = createAdminClient();
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('flatten migration schema', () => {
  it('course_weeks no longer exists', async () => {
    const { error } = await admin.from('course_weeks').select('id').limit(1);
    expect(error?.message ?? '').toMatch(
      /does not exist|could not find|schema cache/i,
    );
  });

  it('course_materials has course_id, not week_id', async () => {
    const ok = await admin
      .from('course_materials')
      .select('id, course_id')
      .limit(1);
    expect(ok.error).toBeNull();
    const bad = await admin.from('course_materials').select('week_id').limit(1);
    expect(bad.error?.message ?? '').toMatch(/week_id/i);
  });

  it('rejects a course_material embedding with null user_id', async () => {
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'course_material',
      source_id: '00000000-0000-0000-0000-000000000001',
      segment_index: 0,
      embedding: vec(0),
      user_id: null,
      course_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/owned_user_not_null|violates check/i);
  });

  it('match_embeddings no longer accepts match_week_id', async () => {
    const { error } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0),
      match_user_id: TEST_USER_ID,
      match_week_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(error?.message ?? '').toMatch(/match_week_id|does not exist/i);
  });
});
```

- [ ] **Step 2: Run** — `pnpm test:integration -- flatten-schema` → PASS.
- [ ] **Step 3: Commit** — `git add … && git commit -m "test(db): assert flattened schema + per-user embedding check"`

---

## Task 4: TypeScript types — drop weeks

**Files:** Modify `src/types/database.ts`

- [ ] **Step 1:** Delete the `CourseWeek` interface (lines 46-54).
- [ ] **Step 2:** Edit `CourseMaterial`: remove `week_id`, add `course_id: string;` (after `id`).
- [ ] **Step 3:** Remove `week_id` from `Document` (line 75) and `PersonalFile` (line 94); remove `weekId` from `ChatSource` (line 192).
- [ ] **Step 4: Typecheck** — `pnpm exec tsc --noEmit`. Expected: errors only in files fixed by later tasks (these are the to-do list).
- [ ] **Step 5: Commit** — `git commit -m "refactor(types): drop CourseWeek and week_id fields"`

---

## Task 5: Embeddings query layer

**Files:** Modify `src/lib/queries/embeddings.ts`

- [ ] **Step 1:** Remove `week_id` from `EmbeddingRow` (line 14) and `MatchResult` (line 86).
- [ ] **Step 2:** In `matchEmbeddings`, remove the `weekId?` param and the `match_week_id` rpc arg.
- [ ] **Step 3:** Delete `getWeekFileRefs` + the `FileRef` interface (lines 117-137).
- [ ] **Step 4: Commit** — `git commit -m "refactor(embeddings): drop week_id from query layer; remove getWeekFileRefs"`

---

## Task 6: `ai-context.ts` — personal_file source, drop week

**Files:** Modify `src/lib/actions/ai-context.ts`

- [ ] **Step 1:** Replace the `IndexSource` union (lines 25-32):

```ts
export type IndexSource =
  | { type: 'moodle_file'; fileId: string; courseId: string }
  | { type: 'course_material'; materialId: string; courseId: string }
  | { type: 'personal_file'; fileId: string; courseId: string };
```

- [ ] **Step 2:** Remove week fields: `SearchParams.weekId` (44), `SearchResult.weekId` (57), `QuestionParams.weekId` (65) + `.weekLabel` (69), `QuestionResult.sources[].weekId` (80).

- [ ] **Step 3:** In `indexContent`: delete the `let weekId: string | null = null;` declaration (line 121) and the `weekId = source.weekId ?? null;` line in the moodle branch (line 130). Replace the `else {` course_material branch with the two-branch version (course_material + personal_file):

```ts
    } else if (source.type === 'course_material') {
      const supabase = await createClient();
      userId = await getAuthUserId();
      sourceType = 'course_material';
      sourceId = source.materialId;
      courseId = source.courseId;
      const { data: matRow, error: matErr } = await supabase
        .from('course_materials').select('storage_path, file_name, mime_type')
        .eq('id', source.materialId).single();
      if (matErr || !matRow) return { success: false, segmentsIndexed: 0, skipped: false, error: 'Course material not found' };
      sourceName = matRow.file_name;
      mimeType = matRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'course-materials';
      const { data: fileData, error: dlErr } = await supabase.storage.from(storageBucket).download(matRow.storage_path);
      if (dlErr || !fileData) return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download course material' };
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    } else {
      const supabase = await createClient();
      userId = await getAuthUserId();
      sourceType = 'personal_file';
      sourceId = source.fileId;
      courseId = source.courseId;
      const { data: fileRow, error: fileErr } = await supabase
        .from('personal_files').select('storage_path, file_name, mime_type')
        .eq('id', source.fileId).single();
      if (fileErr || !fileRow) return { success: false, segmentsIndexed: 0, skipped: false, error: 'Personal file not found' };
      sourceName = fileRow.file_name;
      mimeType = fileRow.mime_type ?? 'application/octet-stream';
      storageBucket = 'personal-files';
      const { data: fileData, error: dlErr } = await supabase.storage.from(storageBucket).download(fileRow.storage_path);
      if (dlErr || !fileData) return { success: false, segmentsIndexed: 0, skipped: false, error: 'Failed to download personal file' };
      fileBuffer = Buffer.from(await fileData.arrayBuffer());
    }
```

- [ ] **Step 4:** Remove `week_id: weekId,` from the `rows.push({...})` EmbeddingRow (line 279).
- [ ] **Step 5:** In `searchContext`: remove `weekId: params.weekId ?? null` (358) from the `matchEmbeddings` call and `weekId: m.week_id` (371) from the mapping.
- [ ] **Step 6:** In BOTH `askQuestion` and `buildAiContext`: remove `weekLabel` from the destructure and from `buildSystemPrompt({...})`; remove `weekId: r.weekId` from every `sources.push({...})`.
- [ ] **Step 7:** In `buildAiContext`, add personal_file signed URLs. After the `materialIds` block (line 613) add:

```ts
const personalIds = sourceIds
  .filter((s) => s.sourceType === 'personal_file')
  .map((s) => s.sourceId);
const personalPaths: Record<string, string> = {};
if (personalIds.length > 0) {
  const { data } = await supabase
    .from('personal_files')
    .select('id, storage_path')
    .in('id', personalIds);
  for (const row of (data ?? []) as { id: string; storage_path: string }[])
    personalPaths[row.id] = row.storage_path;
}
```

Then extend the bucket/path resolver in the `Promise.all` (lines 643-656):

```ts
const bucket =
  sourceType === 'moodle_file'
    ? 'moodle-materials'
    : sourceType === 'course_material'
      ? 'course-materials'
      : sourceType === 'personal_file'
        ? 'personal-files'
        : null;
const path =
  sourceType === 'moodle_file'
    ? moodlePaths[sourceId]
    : sourceType === 'course_material'
      ? materialPaths[sourceId]
      : sourceType === 'personal_file'
        ? personalPaths[sourceId]
        : null;
if (!bucket || !path) return;
const client = bucket === 'moodle-materials' ? admin : supabase; // personal-files RLS is owner-path based
```

- [ ] **Step 8: Typecheck** (`ai-context.ts` clean) + **Commit** — `git commit -m "feat(ai): index personal_file sources; drop week from context pipeline"`

---

## Task 7: Embed personal files on import

**Files:** Modify `src/lib/actions/personal-files.ts`

- [ ] **Step 1:** Remove `weekId?` from `createPersonalFile`'s param (line 9) and `week_id: data.weekId ?? null,` from the insert (line 30).
- [ ] **Step 2:** Before `revalidatePath` at the end of `createPersonalFile`, add fire-and-forget embedding:

```ts
if (error) throw new Error(error.message);

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

(`file.id` is in scope — the insert `.select('id').single()`. Dynamic `import()` of another `'use server'` module is fine.)

- [ ] **Step 3:** In `openPersonalFileAsDocument`, remove `week_id: file.week_id ?? null,` from BOTH `documents` inserts (lines 135 and 192).
- [ ] **Step 4: Typecheck + Commit** — `git commit -m "feat(files): embed personal files on import; drop week_id"`

---

## Task 8: Per-user embedding scoping integration test

**Files:** Create `src/lib/actions/__tests__/personal-file-embedding.integration.test.ts`

- [ ] **Step 1: Write the test** using seeded users (their profiles exist, satisfying the `user_id` FK). Insert a personal_file embedding owned by `TEST_USER_A`, assert A sees it and B does not.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = '00000000-0000-0000-0000-0000000000aa';
const SRC = '00000000-0000-0000-0000-0000000000c1';
const vec = (n: number) => JSON.stringify(Array(1536).fill(n));

describe('personal_file per-user embedding scoping', () => {
  beforeAll(async () => {
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
    const { error } = await admin.from('content_embeddings').insert({
      source_type: 'personal_file',
      source_id: SRC,
      segment_index: 0,
      segment_text: 'secret note',
      embedding: vec(0.01),
      user_id: TEST_USER_A.id,
      course_id: COURSE,
      source_name: 'a.pdf',
    });
    expect(error).toBeNull();
  });
  afterAll(async () => {
    await admin.from('content_embeddings').delete().eq('source_id', SRC);
  });

  it('owner (A) retrieves the personal_file', async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01),
      match_user_id: TEST_USER_A.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(true);
  });

  it("other user (B) cannot retrieve A's personal_file", async () => {
    const { data } = await admin.rpc('match_embeddings', {
      query_embedding: vec(0.01),
      match_user_id: TEST_USER_B.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0,
    });
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(false);
  });
});
```

> `match_embeddings` is `STABLE` (not SECURITY DEFINER); via the admin client RLS is bypassed, so this exercises the RPC's own `user_id` filter — the leak guard.

- [ ] **Step 2: Run** — `pnpm test:integration -- personal-file-embedding` → PASS.
- [ ] **Step 3: Commit** — `git commit -m "test(ai): personal_file embeddings are per-user scoped"`

---

## Task 9: `documents.ts` — drop week everywhere

**Files:** Modify `src/lib/actions/documents.ts`

- [ ] **Step 1:** `createDocument` — remove `week_id?: string | null` from its param type (line 14). (The insert spreads `...data`, so dropping the field is enough.)
- [ ] **Step 2:** `MoveDestination` — remove the `weekId?` variant field (line 85); in `moveDocument`, remove every `week_id` written for the `course` destination (lines ~102, 110, 134) so a course move sets only `course_id` (and `week_id` no longer exists).
- [ ] **Step 3:** Rewrite `openMaterialAsDocument` to read the course directly from `course_materials.course_id` (no week lookup):

```ts
// select course_id instead of week_id
const { data: material, error: matError } = await supabase
  .from('course_materials')
  .select('id, course_id, file_name, user_id')
  .eq('id', materialId)
  .single();
// ...ownership + existing checks unchanged...

// (DELETE the `Resolve course_id from the week` block entirely)

const { data: doc, error } = await supabase
  .from('documents')
  .insert({
    user_id: user.id,
    title,
    content: {},
    pages: { pages },
    subject: 'other',
    canvas_type: 'blank',
    folder_id: null,
    course_id: material.course_id, // was week?.course_id
    material_id: materialId,
    position: 0,
    // week_id removed
  })
  .select('id')
  .single();
```

- [ ] **Step 4:** Delete `createWeekDocument` entirely (lines 291-332) — its only caller was `week-section.tsx` (deleted in T14).
- [ ] **Step 5: Typecheck + Commit** — `git commit -m "refactor(documents): drop week from create/move/openMaterial; remove createWeekDocument"`

---

## Task 10: `course-materials.ts` + `courses.ts`

**Files:** Modify `src/lib/actions/course-materials.ts`, `src/lib/actions/courses.ts`

- [ ] **Step 1:** `createCourseMaterial` — change param `week_id: string` → `course_id: string` and insert `week_id: data.week_id` → `course_id: data.course_id`.
- [ ] **Step 2:** Delete `importMoodleFile` entirely (lines 71-128). Verify no other caller: `grep -rn "importMoodleFile" src` → only `moodle-import-picker.tsx` (deleted in T14).
- [ ] **Step 3:** `courses.ts` `deleteCourse` (lines ~69-83): delete the `from('course_weeks')` fetch + the `.in('week_id', …)` material cleanup. The DB `ON DELETE CASCADE` from `courses → course_materials/documents/personal_files` already handles cleanup; keep any embeddings/storage cleanup that doesn't reference weeks.
- [ ] **Step 4: Typecheck + Commit** — `git commit -m "refactor(materials/courses): course_id not week_id; remove importMoodleFile + week cleanup"`

---

## Task 11: Prompts

**Files:** Modify `src/lib/ai/prompts.ts`

- [ ] **Step 1:** Replace `SystemPromptContext` + `buildSystemPrompt` (drop `weekLabel`; citation format `- Material Name: …`):

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

1. **ALWAYS match the language of the question.** Respond in the student's language regardless of the materials' language.
2. **Use LaTeX for math** wrapped in dollar signs (e.g., $E = mc^2$, $$\\int_0^\\infty f(x)\\,dx$$).
3. **Be pedagogical.** Explain step by step; guide toward understanding rather than just giving answers.
4. **Structure your answers** with markdown.
5. **Source citations format.** When you referenced course materials, list them at the end:
[Sources]
- Material Name: brief description of what was referenced
${documentContext}`;
}
```

- [ ] **Step 2:** Delete the deprecated `export const SYSTEM_PROMPT = …` line (50). `grep -rn "SYSTEM_PROMPT\b" src` → if any importer remains, replace with `buildSystemPrompt({ hasDocumentContent: false })`.
- [ ] **Step 3: Commit** — `git commit -m "refactor(ai): drop weekLabel; fix citations; remove dead SYSTEM_PROMPT"`

---

## Task 12: AI routes — drop week from request handling

**Files:** Modify `src/app/api/ai/ask/route.ts`, `src/app/api/ai/search/route.ts`

- [ ] **Step 1:** `ask/route.ts` — remove `weekId` and `weekLabel` from the request-body destructure (≈ lines 11-24) and from the `params: QuestionParams` object (lines 300, 304). Leave `documentId` (used by Phase 2).
- [ ] **Step 2:** `search/route.ts` — remove the `weekId` query-param parsing and the `weekId` field passed to `searchContext` (line 37).
- [ ] **Step 3: Typecheck + Commit** — `git commit -m "refactor(api/ai): drop weekId/weekLabel from ask + search routes"`

---

## Task 13: AI chat chain, document page, editor — remove week props/UI

**Files:** `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`, `src/components/ai/document-with-ai.tsx`, `src/components/ai/ai-chat-wrapper.tsx`, `src/components/ai/ai-chat-panel.tsx`, `src/components/editor/tiptap-editor-with-versions.tsx`

- [ ] **Step 1:** Doc page — remove the `CourseWeek` import, the `from('course_weeks')` fetch (lines 42-47), the `weekLabel` computation (line 53), and stop passing `weekId`/`weekLabel` into `TiptapEditorWithVersions` and `DocumentWithAi` (lines 75-76, 82-83).
- [ ] **Step 2:** Remove the `weekId?`/`weekLabel?` props (declaration + threading) from `document-with-ai.tsx`, `ai-chat-wrapper.tsx`, and `tiptap-editor-with-versions.tsx`.
- [ ] **Step 3:** `ai-chat-panel.tsx` — remove `weekId`/`weekLabel` from props; remove `weekId` from the local `interface ChatSource` (lines 23-26); remove `weekId` from the `/api/ai/ask` POST body (line 317); remove the week source/label UI (lines 479-481, 585-587).
- [ ] **Step 4: Typecheck** (`pnpm exec tsc --noEmit`) — should be clean across the chat chain now.
- [ ] **Step 5: Commit** — `git commit -m "refactor(ai-chat): remove week props, posting, and source UI"`

---

## Task 14: Delete week-only files; fix queries + remaining components

**Files:** delete listed below; modify `move-document-dialog.tsx`, `personal-file-upload.tsx`, `src/lib/queries/course-materials.ts`, `src/lib/queries/personal-files.ts`

- [ ] **Step 1: Delete**

```bash
git rm src/lib/actions/course-weeks.ts src/lib/queries/course-weeks.ts \
       src/lib/ai/context-cache.ts src/lib/ai/context-cache.test.ts \
       src/components/dashboard/week-section.tsx src/components/dashboard/week-section.test.tsx \
       src/components/dashboard/week-dialog.tsx \
       src/components/dashboard/material-upload.tsx src/components/dashboard/material-upload.test.tsx \
       src/components/dashboard/moodle-import-picker.tsx
```

- [ ] **Step 2:** `src/lib/queries/course-materials.ts` — delete `getMaterialsByWeek` + `getMaterialsByWeekAndCategory` (no callers after deletions).
- [ ] **Step 3:** `src/lib/queries/personal-files.ts` — delete `getPersonalFilesByWeeks` + `getPersonalFilesByWeek`; rewrite `getPersonalFilesByCourse` to drop the `.is('week_id', null)` filter (return all course files):

```ts
export async function getPersonalFilesByCourse(courseId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('personal_files')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });
  return data ?? [];
}
```

- [ ] **Step 4:** `move-document-dialog.tsx` — remove the week fetch + week grouping and the `weekId` move destination (destinations become folder/course/root only).
- [ ] **Step 5:** `personal-file-upload.tsx` — remove the `weekId` prop and stop passing it to `createPersonalFile`.
- [ ] **Step 6: Typecheck + Commit** — `git commit -m "refactor: delete week components/actions; flatten queries + dialogs"`

---

## Task 15: Lazy Moodle — server action + client section

**Files:** Create `src/lib/actions/moodle-materials.ts`, `src/components/dashboard/moodle-materials-section.tsx`

- [ ] **Step 1: Server action** (extracted from the old inline page block; signed URLs in parallel):

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    .select(
      'id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)',
    )
    .eq('course_id', sync.moodle_course_id)
    .order('position');
  type FileRow = {
    id: string;
    file_name: string;
    type: string;
    moodle_url: string;
    storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    position: number;
  };
  type Sec = {
    id: string;
    title: string;
    position: number;
    moodle_files: FileRow[];
  };
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
    importedIds = new Set(
      (imports ?? []).map((i: { moodle_file_id: string }) => i.moodle_file_id),
    );
  }
  const visible = ((sections ?? []) as Sec[])
    .map((s) => ({
      ...s,
      moodle_files: s.moodle_files.filter(
        (f) => f.storage_path && importedIds.has(f.id),
      ),
    }))
    .filter((s) => s.moodle_files.length > 0);
  const signed = new Map<string, string>();
  await Promise.all(
    visible
      .flatMap((s) => s.moodle_files)
      .map(async (f) => {
        if (!f.storage_path) return;
        const { data } = await admin.storage
          .from('moodle-materials')
          .createSignedUrl(f.storage_path, 3600);
        if (data?.signedUrl) signed.set(f.id, data.signedUrl);
      }),
  );
  return visible.map((s) => ({
    id: s.id,
    title: s.title,
    files: s.moodle_files
      .sort((a, b) => a.position - b.position)
      .map((f) => ({
        id: f.id,
        file_name: f.file_name,
        type: f.type,
        mime_type: f.mime_type,
        file_size: f.file_size,
        href: signed.get(f.id) ?? f.moodle_url,
        isStored: signed.has(f.id),
      })),
  }));
}
```

- [ ] **Step 2: Client section** (loads on first expand):

```tsx
'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  getMoodleMaterialsForCourse,
  type MoodleSectionDto,
} from '@/lib/actions/moodle-materials';
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
      <button
        onClick={toggle}
        className="mb-3 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />{' '}
        Moodle Materials
      </button>
      {open && (
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {sections?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No imported Moodle files.
            </p>
          )}
          {sections?.map((section) => (
            <div key={section.id} className="rounded-lg border">
              <div className="border-b bg-muted/30 px-4 py-2">
                <h3 className="text-sm font-medium">{section.title}</h3>
              </div>
              <div className="divide-y">
                {section.files.map((f) => (
                  <MoodleFileRow
                    key={f.id}
                    fileId={f.id}
                    fileName={f.file_name}
                    fileType={f.type}
                    mimeType={f.mime_type}
                    fileSize={f.file_size}
                    href={f.href}
                    isStored={f.isStored}
                    courseId={courseId}
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

- [ ] **Step 3: Commit** — `git commit -m "perf(moodle): lazy-load Moodle materials with parallel signed URLs"`

---

## Task 16: Rewrite course page + Start Homework dialog (flat + parallel)

**Files:** `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`, `src/components/dashboard/start-homework-dialog.tsx`, `src/components/dashboard/material-item.tsx`

- [ ] **Step 1: Rewrite `page.tsx`.** Drop all week imports/fetches and the inline Moodle block. Fetch in parallel:

```tsx
const [{ data: documents }, { data: materials }, { data: personalFiles }] =
  await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('course_id', courseId)
      .order('position'),
    supabase
      .from('course_materials')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at'),
    supabase
      .from('personal_files')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at'),
  ]);
```

Keep the existing `linkedFileIds` filter (hide personal files that have a linked document). Render flat sections: **Documents** (`DocumentListWithMove`), **Materials** — one grid combining legacy `course_materials` (rendered with `<MaterialItem>`) and `personal_files` (rendered with `<PersonalFileItem>`), then `<MoodleMaterialsSection courseId={courseId} />`. Header buttons: `AiChatWrapper`, `StartHomeworkDialog` (no `weeks` prop), `CreateDocumentDialog`, `PersonalFileUpload` (label "Import File"). Remove `<WeekDialog>`. Update the empty-state copy to not mention weeks.

- [ ] **Step 2: Rewrite `start-homework-dialog.tsx`.** Remove the `weeks: CourseWeek[]` prop + `CourseWeek` import + `weekMap` (line 107). Replace the "Course materials grouped by week" block (lines 214-241) with a single flat list over the `materials` prop. Add under the Step-2 header:

```tsx
<p className="text-xs text-muted-foreground">
  The AI always sees all your course materials — pinning just tells it what to
  focus on first.
</p>
```

- [ ] **Step 3:** `material-item.tsx` — no week logic of its own; just confirm it still compiles against the updated `CourseMaterial` (now `course_id`) and `openMaterialAsDocument` (T9). No change expected beyond types.
- [ ] **Step 4: Typecheck + grep gate**

Run: `pnpm exec tsc --noEmit` → PASS.
Run: `grep -rnE "week_id|weekId|weekLabel|course_weeks|CourseWeek" src --include=*.ts --include=*.tsx | grep -v ".test."` → **expected: no output.**

- [ ] **Step 5: Commit** — `git commit -m "refactor(course): flat page (parallel fetch), flat Start Homework dialog, lazy Moodle"`

---

## Task 17: Analytics — drop `week_id` from `file_uploaded`

**Files:** `src/lib/analytics/events.ts`, `src/lib/analytics/events.test.ts`

- [ ] **Step 1:** Remove `week_id` from the `file_uploaded` event in `AnalyticsEventMap` (line 20). (`document_moved` has no `week_id` — it carries only `destination_type`; leave it.) The only `file_uploaded` call site was `material-upload.tsx` (deleted) — `grep -rn "file_uploaded" src` to confirm and clean any remaining caller.
- [ ] **Step 2:** Update `events.test.ts` (lines ~40-47) so the `file_uploaded` assertion no longer expects `week_id`.
- [ ] **Step 3: Commit** — `git commit -m "chore(analytics): drop week_id from file_uploaded event"`

---

## Task 18: Fix remaining broken tests

**Files:** `embeddings.integration.test.ts`, `schema.integration.test.ts`, `rls-isolation.integration.test.ts`, `ai-context.test.ts`, `documents.integration.test.ts`, `courses.integration.test.ts`, `conversations.integration.test.ts`, `search/validation.test.ts`, `move-document-dialog.test.tsx`. Delete `course-weeks-materials.integration.test.ts`.

- [ ] **Step 1:** `git rm src/lib/actions/course-weeks-materials.integration.test.ts`
- [ ] **Step 2:** In each suite: remove `week_id` from inserts/assertions; change `course_materials` inserts to `course_id`; drop `weekId` from `indexContent`/`matchEmbeddings`/`searchContext` calls; in `search/validation.test.ts` remove the assertions that `weekId` is forwarded (lines ~78-102). Work one file at a time, running it after each fix.
- [ ] **Step 3: Full unit + integration**

Run: `pnpm test && pnpm test:integration` → ALL PASS.

- [ ] **Step 4: Commit** — `git commit -m "test: migrate suites to flat course model"`

---

## Task 19: E2E — imported file embedded & flat course page

**Files:** `e2e/TEST_REGISTRY.md`, `e2e/course-materials.spec.ts`

- [ ] **Step 1:** Add scenarios to `e2e/TEST_REGISTRY.md`: (a) course page shows flat Documents + Materials, no "Weeks"; (b) Import File → appears under Materials; (c) Moodle section expands on click.
- [ ] **Step 2:** Write the Playwright test with `e2e/helpers/auth.ts` (`test@typenote.dev` / `Test1234`), no `test.skip`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('course page is flat: Materials section present, no Weeks heading', async ({
  page,
}) => {
  await login(page);
  await page.goto('/dashboard');
  await page
    .getByRole('link', { name: /CS101|<seeded course name>/i })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Weeks' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Materials/i })).toBeVisible();
});
```

- [ ] **Step 3: Run** — `pnpm test:e2e -- course-materials` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "test(e2e): flat course page + Materials"`

---

## Task 20: Full suite + lint/build + PR

- [ ] **Step 1:** `pnpm test && pnpm test:integration && pnpm test:e2e` → ALL PASS.
- [ ] **Step 2:** `pnpm lint && pnpm exec prettier --check . && pnpm build` → clean.
- [ ] **Step 3:** Push + PR:

```bash
git push -u origin feat/homework-focused-ai-context
gh pr create --base dev --title "Phase 1: flat course model + unified embedded materials + perf" \
  --body "Implements Phase 1 of docs/superpowers/specs/2026-05-25-homework-focused-ai-context-design.md"
```

---

## Self-review notes (author)

- **Spec coverage:** §4.1 flatten/FK-ordering → T1; §4.2 personal_file embed + non-null guard + retire importMoodleFile → T6/T7/T8/T10; §4.5 flat page + dialog → T16; §4.6 perf/lazy Moodle → T15/T16; §6 seed+tests → T2/T3/T8/T18/T19; §9 SYSTEM_PROMPT + ChatSource.weekId + file_uploaded → T11/T4+T13/T17.
- **Full week surface (29 files) all tasked** — verified by the `grep` gate in T16 Step 4 (must return nothing).
- **Test harness:** all integration tests use `@/test/supabase-client` + seeded `TEST_USER_A/B` (real profiles → no FK violation).
- **Ordering:** seed rewrite (T2) precedes the first `db reset` so Tasks 3/8 run on a clean DB.
- **Type consistency:** `IndexSource` personal_file = `{ type, fileId, courseId }`; `matchEmbeddings` params have no `weekId`; `CourseMaterial.course_id`; `openMaterialAsDocument` reads `course_materials.course_id`.
- Homework AI wiring (§4.3/§4.4) is **not** here — it is Phase 2.
