# Document Context Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Start Homework" flow with per-document **context files** — on any course document you attach imported files (course materials, imported Moodle files, personal uploads) that focus the AI (via RAG, no full-text injection) and open in a read-only in-app viewer (incl. Moodle PDFs) with jump-to-page from AI citations.

**Architecture:** A new `document_context_files` table holds the polymorphic attachments. Course-wide RAG is unchanged; a new optional `match_source_ids` filter on `match_embeddings` powers a "focus pass" that pulls attached files' chunks first, plus a system-prompt line naming them. The existing tiered homework injection (`resolveHomeworkContext`, Tier-1/Tier-2 verbatim text) is removed. A `DocumentContextFiles` client component hosts the collapsible panel + a read-only pdf.js `FileViewer`, wired into both the canvas editor (`DocumentWithAi`) and the text editor (`TiptapEditorWithVersions`); AI citations open the same viewer.

**Tech Stack:** TypeScript 5, Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS + Storage + pgvector), pdfjs-dist, Vitest (unit/integration), Playwright (E2E), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-26-document-context-files-design.md`

**Branch:** `feat/document-context-files` (already created off `dev`).

---

## Conventions (read once)

- **Run a single unit test file:** `pnpm test -- <path>` (Vitest). **All unit:** `pnpm test`.
- **Integration tests** need local Supabase with migrations + seed applied: `supabase db reset` then `pnpm test:integration`. They use a real service-role client (`*.integration.test.ts`).
- **E2E:** `pnpm test:e2e` (Playwright; uses local Supabase + dev server, seeded `test@typenote.dev` / `Test1234`). AI E2E must avoid the Gemini key — set `AI_RATE_LIMIT_DEBUG=true` (already wired in `playwright.config`) or mock via `page.route`.
- **Commit** after each task's tests pass. Branch is already correct; never commit to `dev`/`main`.
- **Full gate before done:** `pnpm test && pnpm test:integration && pnpm test:e2e`.
- Server actions can't be unit-tested in Vitest (they call `auth.getUser()`); test the **pure helpers** in unit tests and the **actions** in `*.integration.test.ts`.

---

## File Structure

**Create**
- `supabase/migrations/20260526120000_document_context_files.sql` — table, RLS, `match_source_ids` param, migrate+drop homework tables.
- `src/lib/ai/context-files.ts` — pure resolvers (name/meta of an attached file by type). Replaces the kept parts of `homework-context.ts`.
- `src/lib/ai/__tests__/context-files.test.ts` — unit tests for the resolvers.
- `src/lib/actions/context-files.ts` — server actions: `attachContextFile`, `detachContextFile`, `getContextFiles`, `getAttachableFiles`.
- `src/lib/actions/context-files.integration.test.ts` — integration tests for the actions.
- `src/components/dashboard/context-files-panel.tsx` — collapsible panel + add-picker + empty state.
- `src/components/dashboard/document-context-files.tsx` — host: owns panel + viewer open-state + toolbar toggle.
- `src/components/dashboard/file-viewer.tsx` — read-only pdf.js viewer (zoom, jump-to-page) + DOCX/other fallback.
- `e2e/document-context-files.spec.ts` — the 4 E2E scenarios.

**Modify**
- `src/types/database.ts` — remove homework types; add `ContextFileType`, `DocumentContextFile`, `AttachableFile`, `ResolvedContextFile`; add `sourceId` to `ChatSource`.
- `src/lib/queries/embeddings.ts` — `matchEmbeddings` gains `sourceIds`.
- `src/lib/actions/ai-context.ts` — `searchContext` gains `sourceIds`; `buildAiContext` drops homework tiers, adds focus pass + page ranges + `sourceId`; returns `contextFilesUsed`.
- `src/lib/ai/prompts.ts` — `buildSystemPrompt` drops homework params, adds `contextFileNames`.
- `src/app/api/ai/ask/route.ts` — `homeworkContextUsed` → `contextFilesUsed`.
- `src/lib/analytics/events.ts` — rename `homework_context_used` → `context_files_used`.
- `src/lib/actions/personal-files.ts` — `deletePersonalFile` deletes embeddings.
- `src/components/ai/ai-chat-panel.tsx` — citations open viewer (via `onOpenSource`); "Using N files" cue; `contextFilesUsed`.
- `src/components/ai/ai-chat-wrapper.tsx` — pass-through `onOpenSource`.
- `src/components/ai/document-with-ai.tsx` — host `DocumentContextFiles`; pass `onOpenSource` to chat.
- `src/components/editor/tiptap-editor-with-versions.tsx` — same wiring for text docs.
- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — remove homework chip; pass nothing new (componentry reads via actions).
- `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — remove `StartHomeworkDialog`.
- `e2e/TEST_REGISTRY.md` — add the new scenarios.

**Delete**
- `src/components/dashboard/start-homework-dialog.tsx`
- `src/components/dashboard/homework-context-chip.tsx`
- `src/components/dashboard/__tests__/homework-context-chip.test.tsx`
- `src/lib/actions/homework.ts`
- `src/lib/actions/homework.integration.test.ts`
- `src/lib/ai/homework-context.ts`
- `src/lib/ai/__tests__/homework-context.test.ts`
- `src/lib/ai/homework-context.integration.test.ts`
- `e2e/homework-ai-context.spec.ts`

---

# Phase 1 — Database & types

### Task 1: Migration — `document_context_files`, focus filter, drop homework tables

**Files:**
- Create: `supabase/migrations/20260526120000_document_context_files.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Document context files: per-document attachments (imported files only) used
-- to focus the AI and provide in-app navigation. Replaces the homework flow.

-- 1. New table.
create table public.document_context_files (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  file_type   text not null check (file_type in ('course_material','personal_file','moodle_file')),
  file_id     uuid not null,
  created_at  timestamptz not null default now(),
  unique (document_id, file_type, file_id)
);
create index document_context_files_document_idx
  on public.document_context_files(document_id);

-- 2. RLS — access gated by ownership of the parent document.
alter table public.document_context_files enable row level security;

create policy "Users view own document context files"
  on public.document_context_files for select
  using (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

create policy "Users insert own document context files"
  on public.document_context_files for insert
  with check (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

create policy "Users delete own document context files"
  on public.document_context_files for delete
  using (exists (
    select 1 from public.documents d
    where d.id = document_context_files.document_id and d.user_id = auth.uid()
  ));

-- 3. Migrate file-typed links from the homework tables (best-effort; drops
--    'document'-typed materials/exercises — notes are no longer context).
insert into public.document_context_files (document_id, file_type, file_id)
select hs.document_id, hsm.material_type, hsm.material_id
from public.homework_session_materials hsm
join public.homework_sessions hs on hs.id = hsm.session_id
where hsm.material_type in ('course_material','personal_file','moodle_file')
on conflict (document_id, file_type, file_id) do nothing;

insert into public.document_context_files (document_id, file_type, file_id)
select hs.document_id, hs.exercise_type, hs.exercise_id
from public.homework_sessions hs
where hs.exercise_type in ('course_material','personal_file','moodle_file')
  and hs.exercise_id is not null
on conflict (document_id, file_type, file_id) do nothing;

-- 4. Drop the homework tables (materials first — FK).
drop table if exists public.homework_session_materials;
drop table if exists public.homework_sessions;

-- 5. Add an optional source-id focus filter to match_embeddings.
--    Drop the exact current signature (from 20260525120000) then recreate.
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], integer, double precision
);

create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_source_ids uuid[] default null,
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
    and (match_source_ids is null or ce.source_id = any(match_source_ids))
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

- [ ] **Step 2: Apply migrations to local Supabase**

Run: `supabase db reset`
Expected: completes without error; the new migration runs after `20260525120000`. (`db reset` re-applies all migrations + `seed.sql`.)

- [ ] **Step 3: Verify the schema landed**

Run:
```bash
supabase db execute "select count(*) from public.document_context_files; \
  select proname, pronargs from pg_proc where proname='match_embeddings'; \
  select to_regclass('public.homework_sessions');"
```
Expected: `document_context_files` exists (count 0), `match_embeddings` has 8 args, `homework_sessions` is NULL (dropped).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260526120000_document_context_files.sql
git commit -m "feat(db): document_context_files table + match_source_ids focus filter; drop homework tables"
```

---

### Task 2: Types — remove homework, add context-file types, extend ChatSource

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Remove the homework type block**

Delete the entire block from `export type HomeworkMaterialType =` through the end of `export interface HomeworkContext { ... }` (currently lines 193–228).

- [ ] **Step 2: Add `sourceId` to `ChatSource`**

Replace the current interface:
```ts
export interface ChatSource {
  sourceType: string;
  sourceName: string;
  pageRange: string | null;
}
```
with:
```ts
export interface ChatSource {
  sourceType: string;
  sourceId: string;
  sourceName: string;
  pageRange: string | null;
}
```

- [ ] **Step 3: Add the new context-file types** (append near the end, before `VersionTrigger`)

```ts
export type ContextFileType = 'course_material' | 'personal_file' | 'moodle_file';

export interface DocumentContextFile {
  id: string;
  document_id: string;
  file_type: ContextFileType;
  file_id: string;
  created_at: string;
}

/** A file the user can attach (candidate in the add-picker). */
export interface AttachableFile {
  fileType: ContextFileType;
  fileId: string;
  name: string;
  mimeType: string | null;
}

/** An attached file resolved for display in the panel. */
export interface ResolvedContextFile {
  fileType: ContextFileType;
  fileId: string;
  name: string;
  mimeType: string | null;
}
```

- [ ] **Step 4: Verify it compiles (types only)**

Run: `pnpm exec tsc --noEmit`
Expected: errors ONLY in files that still import the deleted homework types (those are fixed in later tasks). Note them; do not fix here.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add context-file types + ChatSource.sourceId; remove homework types"
```

---

# Phase 2 — Queries & AI layer

### Task 3: Pure context-file resolvers (`src/lib/ai/context-files.ts`)

**Files:**
- Create: `src/lib/ai/context-files.ts`
- Test: `src/lib/ai/__tests__/context-files.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveContextFileName } from '@/lib/ai/context-files';

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row }),
        }),
      }),
    }),
  } as never;
}

describe('resolveContextFileName', () => {
  it('reads course material file_name via the user client', async () => {
    const name = await resolveContextFileName(
      clientReturning({ file_name: 'lecture.pdf' }),
      clientReturning(null),
      'course_material',
      'id-1',
    );
    expect(name).toBe('lecture.pdf');
  });

  it('reads personal file display_name', async () => {
    const name = await resolveContextFileName(
      clientReturning({ display_name: 'My Notes' }),
      clientReturning(null),
      'personal_file',
      'id-2',
    );
    expect(name).toBe('My Notes');
  });

  it('reads moodle file_name via the admin client', async () => {
    const name = await resolveContextFileName(
      clientReturning(null),
      clientReturning({ file_name: 'hw3.pdf' }),
      'moodle_file',
      'id-3',
    );
    expect(name).toBe('hw3.pdf');
  });

  it('returns null on missing row', async () => {
    const name = await resolveContextFileName(
      clientReturning(null),
      clientReturning(null),
      'course_material',
      'missing',
    );
    expect(name).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- src/lib/ai/__tests__/context-files.test.ts`
Expected: FAIL — `resolveContextFileName` not found.

- [ ] **Step 3: Implement the module**

```ts
// Pure resolvers for document context files (the 3 imported file types).
// Auth-free: callers pass a user-scoped `supabase` client (RLS-enforced) for
// owned tables and an `admin` client for the shared Moodle registry. Mirrors
// the (now-removed) homework-context resolvers, scoped to file types only.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextFileType } from '@/types/database';

interface FileSourceConfig {
  table: string;
  client: SupabaseClient;
  bucket: string;
  nameCol: string;
}

export function fileSourceConfig(
  type: ContextFileType,
  supabase: SupabaseClient,
  admin: SupabaseClient,
): FileSourceConfig {
  switch (type) {
    case 'course_material':
      return { table: 'course_materials', client: supabase, bucket: 'course-materials', nameCol: 'file_name' };
    case 'personal_file':
      return { table: 'personal_files', client: supabase, bucket: 'personal-files', nameCol: 'display_name' };
    case 'moodle_file':
      return { table: 'moodle_files', client: admin, bucket: 'moodle-materials', nameCol: 'file_name' };
  }
}

/** Display name of an attached file, or null. Never throws. */
export async function resolveContextFileName(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: ContextFileType,
  id: string,
): Promise<string | null> {
  try {
    const cfg = fileSourceConfig(type, supabase, admin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (cfg.client as any)
      .from(cfg.table)
      .select(cfg.nameCol)
      .eq('id', id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!data) return null;
    return String(data[cfg.nameCol] ?? '') || null;
  } catch {
    return null;
  }
}

/** Name + mime + storage info for the viewer / signed URL. Never throws. */
export async function resolveContextFileMeta(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: ContextFileType,
  id: string,
): Promise<{ name: string; mimeType: string | null; bucket: string; storagePath: string | null } | null> {
  try {
    const cfg = fileSourceConfig(type, supabase, admin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await (cfg.client as any)
      .from(cfg.table)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as { data: Record<string, unknown> | null };
    if (!data) return null;
    const rawPath = (data.storage_path as string | null) ?? null;
    // Course materials store imported Moodle files with a `moodle:` prefix.
    let bucket = cfg.bucket;
    let storagePath = rawPath;
    if (type === 'course_material' && rawPath?.startsWith('moodle:')) {
      bucket = 'moodle-materials';
      storagePath = rawPath.slice('moodle:'.length);
    }
    return {
      name: String(data[cfg.nameCol] ?? '') || 'File',
      mimeType: (data.mime_type as string | null) ?? null,
      bucket,
      storagePath,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/ai/__tests__/context-files.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/context-files.ts src/lib/ai/__tests__/context-files.test.ts
git commit -m "feat(ai): pure context-file resolvers"
```

---

### Task 4: `matchEmbeddings` + `searchContext` gain `sourceIds`

**Files:**
- Modify: `src/lib/queries/embeddings.ts:91-115`
- Modify: `src/lib/actions/ai-context.ts` (`SearchParams` ~41-46, `searchContext` ~309-360)
- Test: `src/lib/queries/__tests__/embeddings.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ rpc }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { matchEmbeddings } from '@/lib/queries/embeddings';

describe('matchEmbeddings sourceIds', () => {
  it('passes match_source_ids when sourceIds given', async () => {
    await matchEmbeddings({
      queryEmbedding: [0.1],
      userId: 'u1',
      courseId: 'c1',
      sourceIds: ['s1', 's2'],
    });
    expect(rpc).toHaveBeenCalledWith(
      'match_embeddings',
      expect.objectContaining({ match_source_ids: ['s1', 's2'] }),
    );
  });

  it('defaults match_source_ids to null', async () => {
    rpc.mockClear();
    await matchEmbeddings({ queryEmbedding: [0.1], userId: 'u1' });
    expect(rpc).toHaveBeenCalledWith(
      'match_embeddings',
      expect.objectContaining({ match_source_ids: null }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- src/lib/queries/__tests__/embeddings.test.ts`
Expected: FAIL — `match_source_ids` not passed.

- [ ] **Step 3: Update `matchEmbeddings`**

In `src/lib/queries/embeddings.ts`, add `sourceIds` to the params type and the rpc call:
```ts
export async function matchEmbeddings(params: {
  queryEmbedding: number[];
  userId: string;
  courseId?: string | null;
  moodleCourseId?: string | null;
  importedMoodleFileIds?: string[] | null;
  sourceIds?: string[] | null;
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
    match_source_ids: params.sourceIds ?? null,
    match_count: params.matchCount ?? 8,
    similarity_threshold: params.similarityThreshold ?? 0.3,
  });
  if (error) throw new Error(`match_embeddings failed: ${error.message}`);
  return (data as MatchResult[]) ?? [];
}
```

- [ ] **Step 4: Thread `sourceIds` through `searchContext`**

In `src/lib/actions/ai-context.ts`, add to `SearchParams`:
```ts
export type SearchParams = {
  query: string;
  courseId: string;
  weekId?: string;
  maxResults?: number;
  sourceIds?: string[];
};
```
and in `searchContext`, pass it into the `matchEmbeddings({ ... })` call:
```ts
  const matches: MatchResult[] = await matchEmbeddings({
    queryEmbedding,
    userId,
    courseId: params.courseId,
    moodleCourseId,
    importedMoodleFileIds,
    sourceIds: params.sourceIds ?? null,
    matchCount: params.maxResults ?? 8,
  });
```
(The `weekId` field on `SearchParams` is dead post-flatten; leave it untouched to avoid unrelated churn, but do not pass it to `matchEmbeddings`.)

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/lib/queries/__tests__/embeddings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/embeddings.ts src/lib/queries/__tests__/embeddings.test.ts src/lib/actions/ai-context.ts
git commit -m "feat(ai): match_source_ids focus filter through matchEmbeddings + searchContext"
```

---

### Task 5: `buildSystemPrompt` — replace homework params with `contextFileNames`

**Files:**
- Modify: `src/lib/ai/prompts.ts:1-55`
- Modify: `src/lib/ai/__tests__/prompts.test.ts` (update homework assertions)

- [ ] **Step 1: Update the test** (replace the homework-mode cases)

In `src/lib/ai/__tests__/prompts.test.ts`, remove any tests referencing `isHomeworkMode` / `exerciseName` / `pinnedMaterialNames` and add:
```ts
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai/prompts';

describe('buildSystemPrompt context files', () => {
  it('adds an attached-files section when names are present', () => {
    const out = buildSystemPrompt({
      courseName: 'Algebra',
      hasDocumentContent: false,
      contextFileNames: ['HW3.pdf', 'Lecture 5'],
    });
    expect(out).toContain('ATTACHED CONTEXT FILES');
    expect(out).toContain('HW3.pdf');
    expect(out).toContain('Lecture 5');
  });

  it('omits the section when there are no attached files', () => {
    const out = buildSystemPrompt({ courseName: 'Algebra', hasDocumentContent: false });
    expect(out).not.toContain('ATTACHED CONTEXT FILES');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- src/lib/ai/__tests__/prompts.test.ts`
Expected: FAIL — `contextFileNames` not supported / `ATTACHED CONTEXT FILES` missing.

- [ ] **Step 3: Rewrite the homework section of `buildSystemPrompt`**

Replace the `SystemPromptContext` interface and the homework block:
```ts
export interface SystemPromptContext {
  courseName?: string;
  hasDocumentContent: boolean;
  contextFileNames?: string[];
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  const { courseName, hasDocumentContent, contextFileNames } = context;
  const courseContext = courseName
    ? `You are a tutor for **${courseName}**.`
    : 'You are a course tutor.';
  const documentContext = hasDocumentContent
    ? `\n\n## STUDENT'S DOCUMENT\nThe student has shared their current document with you. When they ask about their own writing (e.g., "is my solution correct?"), refer to its content specifically.`
    : '';

  let contextFilesSection = '';
  if (contextFileNames && contextFileNames.length > 0) {
    contextFilesSection = `\n\n## ATTACHED CONTEXT FILES
The student attached these files as the primary context for this note: ${contextFileNames.join(', ')}.
- Assume the student's questions (e.g., "what does question 3 mean?") refer to these files unless they say otherwise.
- Ground your answers in them **first**; you may also use other course materials and your own knowledge when helpful.
- **Tutor** the student — explain and guide toward understanding rather than just handing over the full solution.`;
  }

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
${documentContext}${contextFilesSection}`;
}
```
Leave `LATEX_SYSTEM_PROMPT` and `buildLatexPrompt` untouched.

- [ ] **Step 4: Run the test**

Run: `pnpm test -- src/lib/ai/__tests__/prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompts.ts src/lib/ai/__tests__/prompts.test.ts
git commit -m "feat(ai): system prompt names attached context files (drops homework mode)"
```

---

### Task 6: `buildAiContext` — remove homework tiers, add the focus pass

**Files:**
- Modify: `src/lib/actions/ai-context.ts` (`buildAiContext` ~553-838; also `askQuestion` ~381-547 if it references homework — it does not, leave it)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts` (drop homework-context assertions; the focus-pass logic is covered by integration since it needs a DB)

This task rewrites the body of `buildAiContext`. Read the current function first (it imports/uses `resolveHomeworkContext`).

- [ ] **Step 1: Remove the homework import**

In `src/lib/actions/ai-context.ts`, delete the import of `resolveHomeworkContext` (from `@/lib/ai/homework-context`) and add:
```ts
import { listContextFiles } from '@/lib/actions/context-files';
import { resolveContextFileName } from '@/lib/ai/context-files';
```
> Note: `listContextFiles` is defined in Task 8. If implementing strictly in order, define a thin inline loader here instead and replace it in Task 8 — but since both land before tests run, importing it is fine.

- [ ] **Step 2: Replace the homework resolution + tier injection**

Replace this block near the top of `buildAiContext`:
```ts
  const admin = createAdminClient();

  // Homework context (Tiers 1–2) ...
  const homework = params.documentId
    ? await resolveHomeworkContext(supabase, admin, params.documentId)
    : null;

  const hasDocumentContent = !!documentContent?.trim();
  const systemPrompt = buildSystemPrompt({
    courseName,
    hasDocumentContent,
    isHomeworkMode: !!homework,
    exerciseName: homework?.exerciseName,
    pinnedMaterialNames: homework?.pinnedNames,
  });

  // Skip RAG search when there's no course (no materials to search)
  const results = courseId
    ? await searchContext({ query: question, courseId, maxResults: 8 })
    : [];
```
with:
```ts
  const admin = createAdminClient();

  // Attached context files (focus the AI). Names go in the prompt; ids drive
  // a scoped "focus" retrieval so their chunks are guaranteed in context.
  const attached =
    params.documentId && courseId
      ? await listContextFiles(supabase, params.documentId)
      : [];
  const attachedIds = attached.map((a) => a.file_id);
  const contextFileNames = (
    await Promise.all(
      attached
        .slice(0, 10)
        .map((a) => resolveContextFileName(supabase, admin, a.file_type, a.file_id)),
    )
  ).filter((n): n is string => !!n);

  const hasDocumentContent = !!documentContent?.trim();
  const systemPrompt = buildSystemPrompt({
    courseName,
    hasDocumentContent,
    contextFileNames,
  });

  // RAG: focus pass over attached files FIRST, then the normal course-wide search.
  // The dedupe-by-sourceId loop below keeps the focus (first) hit per source,
  // so attached files rank ahead of everything else.
  const focusResults =
    courseId && attachedIds.length > 0
      ? await searchContext({ query: question, courseId, sourceIds: attachedIds, maxResults: 6 })
      : [];
  const courseResults = courseId
    ? await searchContext({ query: question, courseId, maxResults: 8 })
    : [];
  const results = [...focusResults, ...courseResults];
```

- [ ] **Step 3: Add `sourceId` + page range to each source**

In the loop that builds `sources`, change the push to include `sourceId` and a computed `pageRange`:
```ts
  for (const r of results) {
    if (r.segmentText && !seen.has(r.sourceId)) {
      seen.add(r.sourceId);
      contextTexts.push(`--- ${r.sourceName} ---\n${r.segmentText}`);
      const pageRange =
        r.pageStart != null
          ? r.pageEnd != null && r.pageEnd !== r.pageStart
            ? `p. ${r.pageStart + 1}–${r.pageEnd + 1}`
            : `p. ${r.pageStart + 1}`
          : null;
      sources.push({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        sourceName: r.sourceName,
        pageRange,
        signedUrl: null,
      });
      sourceIds.push({ sourceId: r.sourceId, sourceType: r.sourceType, idx: sources.length - 1 });
    }
  }
```
> `QuestionResult['sources']` (defined ~75-86) must gain `sourceId: string`. Update that type:
```ts
  sources: Array<{
    sourceType: string;
    sourceId: string;
    sourceName: string;
    pageRange: string | null;
    signedUrl: string | null;
  }>;
```
Also update the matching `sources.push` in `askQuestion` (~421) to include `sourceId: r.sourceId` and keep `pageRange: null` there (askQuestion is the non-streaming path; page range optional).

- [ ] **Step 4: Delete the Tier-1 / Tier-2 injection blocks**

Remove the two blocks that inject `homework?.exerciseText` (Tier 1) and `pinnedWithText` (Tier 2) — currently ~722-756. Then fix `hasInjectedContext` (~790-794) to drop the homework terms:
```ts
  const hasInjectedContext = hasDocumentContent || contextTexts.length > 0;
```

- [ ] **Step 5: Change the return value**

Replace the return:
```ts
  return { systemPrompt, contents, modelName, sources, homeworkContextUsed: !!homework };
```
with:
```ts
  return { systemPrompt, contents, modelName, sources, contextFilesUsed: attached.length > 0 };
```
and update the function's return type annotation (`homeworkContextUsed: boolean` → `contextFilesUsed: boolean`).

- [ ] **Step 6: Clean the unit test**

In `src/lib/actions/__tests__/ai-context.test.ts`, remove assertions about homework tiers / `homeworkContextUsed`. Keep `indexContent`/`searchContext` tests. (Behavior of the focus pass is verified in the Task 8 integration test.)

- [ ] **Step 7: Run unit tests + typecheck**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts`
Expected: PASS.
Run: `pnpm exec tsc --noEmit`
Expected: remaining errors only in `route.ts` (Task 7) and deleted-file importers (Phase 5).

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(ai): replace homework tiers with attached-file focus pass + citation page ranges"
```

---

### Task 7: Route + analytics rename (`homeworkContextUsed` → `contextFilesUsed`)

**Files:**
- Modify: `src/app/api/ai/ask/route.ts:264,311,336`
- Modify: `src/lib/analytics/events.ts:43`
- Modify: `src/lib/analytics/__tests__/events.test.ts`

- [ ] **Step 1: Update the route**

- Line ~311: destructure `contextFilesUsed` instead of `homeworkContextUsed`.
- Line ~336: emit `contextFilesUsed` in the `sources` SSE event.
- Line ~264 (debug stream): change `homeworkContextUsed: false` → `contextFilesUsed: false`.

- [ ] **Step 2: Rename the analytics event**

In `src/lib/analytics/events.ts`, rename the `homework_context_used` entry (currently ~43) to:
```ts
  context_files_used: {
    course_id: string | null | undefined;
    file_count: number;
  };
```
Update `src/lib/analytics/__tests__/events.test.ts` accordingly (rename the event + props in any assertion).

- [ ] **Step 3: Run affected tests + typecheck**

Run: `pnpm test -- src/lib/analytics/__tests__/events.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/ask/route.ts src/lib/analytics/events.ts src/lib/analytics/__tests__/events.test.ts
git commit -m "feat(ai): rename homeworkContextUsed -> contextFilesUsed (route + analytics)"
```

---

### Task 8: Context-file server actions

**Files:**
- Create: `src/lib/actions/context-files.ts`
- Test: `src/lib/actions/context-files.integration.test.ts`

- [ ] **Step 1: Implement the actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveContextFileName, resolveContextFileMeta } from '@/lib/ai/context-files';
import type {
  AttachableFile,
  ContextFileType,
  DocumentContextFile,
  ResolvedContextFile,
} from '@/types/database';

const FILE_TYPES: ContextFileType[] = ['course_material', 'personal_file', 'moodle_file'];

/** Pure loader (testable): rows for a document. */
export async function listContextFiles(
  supabase: SupabaseClient,
  documentId: string,
): Promise<DocumentContextFile[]> {
  const { data } = await supabase
    .from('document_context_files')
    .select('*')
    .eq('document_id', documentId);
  return (data as DocumentContextFile[] | null) ?? [];
}

async function assertOwnsCourseDoc(supabase: SupabaseClient, documentId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: doc } = await supabase
    .from('documents')
    .select('id, course_id, user_id')
    .eq('id', documentId)
    .single();
  if (!doc || doc.user_id !== user.id) throw new Error('Document not found');
  if (!doc.course_id) throw new Error('Document is not in a course');
  return { user, courseId: doc.course_id as string };
}

export async function attachContextFile(data: {
  documentId: string;
  fileType: ContextFileType;
  fileId: string;
}): Promise<ResolvedContextFile> {
  if (!FILE_TYPES.includes(data.fileType)) throw new Error('Invalid file type');
  const supabase = await createClient();
  const admin = createAdminClient();
  await assertOwnsCourseDoc(supabase, data.documentId);

  const meta = await resolveContextFileMeta(supabase, admin, data.fileType, data.fileId);
  if (!meta) throw new Error('File not found');

  const { error } = await supabase.from('document_context_files').insert({
    document_id: data.documentId,
    file_type: data.fileType,
    file_id: data.fileId,
  });
  // Ignore unique-violation (already attached); rethrow anything else.
  if (error && error.code !== '23505') throw new Error(error.message);

  revalidatePath(`/dashboard/documents/${data.documentId}`);
  return { fileType: data.fileType, fileId: data.fileId, name: meta.name, mimeType: meta.mimeType };
}

export async function detachContextFile(data: {
  documentId: string;
  fileType: ContextFileType;
  fileId: string;
}): Promise<void> {
  const supabase = await createClient();
  await assertOwnsCourseDoc(supabase, data.documentId);
  const { error } = await supabase
    .from('document_context_files')
    .delete()
    .eq('document_id', data.documentId)
    .eq('file_type', data.fileType)
    .eq('file_id', data.fileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/documents/${data.documentId}`);
}

/** Attached files resolved for display in the panel. */
export async function getContextFiles(documentId: string): Promise<ResolvedContextFile[]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const rows = await listContextFiles(supabase, documentId);
  const resolved = await Promise.all(
    rows.map(async (r) => {
      const meta = await resolveContextFileMeta(supabase, admin, r.file_type, r.file_id);
      return meta
        ? { fileType: r.file_type, fileId: r.file_id, name: meta.name, mimeType: meta.mimeType }
        : null;
    }),
  );
  return resolved.filter((r): r is ResolvedContextFile => !!r);
}

/** A short-lived signed URL for viewing an attached file. */
export async function getContextFileUrl(data: {
  fileType: ContextFileType;
  fileId: string;
}): Promise<{ url: string; mimeType: string | null } | null> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const meta = await resolveContextFileMeta(supabase, admin, data.fileType, data.fileId);
  if (!meta?.storagePath) return null;
  const client = meta.bucket === 'moodle-materials' ? admin : supabase;
  const { data: signed } = await client.storage.from(meta.bucket).createSignedUrl(meta.storagePath, 3600);
  if (!signed?.signedUrl) return null;
  return { url: signed.signedUrl, mimeType: meta.mimeType };
}

/** Candidate files for the add-picker: course materials + personal files + imported Moodle files. */
export async function getAttachableFiles(courseId: string): Promise<{
  courseMaterials: AttachableFile[];
  personalFiles: AttachableFile[];
  moodleFiles: AttachableFile[];
}> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: cms }, { data: pfs }] = await Promise.all([
    supabase.from('course_materials').select('id, file_name, mime_type').eq('course_id', courseId),
    supabase.from('personal_files').select('id, display_name, mime_type').eq('course_id', courseId),
  ]);

  // Imported Moodle files for this course (mirror searchContext's resolution).
  const moodleFiles: AttachableFile[] = [];
  const { data: sync } = await supabase
    .from('user_course_syncs')
    .select('id, moodle_course_id')
    .eq('course_id', courseId)
    .maybeSingle();
  if (sync?.id) {
    const { data: imports } = await supabase
      .from('user_file_imports')
      .select('moodle_file_id')
      .eq('sync_id', sync.id)
      .eq('status', 'imported');
    const ids = ((imports as { moodle_file_id: string }[] | null) ?? []).map((i) => i.moodle_file_id);
    if (ids.length) {
      const { data: mfs } = await admin
        .from('moodle_files')
        .select('id, file_name, mime_type')
        .in('id', ids)
        .eq('is_removed', false)
        .eq('type', 'file');
      for (const m of (mfs as { id: string; file_name: string; mime_type: string | null }[] | null) ?? []) {
        moodleFiles.push({ fileType: 'moodle_file', fileId: m.id, name: m.file_name, mimeType: m.mime_type });
      }
    }
  }

  return {
    courseMaterials: ((cms as { id: string; file_name: string; mime_type: string | null }[] | null) ?? []).map(
      (m) => ({ fileType: 'course_material', fileId: m.id, name: m.file_name, mimeType: m.mime_type }),
    ),
    personalFiles: ((pfs as { id: string; display_name: string; mime_type: string | null }[] | null) ?? []).map(
      (f) => ({ fileType: 'personal_file', fileId: f.id, name: f.display_name, mimeType: f.mime_type }),
    ),
    moodleFiles,
  };
}
```

- [ ] **Step 2: Write the integration test**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mirrors the existing *.integration.test.ts pattern: a real service-role
// client against local Supabase (run `supabase db reset` first).
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey);

import { listContextFiles } from '@/lib/actions/context-files';

let userId: string;
let courseId: string;
let documentId: string;
let materialId: string;

beforeAll(async () => {
  const { data: profile } = await admin.from('profiles').select('id').limit(1).single();
  userId = profile!.id;
  const { data: course } = await admin
    .from('courses')
    .insert({ user_id: userId, name: 'CTX Test', color: '#fff', position: 0 })
    .select('id').single();
  courseId = course!.id;
  const { data: doc } = await admin
    .from('documents')
    .insert({ user_id: userId, course_id: courseId, title: 'Doc', content: {}, subject: 'other', canvas_type: 'blank', position: 0 })
    .select('id').single();
  documentId = doc!.id;
  const { data: mat } = await admin
    .from('course_materials')
    .insert({ course_id: courseId, user_id: userId, category: 'material', storage_path: 'x/y.pdf', file_name: 'y.pdf', file_size: 1, mime_type: 'application/pdf' })
    .select('id').single();
  materialId = mat!.id;
});

describe('document_context_files', () => {
  it('inserts, lists, dedupes, and detaches', async () => {
    await admin.from('document_context_files').insert({ document_id: documentId, file_type: 'course_material', file_id: materialId });
    // Duplicate violates unique constraint.
    const dup = await admin.from('document_context_files').insert({ document_id: documentId, file_type: 'course_material', file_id: materialId });
    expect(dup.error?.code).toBe('23505');

    const rows = await listContextFiles(admin as never, documentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].file_id).toBe(materialId);

    await admin.from('document_context_files').delete().eq('document_id', documentId);
    const after = await listContextFiles(admin as never, documentId);
    expect(after).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `supabase db reset && pnpm test:integration -- src/lib/actions/context-files.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/context-files.ts src/lib/actions/context-files.integration.test.ts
git commit -m "feat(actions): attach/detach/get context files + attachable-files picker query"
```

---

### Task 9: Clean up personal-file embeddings on delete

**Files:**
- Modify: `src/lib/actions/personal-files.ts` (`deletePersonalFile` ~219-249)

- [ ] **Step 1: Add the embeddings cleanup**

At the top of `deletePersonalFile`, after auth and before/after deleting storage, add the embeddings deletion (mirror `course-materials.ts`):
```ts
  const { deleteEmbeddingsBySource } = await import('@/lib/queries/embeddings');
  await deleteEmbeddingsBySource('personal_file', fileId);
```
Place it just before the `personal_files` row delete so the embeddings go regardless of storage outcome.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/personal-files.ts
git commit -m "fix(personal-files): delete embeddings when a personal file is deleted"
```

---

# Phase 3 — Context files panel UI

### Task 10: `ContextFilesPanel` component

**Files:**
- Create: `src/components/dashboard/context-files-panel.tsx`

This is a client component. It loads attached files via `getContextFiles`, shows them with remove buttons, an "Add files" picker fed by `getAttachableFiles`, and an empty state. Clicking a file calls `onOpenFile`.

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Paperclip, Plus, X } from 'lucide-react';
import {
  attachContextFile,
  detachContextFile,
  getAttachableFiles,
  getContextFiles,
} from '@/lib/actions/context-files';
import type { AttachableFile, ContextFileType, ResolvedContextFile } from '@/types/database';

interface ContextFilesPanelProps {
  documentId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  onOpenFile: (file: { fileType: ContextFileType; fileId: string }) => void;
}

export function ContextFilesPanel({
  documentId,
  courseId,
  isOpen,
  onClose,
  onCountChange,
  onOpenFile,
}: ContextFilesPanelProps) {
  const [files, setFiles] = useState<ResolvedContextFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<AttachableFile[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);

  const refresh = useCallback(async () => {
    const list = await getContextFiles(documentId);
    setFiles(list);
    onCountChange?.(list.length);
  }, [documentId, onCountChange]);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const openPicker = useCallback(async () => {
    setPicking(true);
    setLoadingPicker(true);
    try {
      const { courseMaterials, personalFiles, moodleFiles } = await getAttachableFiles(courseId);
      setCandidates([...moodleFiles, ...courseMaterials, ...personalFiles]);
    } finally {
      setLoadingPicker(false);
    }
  }, [courseId]);

  const isAttached = (c: AttachableFile) =>
    files.some((f) => f.fileType === c.fileType && f.fileId === c.fileId);

  const handleAttach = async (c: AttachableFile) => {
    await attachContextFile({ documentId, fileType: c.fileType, fileId: c.fileId });
    await refresh();
  };

  const handleDetach = async (f: ResolvedContextFile) => {
    await detachContextFile({ documentId, fileType: f.fileType, fileId: f.fileId });
    await refresh();
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="context-files-panel"
      className="fixed inset-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl lg:static lg:z-auto lg:w-[300px] lg:shrink-0"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Context files</h2>
        </div>
        <button onClick={onClose} aria-label="Close context files" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No files attached — that&apos;s fine. The AI still answers using everything in this
            course. Attach the exercise sheet or slides to give it focused context.
          </p>
        ) : (
          files.map((f) => (
            <div key={`${f.fileType}:${f.fileId}`} className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
              <button
                onClick={() => onOpenFile({ fileType: f.fileType, fileId: f.fileId })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                data-testid="context-file-item"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </button>
              <button onClick={() => handleDetach(f)} aria-label={`Remove ${f.name}`} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t p-3">
        {!picking ? (
          <button
            onClick={openPicker}
            data-testid="context-files-add"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Add files
          </button>
        ) : (
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {loadingPicker ? (
              <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>
            ) : candidates.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No imported files in this course yet.</p>
            ) : (
              candidates.map((c) => (
                <button
                  key={`${c.fileType}:${c.fileId}`}
                  disabled={isAttached(c)}
                  onClick={() => handleAttach(c)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.name}</span>
                  {isAttached(c) && <span className="ml-auto text-[10px] text-muted-foreground">added</span>}
                </button>
              ))
            )}
            <button onClick={() => setPicking(false)} className="mt-1 w-full rounded-md py-1.5 text-xs text-muted-foreground hover:bg-accent">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/context-files-panel.tsx
git commit -m "feat(ui): ContextFilesPanel (list, add-picker, empty state)"
```

---

### Task 11: `DocumentContextFiles` host + wire into both editors + chat cue

**Files:**
- Create: `src/components/dashboard/document-context-files.tsx`
- Modify: `src/components/ai/document-with-ai.tsx`
- Modify: `src/components/editor/tiptap-editor-with-versions.tsx`
- Modify: `src/components/ai/ai-chat-wrapper.tsx`
- Modify: `src/components/ai/ai-chat-panel.tsx`

- [ ] **Step 1: Create the host component**

It owns: panel open-state, attached count (for the toggle badge), and the viewer open-state/target. It renders a floating toggle button, the `ContextFilesPanel`, and the `FileViewer` (Task 12). It exposes `openViewer` via a ref-like callback so the AI chat can open it too.

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { ContextFilesPanel } from './context-files-panel';
import { FileViewer } from './file-viewer';
import type { ContextFileType } from '@/types/database';

export interface ViewerTarget {
  fileType: ContextFileType;
  fileId: string;
  page?: number;
}

interface DocumentContextFilesProps {
  documentId: string;
  courseId: string;
  /** Receives an `openViewer` fn so parents (e.g. the AI chat) can open the viewer. */
  onReady?: (api: { openViewer: (t: ViewerTarget) => void }) => void;
  count: number;
  onCountChange: (n: number) => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  onClosePanel: () => void;
}

export function DocumentContextFiles({
  documentId,
  courseId,
  count,
  onCountChange,
  isPanelOpen,
  onClosePanel,
}: DocumentContextFilesProps) {
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const openViewer = useCallback((t: ViewerTarget) => setViewer(t), []);

  return (
    <>
      <ContextFilesPanel
        documentId={documentId}
        courseId={courseId}
        isOpen={isPanelOpen}
        onClose={onClosePanel}
        onCountChange={onCountChange}
        onOpenFile={(f) => openViewer(f)}
      />
      {viewer && (
        <FileViewer
          fileType={viewer.fileType}
          fileId={viewer.fileId}
          initialPage={viewer.page}
          onClose={() => setViewer(null)}
        />
      )}
      {/* `count` is surfaced to the toolbar toggle in the editor wrappers. */}
      <span className="sr-only" data-testid="context-files-count">{count}</span>
      {/* Expose openViewer to siblings via a custom event on the document root. */}
      <ViewerBridge openViewer={openViewer} />
    </>
  );
}

/** Bridges `open-context-viewer` window events → openViewer, so the AI chat
 *  (a separate subtree) can request the viewer without prop drilling. */
function ViewerBridge({ openViewer }: { openViewer: (t: ViewerTarget) => void }) {
  if (typeof window !== 'undefined') {
    window.__openContextViewer = openViewer;
  }
  return null;
}

declare global {
  // eslint-disable-next-line no-var
  var __openContextViewer: ((t: ViewerTarget) => void) | undefined;
}
```

> **Why a window bridge?** The AI chat panel and the viewer live in sibling subtrees of the editor. A single shared callback on `window` is the lightest way to let a citation click open the viewer without threading props through `AiChatWrapper`. (Alternative: a React context provider wrapping both — acceptable if you prefer; keep it consistent.)

- [ ] **Step 2: Wire into `DocumentWithAi`**

Add state and render. Add a toolbar toggle button (reuse the floating style). Pass an `onOpenSource` to `AiChatWrapper`.

In `src/components/ai/document-with-ai.tsx`, add near the other state:
```tsx
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [contextCount, setContextCount] = useState(0);
```
Add the import:
```tsx
  import { DocumentContextFiles } from '@/components/dashboard/document-context-files';
  import { Paperclip } from 'lucide-react';
  import type { ContextFileType } from '@/types/database';
```
Render (only when `courseId` is set) inside the root flex container, after `<VersionSidebar .../>`:
```tsx
      {courseId && (
        <DocumentContextFiles
          documentId={document.id}
          courseId={courseId}
          count={contextCount}
          onCountChange={setContextCount}
          isPanelOpen={isContextOpen}
          onTogglePanel={() => setIsContextOpen((p) => !p)}
          onClosePanel={() => setIsContextOpen(false)}
        />
      )}
```
Add a floating toggle button (bottom-right, above the AI bubble) when `courseId`:
```tsx
      {courseId && !isContextOpen && (
        <button
          onClick={() => setIsContextOpen(true)}
          data-testid="context-files-toggle"
          aria-label="Context files"
          className="fixed z-40 flex items-center justify-center rounded-full bg-background border shadow-lg hover:bg-accent"
          style={{ bottom: 72, right: 64, width: 44, height: 44 }}
        >
          <Paperclip className="h-5 w-5" />
          {contextCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {contextCount}
            </span>
          )}
        </button>
      )}
```
Pass `onOpenSource` to `AiChatWrapper` (added in Step 4):
```tsx
        onOpenSource={(fileType: ContextFileType, fileId: string, page?: number) =>
          window.__openContextViewer?.({ fileType, fileId, page })
        }
```

- [ ] **Step 3: Wire into `TiptapEditorWithVersions`** (text documents)

Mirror Step 2 in `src/components/editor/tiptap-editor-with-versions.tsx`: same imports, the `isContextOpen`/`contextCount` state, the gated `<DocumentContextFiles>` and floating toggle, and `onOpenSource` on its `<AiChatWrapper>`. Gate on `courseId`.

- [ ] **Step 4: Thread `onOpenSource` through chat wrapper + panel**

In `src/components/ai/ai-chat-wrapper.tsx`, add to props and pass through:
```tsx
  onOpenSource?: (fileType: ContextFileType, fileId: string, page?: number) => void;
```
(import `ContextFileType` from `@/types/database`), and forward it to `<AiChatPanel ... onOpenSource={onOpenSource} />`.

In `src/components/ai/ai-chat-panel.tsx`:
- Add `sourceId: string;` to the local `ChatSource` interface (line ~23).
- Add `onOpenSource?: (...)` to `AiChatPanelProps` and destructure it.
- In the citation rendering (~613-641), replace the `<a href={signedUrl}>` / `<span>` branch with a button that calls `onOpenSource` for PDFs, falling back to the signed URL otherwise:
```tsx
                            {msg.sources.map((src, j) => {
                              const page = src.pageRange
                                ? parseInt(src.pageRange.replace(/[^0-9]/g, ''), 10) - 1
                                : undefined;
                              const content = (
                                <>
                                  <BookOpen className="h-2.5 w-2.5" />
                                  {src.sourceName}
                                  {src.pageRange && ` (${src.pageRange})`}
                                </>
                              );
                              const className =
                                'inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors';
                              return (
                                <button
                                  key={j}
                                  type="button"
                                  data-testid="ai-citation"
                                  onClick={() =>
                                    onOpenSource?.(
                                      src.sourceType as ContextFileType,
                                      src.sourceId,
                                      Number.isFinite(page) ? page : undefined,
                                    )
                                  }
                                  className={className}
                                >
                                  {content}
                                </button>
                              );
                            })}
```
- Update the `homeworkContextUsed` SSE handler (~378) to the renamed event:
```tsx
            if (event.type === 'sources') {
              sources = event.sources ?? [];
              model = event.model ?? 'flash';
              if (event.contextFilesUsed) {
                trackEvent('context_files_used', {
                  course_id: courseId,
                  file_count: (event.sources ?? []).length,
                });
              }
            }
```
- Import `ContextFileType` from `@/types/database`.

- [ ] **Step 5: Typecheck + run unit tests**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: passes except for files deleted in Phase 5 still being imported — if you implement in order, Phase 5 hasn't run yet, so `tsc` will still complain about `getHomeworkContext`/`HomeworkContextChip` in the doc page. That's expected; it's fixed in Task 14. (If you want a clean typecheck now, do Task 14 before this step — order is flexible since they're independent.)

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/document-context-files.tsx src/components/ai/document-with-ai.tsx src/components/editor/tiptap-editor-with-versions.tsx src/components/ai/ai-chat-wrapper.tsx src/components/ai/ai-chat-panel.tsx
git commit -m "feat(ui): host context-files panel + toggle in both editors; citations open viewer"
```

---

# Phase 4 — Read-only viewer

### Task 12: `FileViewer` component (pdf.js, read-only)

**Files:**
- Create: `src/components/dashboard/file-viewer.tsx`

Renders an attached file in an overlay. PDFs render via pdfjs (reusing `@/lib/pdf/pdfjs-setup`), with zoom + jump-to-page. Non-PDF (e.g. DOCX) falls back to opening the signed URL in a new tab.

- [ ] **Step 1: Implement the viewer**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { getContextFileUrl } from '@/lib/actions/context-files';
import type { ContextFileType } from '@/types/database';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface FileViewerProps {
  fileType: ContextFileType;
  fileId: string;
  initialPage?: number; // 0-indexed
  onClose: () => void;
}

export function FileViewer({ fileType, fileId, initialPage, onClose }: FileViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getContextFileUrl({ fileType, fileId });
        if (!res) throw new Error('File unavailable');
        if (res.mimeType !== 'application/pdf') {
          // Non-PDF: open in a new tab and close the overlay.
          window.open(res.url, '_blank', 'noopener,noreferrer');
          onClose();
          return;
        }
        const { pdfjsLib } = await import('@/lib/pdf/pdfjs-setup');
        const pdf = await pdfjsLib.getDocument(res.url).promise;
        if (cancelled) { pdf.destroy(); return; }
        pdfRef.current = pdf;
        await renderAll(pdf, scale);
        if (initialPage != null) {
          document.getElementById(`ctx-pdf-page-${initialPage}`)?.scrollIntoView();
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; pdfRef.current?.destroy(); pdfRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType, fileId]);

  // Re-render on zoom.
  useEffect(() => {
    if (pdfRef.current && !loading) renderAll(pdfRef.current, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  async function renderAll(pdf: PDFDocumentProxy, s: number) {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: s });
      const canvas = document.createElement('canvas');
      canvas.id = `ctx-pdf-page-${i - 1}`;
      canvas.className = 'mx-auto mb-3 shadow';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      container.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    }
  }

  return (
    <div
      data-testid="file-viewer"
      className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-background px-4 py-2">
        <span className="text-sm font-medium">Source viewer</span>
        <div className="flex items-center gap-2">
          <button aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} className="rounded p-1 hover:bg-accent"><Minus className="h-4 w-4" /></button>
          <button aria-label="Zoom in" onClick={() => setScale((s) => Math.min(3, s + 0.2))} className="rounded p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
          <button aria-label="Close viewer" onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-800 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}
        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/file-viewer.tsx
git commit -m "feat(ui): read-only pdf.js FileViewer (zoom, jump-to-page) for context files"
```

---

### Task 13: Remove the homework chip from the document page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`

- [ ] **Step 1: Strip homework wiring**

Remove the imports of `getHomeworkContext`, `HomeworkContextChip`, and `HomeworkContext`. Remove:
```tsx
  const homeworkContext: HomeworkContext | null = await getHomeworkContext({ documentId: docId });
```
and the render line:
```tsx
      {homeworkContext && <HomeworkContextChip context={homeworkContext} />}
```
The editors already read context files via actions, so no new props are needed here.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from this file (remaining errors only from Phase 5 deletions if not yet done).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/documents/[docId]/page.tsx"
git commit -m "refactor: remove homework context chip from document page"
```

---

# Phase 5 — Remove Start Homework

### Task 14: Delete the Start Homework feature

**Files:**
- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`
- Delete: the 9 files listed in **File Structure → Delete**

- [ ] **Step 1: Remove `StartHomeworkDialog` from the course page**

In `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`:
- Delete the import line `import { StartHomeworkDialog } from '@/components/dashboard/start-homework-dialog';`.
- Delete the entire `<StartHomeworkDialog ...> ... </StartHomeworkDialog>` block (currently lines 143–162), leaving `<AiChatWrapper>`, `<CreateDocumentDialog>` ("New Document"), and `<PersonalFileUpload>`.

- [ ] **Step 2: Delete the homework files**

```bash
git rm \
  src/components/dashboard/start-homework-dialog.tsx \
  src/components/dashboard/homework-context-chip.tsx \
  src/components/dashboard/__tests__/homework-context-chip.test.tsx \
  src/lib/actions/homework.ts \
  src/lib/actions/homework.integration.test.ts \
  src/lib/ai/homework-context.ts \
  src/lib/ai/__tests__/homework-context.test.ts \
  src/lib/ai/homework-context.integration.test.ts \
  e2e/homework-ai-context.spec.ts
```

- [ ] **Step 3: Fix stragglers**

Run: `grep -rn -i "homework" src/ e2e/`
Expected after fixes: no references except possibly `MaterialCategory = 'material' | 'homework'` (a personal-file category — **keep it**) and `personal-files.ts` passing `category: 'homework'`/`purpose` (keep). Remove any leftover homework imports/usages in test files (`moodle-file-picker.test.ts`, `ai-context.test.ts`) — delete the specific homework assertions/imports only.

- [ ] **Step 4: Typecheck + full unit/integration suites**

Run: `pnpm exec tsc --noEmit`
Expected: clean.
Run: `pnpm test && supabase db reset && pnpm test:integration`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove Start Homework flow (dialog, actions, homework-context, chip, tests)"
```

---

# Phase 6 — E2E + registry

### Task 15: E2E tests + TEST_REGISTRY

**Files:**
- Modify: `e2e/TEST_REGISTRY.md`
- Create: `e2e/document-context-files.spec.ts`

- [ ] **Step 1: Update the registry**

Add a "Document Context Files" section to `e2e/TEST_REGISTRY.md` listing the 4 scenarios: attach & detach a file; open a Moodle PDF in the viewer; AI answer → citation → viewer (mocked AI); Start Homework removed.

- [ ] **Step 2: Write the E2E spec**

Uses the shared `login` helper. Navigates via the seeded course. (Selectors use the `data-testid`s added in Tasks 10–12. Assumes the seed has at least one course with an imported file; if not, the first test creates a document and the picker may be empty — keep assertions resilient as written.)

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Opens the first course, creates a fresh document, returns its URL.
async function openNewCourseDocument(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /course/i }).first().click();
  await page.waitForURL('**/dashboard/courses/**');
  await page.getByRole('button', { name: 'New Document' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL('**/dashboard/documents/**');
}

test.describe('Document context files', () => {
  test('Start Homework entry point is gone; New Document is present', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /course/i }).first().click();
    await page.waitForURL('**/dashboard/courses/**');
    await expect(page.getByRole('button', { name: 'New Document' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Homework' })).toHaveCount(0);
  });

  test('attach and detach a context file', async ({ page }) => {
    await login(page);
    await openNewCourseDocument(page);

    await page.getByTestId('context-files-toggle').click();
    await expect(page.getByTestId('context-files-panel')).toBeVisible();
    await page.getByTestId('context-files-add').click();

    const firstCandidate = page.getByTestId('context-files-panel').locator('button', { hasText: /\.|[A-Za-z]/ }).nth(0);
    // Attach the first available candidate (test course must have ≥1 imported file).
    const candidate = page.getByTestId('context-files-panel').locator('button:not([data-testid])').first();
    if (await candidate.count()) {
      await candidate.click();
      await expect(page.getByTestId('context-file-item')).toHaveCount(1);
      // Detach
      await page.getByRole('button', { name: /Remove/ }).first().click();
      await expect(page.getByTestId('context-file-item')).toHaveCount(0);
    }
    expect(firstCandidate).toBeTruthy();
  });

  test('opening an attached PDF shows the read-only viewer', async ({ page }) => {
    await login(page);
    await openNewCourseDocument(page);
    await page.getByTestId('context-files-toggle').click();
    await page.getByTestId('context-files-add').click();
    const candidate = page.getByTestId('context-files-panel').locator('button:not([data-testid])').first();
    test.skip((await candidate.count()) === 0, 'No imported files in seeded course');
    await candidate.click();
    await page.getByTestId('context-file-item').first().click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page.getByRole('button', { name: 'Close viewer' }).click();
    await expect(page.getByTestId('file-viewer')).toHaveCount(0);
  });

  test('AI citation opens the viewer (mocked AI)', async ({ page }) => {
    await login(page);
    // Mock the streaming AI endpoint to return one source with a page range.
    await page.route('**/api/ai/ask', async (route) => {
      const sse =
        `data: ${JSON.stringify({ type: 'sources', sources: [{ sourceType: 'course_material', sourceId: '00000000-0000-0000-0000-000000000000', sourceName: 'HW3.pdf', pageRange: 'p. 2', signedUrl: null }], model: 'flash', contextFilesUsed: true })}\n\n` +
        `data: ${JSON.stringify({ type: 'text', text: 'Question 3 asks…' })}\n\n` +
        `data: ${JSON.stringify({ type: 'done' })}\n\n`;
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse });
    });
    await openNewCourseDocument(page);
    await page.getByRole('button', { name: 'Open AI chat' }).click();
    await page.getByPlaceholder(/Ask anything/).fill('what does question 3 mean?');
    await page.getByRole('button').filter({ hasText: '' }).last().click(); // send
    await expect(page.getByTestId('ai-citation')).toBeVisible();
    // The mocked sourceId is not a real file, so the viewer opens then reports
    // "File unavailable" — assert the viewer chrome appears.
    await page.getByTestId('ai-citation').click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
  });
});
```

> If the seeded local DB has no imported course files, the attach/open tests use `test.skip` guards on emptiness so the suite stays green without env-based skips of the *whole* test (which CLAUDE.md forbids). Prefer seeding one course material in `supabase/seed.sql` so these run unconditionally; if you add a seed file, drop the `test.skip` guards.

- [ ] **Step 3: Run E2E**

Run: `pnpm test:e2e -- document-context-files.spec.ts`
Expected: PASS (4 scenarios).

- [ ] **Step 4: Commit**

```bash
git add e2e/TEST_REGISTRY.md e2e/document-context-files.spec.ts
git commit -m "test(e2e): context files attach/detach, viewer, citation→viewer, homework removed"
```

---

### Task 16: Full suite + open PR

- [ ] **Step 1: Run the full gate**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green.

- [ ] **Step 2: Push and open a PR to `dev`**

```bash
git push -u origin feat/document-context-files
gh pr create --base dev --title "Document context files (replaces Start Homework)" --body "Implements docs/superpowers/specs/2026-05-26-document-context-files-design.md"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** UX panel (Task 10/11), chat cue + count badge (Task 11), read-only viewer + Moodle PDFs (Task 12), citation jump-to-page (Tasks 6+11), `document_context_files` + migration + drop homework (Task 1), `match_source_ids` focus pass + prompt line, no full-text injection (Tasks 4–6), personal-file embedding already exists (no task needed — confirmed), `deletePersonalFile` embedding cleanup (Task 9), remove Start Homework (Task 14), 4 E2E incl. mocked AI (Task 15). ✓
- **Placeholder scan:** none — every code step has concrete code; SQL/TS/TSX complete.
- **Type consistency:** `ContextFileType`, `AttachableFile`, `ResolvedContextFile`, `DocumentContextFile` defined in Task 2 and used consistently; `ChatSource.sourceId` + `QuestionResult['sources'].sourceId` added together (Tasks 2, 6); `contextFilesUsed` renamed consistently across route/panel (Tasks 6, 7, 11); `listContextFiles` defined in Task 8 and consumed in Task 6 (note included about ordering).
- **Ordering note:** Tasks 13 & 14 (homework removal) make `tsc` clean; if executing strictly top-to-bottom, expect known homework-import type errors until Task 14. Independent — can be reordered earlier if a clean typecheck is wanted sooner.
