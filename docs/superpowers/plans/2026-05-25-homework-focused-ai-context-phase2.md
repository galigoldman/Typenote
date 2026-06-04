# Homework-Focused AI Context — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the persisted "Homework" object into the AI tutor so that, inside a homework document, the AI is given the exercise + the pinned materials as prioritized context (Tiers 1–2), still searches all the user's course materials (Tier 3 RAG), and tutors rather than dumps answers.

**Architecture:** A new pure, client-injected resolver (`resolveHomeworkContext`) extracts text for the exercise (ProseMirror JSON via the existing `extractDocumentText`) and each pinned material (download + existing PDF/DOCX extractors), under explicit token budgets, degrading gracefully when a file can't be fetched. `buildAiContext` calls it (keyed off the `documentId` the route already receives), injects extra turns, and flags `homeworkContextUsed`. `buildSystemPrompt` gains a homework mode. The chat panel threads `documentId` to `/api/ai/ask` and fires a `homework_context_used` analytics event when the server reports injection. The document page renders a "Homework context" chip (consuming the already-built `getHomeworkContext`). The Start Homework dialog gains Moodle files as a pinnable type.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript 5, Supabase (Postgres + RLS + Storage), `@google/genai` (Gemini), Vitest (unit + integration), Playwright (E2E).

**Branch:** `feat/homework-focused-ai-context` (Phase 2 lands on the SAME branch as Phase 1 — tested and merged together).

---

## Context every implementer needs

**This is Phase 2 of `docs/superpowers/specs/2026-05-25-homework-focused-ai-context-design.md` (read §4.4–§4.5, §6).** Phase 1 already: flattened weeks away, unified Materials, embeds every import per-user, and created the `homework_sessions` / `homework_session_materials` tables + `createHomeworkSession` / `getHomeworkContext` actions + the flat Start Homework dialog. Phase 2 makes the AI actually _use_ the homework context.

**Key existing pieces (verified, do not recreate):**

- `src/lib/ai/extract-document-text.ts` — `extractDocumentText(document: { content?; pages? })` already exists, is server-safe (no browser deps), handles text + canvas docs, and wraps math in `$…$`. **Reuse it for the exercise and any pinned `document`.**
- `src/lib/ai/extraction/pdf.ts` → `extractPdfText(buffer: Buffer)` (also handles PPTX). `src/lib/ai/extraction/docx.ts` → `extractDocxText(buffer: Buffer)`.
- `src/lib/actions/ai-context.ts` → `buildAiContext(params: QuestionParams)` is the **single live injection point** (the route streams from it). It currently ignores `params.documentId`. `askQuestion` is the non-streaming twin — **leave it unchanged** (not on the live path).
- `src/app/api/ai/ask/route.ts` already parses `documentId` and passes it into `buildAiContext` via `params`. The chat panel, however, **does not send `documentId`** — that plumbing is net-new.
- Homework docs render through `TiptapEditorWithVersions` (the text path: a fresh homework doc has `pages: null` + `material_id: null`, so `isTextDocument` is `true`). Both `TiptapEditorWithVersions` and `DocumentWithAi` mount `AiChatWrapper` → `AiChatPanel`, so the `documentId` plumbing must go through both.
- `getMoodleMaterialsForCourse(courseId): Promise<MoodleSectionDto[]>` (`src/lib/actions/moodle-materials.ts`) lazily returns the user's imported Moodle files (id, file_name, …) grouped by section. Reuse it in the dialog.

**Testability constraint (IMPORTANT — from project memory):** Server actions that call `supabase.auth.getUser()` (via `createClient()`) **cannot be integration-tested** in Vitest — there is no cookie/auth context. Therefore the heavy resolver is a **plain function that takes Supabase clients as arguments** (`resolveHomeworkContext(supabase, admin, documentId)`), living in a NON-`'use server'` module. `buildAiContext` (already a server action) creates the clients and calls it. This lets us unit-test with mocked clients AND integration-test by passing a real service-role client.

**Integration-test harness convention:** `src/test/supabase-client.ts` exports `createAdminClient()` (service_role, bypasses RLS), `createUserClient({email,password})`, and seeded constants `TEST_USER_A` (`test@typenote.dev` / `Test1234`, id `ac3be77d-4566-406c-9ac0-7c410634ad41`), `TEST_USER_B`, `TEST_USER_ID`. Model new integration tests on `src/lib/actions/homework.integration.test.ts`. Model new mocked-client unit tests on `src/lib/actions/__tests__/ai-context.test.ts` (it already mocks `.from().select().eq().single()` and `.storage.from().download()`).

**Seeded data Phase-2 tests rely on (in `supabase/seed.sql`):**

- Course `30000000-0000-0000-0000-000000000001` ("Introduction to CS").
- Exercise document `20000000-0000-0000-0000-000000000010` — title "Problem Set 1: Variables", `content` includes the text **"Explain the difference between mutable and immutable data types in Python"** and a codeBlock containing `x = [1, 2, 3]`.
- Homework working document `20000000-0000-0000-0000-000000000011`.
- Homework session `a0000000-0000-0000-0000-000000000001` (document_id `…011` → exercise `…010`).
- Pinned material `a1000000-…001`: a `course_material` → `50000000-0000-0000-0000-000000000001` ("lecture-1-slides.pdf"; **no storage object is seeded**, so its text extraction will fail gracefully — that is expected and is what we assert).
- Seeded `moodle_file` `63000000-0000-0000-0000-000000000001` = "syllabus.pdf" (for the moodle-name-resolution test).

**Git hygiene (carried from Phase 1):** Do NOT run `pnpm install`. If `pnpm-lock.yaml` drifts, `git checkout -- pnpm-lock.yaml`. Use explicit `git add <paths>`, never `git add -A`. Never commit `.env.local`. Commit after each task with a focused message; end the commit body with the Co-Authored-By trailer:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Run between tasks:** `pnpm test` (unit) for unit tasks, `pnpm test:integration` for integration tasks. **Type-check gate caveat:** CI does NOT run `tsc --noEmit`; type safety is enforced by `pnpm build` (which excludes `*.test.ts`/`e2e/`). A bare `pnpm exec tsc --noEmit` already reports **pre-existing** errors in test files (e.g. `math-extension.test.ts`, `canvas-page-renderer.test.ts`, `rls-isolation.integration.test.ts`) — vitest tolerates these (no type-check). So where a task step says "verify compiles", it means **introduce no NEW tsc error in the files you changed** — check with `pnpm exec tsc --noEmit 2>&1 | grep <your-changed-file>` (should be empty). The authoritative full type gate is `pnpm build` in Task 13.

---

## File structure (created / modified)

| File                                                                      | Responsibility                                                                                                  | Tasks  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| `src/types/database.ts`                                                   | Add `moodle_file` to `HomeworkMaterialType`; sync `HomeworkSession` polymorphic exercise columns                | T1     |
| `src/lib/actions/homework.ts`                                             | Extend `getHomeworkContext` to resolve `moodle_file` names                                                      | T2     |
| `src/lib/ai/prompts.ts`                                                   | `buildSystemPrompt` homework mode                                                                               | T3     |
| `src/lib/ai/homework-context.ts` (NEW)                                    | `resolveHomeworkContext(supabase, admin, documentId)` — tiered text extraction + budgets + graceful degradation | T4, T5 |
| `src/lib/ai/__tests__/homework-context.test.ts` (NEW)                     | Unit: tiering, caps, budget, degradation, moodle-via-admin                                                      | T4     |
| `src/lib/ai/homework-context.integration.test.ts` (NEW)                   | Integration: real seeded exercise text + graceful pinned failure                                                | T5     |
| `src/lib/ai/__tests__/prompts.test.ts` (NEW/extend)                       | Unit: homework-mode prompt                                                                                      | T3     |
| `src/lib/actions/ai-context.ts`                                           | `buildAiContext`: resolve homework, inject Tiers 1–2, return `homeworkContextUsed`                              | T6     |
| `src/lib/actions/__tests__/ai-context.test.ts`                            | Unit: `documentId` triggers homework injection                                                                  | T6     |
| `src/app/api/ai/ask/route.ts`                                             | Forward `homeworkContextUsed` in the `sources` SSE event                                                        | T7     |
| `src/lib/analytics/events.ts`                                             | Add `homework_context_used` event                                                                               | T8     |
| `src/components/ai/ai-chat-panel.tsx`                                     | `documentId` prop → POST body; fire `homework_context_used`                                                     | T9     |
| `src/components/ai/ai-chat-wrapper.tsx`                                   | Thread `documentId`                                                                                             | T9     |
| `src/components/ai/document-with-ai.tsx`                                  | Pass `documentId={document.id}`                                                                                 | T9     |
| `src/components/editor/tiptap-editor-with-versions.tsx`                   | Pass `documentId={document.id}`                                                                                 | T9     |
| `src/components/dashboard/homework-context-chip.tsx` (NEW)                | Presentational "Homework context" strip                                                                         | T10    |
| `src/components/dashboard/__tests__/homework-context-chip.test.tsx` (NEW) | Unit: chip renders exercise + pinned names                                                                      | T10    |
| `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`                | Fetch `getHomeworkContext`, render chip                                                                         | T10    |
| `src/components/dashboard/start-homework-dialog.tsx`                      | Moodle files as a pinnable type (lazy fetch)                                                                    | T11    |
| `e2e/homework-ai-context.spec.ts` (NEW)                                   | E2E real flow: start homework → chip → ask AI                                                                   | T12    |
| `e2e/TEST_REGISTRY.md`                                                    | Register the new scenarios                                                                                      | T12    |

---

### Task 1: Sync homework types

**Files:**

- Modify: `src/types/database.ts:193-205`

- [ ] **Step 1: Add `moodle_file` to the material-type union and sync the session columns**

In `src/types/database.ts`, replace the `HomeworkMaterialType` union and the `HomeworkSession` interface:

```ts
export type HomeworkMaterialType =
  | 'course_material'
  | 'personal_file'
  | 'document'
  | 'moodle_file';

export interface HomeworkSession {
  id: string;
  document_id: string;
  // Polymorphic exercise: today always a document (exercise_document_id set),
  // but migration 20260524144454 made it nullable and added exercise_type/id.
  exercise_document_id: string | null;
  exercise_type: string | null;
  exercise_id: string | null;
  course_id: string;
  user_id: string;
  created_at: string;
}
```

> Note: `createHomeworkSession` still sets `exercise_document_id` only; the new columns are nullable and unused by app code — they exist so `select('*')` casts stay honest.

- [ ] **Step 2: Verify the type change compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (a previously `string` field becoming `string | null` may surface a strict-null read in `homework.ts:122` / `:168` — that file is rewritten in Task 2; if tsc flags only those two lines, proceed, Task 2 fixes them).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(homework): add moodle_file material type + sync session columns"
```

---

### Task 2: Resolve `moodle_file` names in `getHomeworkContext`

**Files:**

- Modify: `src/lib/actions/homework.ts:1-11` (import), `:118-173` (resolution)
- Test: `src/lib/actions/homework.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `src/lib/actions/homework.integration.test.ts` a test that inserts a `moodle_file` pin (admin client) on the seeded session and asserts name resolution. NOTE: `getHomeworkContext` is a server action (needs auth) — so this test asserts the **DB-level data path** directly, mirroring the other tests in this file. Add inside the existing top-level `describe`:

```ts
it('homework_session_materials accepts moodle_file and the file name is resolvable', async () => {
  const admin = createAdminClient();
  const SESSION_ID = 'a0000000-0000-0000-0000-000000000001';
  const MOODLE_FILE_ID = '63000000-0000-0000-0000-000000000001'; // syllabus.pdf

  // Insert a moodle_file pin (CHECK constraint must allow 'moodle_file')
  const { error: insErr } = await admin
    .from('homework_session_materials')
    .insert({
      session_id: SESSION_ID,
      material_type: 'moodle_file',
      material_id: MOODLE_FILE_ID,
    });
  expect(insErr).toBeNull();

  // The name a resolver would surface comes from moodle_files.file_name
  const { data: mf } = await admin
    .from('moodle_files')
    .select('file_name')
    .eq('id', MOODLE_FILE_ID)
    .single();
  expect(mf?.file_name).toBe('syllabus.pdf');

  // cleanup
  await admin
    .from('homework_session_materials')
    .delete()
    .eq('session_id', SESSION_ID)
    .eq('material_type', 'moodle_file');
});
```

(If `createAdminClient` is not already imported in this file, add `import { createAdminClient } from '@/test/supabase-client';`.)

- [ ] **Step 2: Run it to verify it passes against the CHECK constraint**

Run: `pnpm test:integration -- homework.integration`
Expected: PASS (the migration already permits `moodle_file`; this guards against regression).

- [ ] **Step 3: Add the `moodle_file` branch to `getHomeworkContext`**

In `src/lib/actions/homework.ts`, add the admin-client import at the top (after the existing `createClient` import):

```ts
import { createAdminClient } from '@/lib/supabase/admin';
```

Then in the material-resolution loop (currently handling `course_material` / `personal_file` / `document`), add a fourth branch before `materials.push(...)`:

```ts
    } else if (mat.material_type === 'moodle_file') {
      // Moodle files are shared (user_id null on embeddings); read via admin
      // so RLS on the shared registry never hides the display name.
      const admin = createAdminClient();
      const { data: mf } = await admin
        .from('moodle_files')
        .select('file_name')
        .eq('id', mat.material_id)
        .single();
      if (mf) name = mf.file_name;
    }
```

Also fix the two `exercise_document_id` reads now that it is `string | null`: in the fallback object (around line 168) change `id: typedSession.exercise_document_id` to `id: typedSession.exercise_document_id ?? ''`.

- [ ] **Step 4: Verify compile + integration still green**

Run: `pnpm exec tsc --noEmit && pnpm test:integration -- homework.integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/homework.ts src/lib/actions/homework.integration.test.ts
git commit -m "feat(homework): resolve moodle_file names in getHomeworkContext"
```

---

### Task 3: Homework mode in `buildSystemPrompt`

**Files:**

- Modify: `src/lib/ai/prompts.ts:1-32`
- Test: `src/lib/ai/__tests__/prompts.test.ts` (create if absent)

- [ ] **Step 1: Write the failing unit test**

`src/lib/ai/__tests__/prompts.test.ts` **already exists** (it has `describe('buildSystemPrompt')` + `describe('buildLatexPrompt')` blocks asserting strings like `'You are a course tutor.'`, `STUDENT'S DOCUMENT`, `'- Material Name: brief description of what was referenced'`). **APPEND a new `describe` block with Edit — do NOT overwrite the file with Write** (that would delete the existing tests). The Task 3 Step 3 prompt rewrite preserves every string the existing tests assert, so they must stay green. Add (`describe`/`it`/`expect` are already imported at the top of the file):

```ts
describe('buildSystemPrompt — homework mode', () => {
  it('omits homework section when not in homework mode', () => {
    const p = buildSystemPrompt({
      courseName: 'CS101',
      hasDocumentContent: false,
    });
    expect(p).not.toMatch(/HOMEWORK SESSION/);
  });

  it('includes exercise name and pinned materials when in homework mode', () => {
    const p = buildSystemPrompt({
      courseName: 'CS101',
      hasDocumentContent: true,
      isHomeworkMode: true,
      exerciseName: 'Problem Set 1',
      pinnedMaterialNames: ['Lecture 1', 'Notes'],
    });
    expect(p).toMatch(/HOMEWORK SESSION/);
    expect(p).toMatch(/Problem Set 1/);
    expect(p).toMatch(/Lecture 1/);
    expect(p).toMatch(/Notes/);
    // prioritize, don't restrict
    expect(p).toMatch(/not restricted|freely use/i);
    // tutoring stance
    expect(p).toMatch(/hint|guide|rather than/i);
  });

  it('handles homework mode with no pinned materials', () => {
    const p = buildSystemPrompt({
      hasDocumentContent: false,
      isHomeworkMode: true,
      exerciseName: 'PS2',
      pinnedMaterialNames: [],
    });
    expect(p).toMatch(/PS2/);
    expect(p).not.toMatch(/marked as most relevant/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- prompts`
Expected: FAIL (`isHomeworkMode` not a valid prop / no HOMEWORK SESSION text).

- [ ] **Step 3: Extend `buildSystemPrompt`**

In `src/lib/ai/prompts.ts`, replace the `SystemPromptContext` interface and the `buildSystemPrompt` body:

```ts
export interface SystemPromptContext {
  courseName?: string;
  hasDocumentContent: boolean;
  isHomeworkMode?: boolean;
  exerciseName?: string;
  pinnedMaterialNames?: string[];
}

export function buildSystemPrompt(context: SystemPromptContext): string {
  const {
    courseName,
    hasDocumentContent,
    isHomeworkMode,
    exerciseName,
    pinnedMaterialNames,
  } = context;
  const courseContext = courseName
    ? `You are a tutor for **${courseName}**.`
    : 'You are a course tutor.';
  const documentContext = hasDocumentContent
    ? `\n\n## STUDENT'S DOCUMENT\nThe student has shared their current document with you. When they ask about their own writing (e.g., "is my solution correct?"), refer to its content specifically.`
    : '';

  let homeworkContext = '';
  if (isHomeworkMode) {
    const pinned =
      pinnedMaterialNames && pinnedMaterialNames.length > 0
        ? ` They marked these materials as most relevant: ${pinnedMaterialNames.join(', ')}.`
        : '';
    homeworkContext = `\n\n## HOMEWORK SESSION
The student is working on the exercise "${exerciseName ?? 'their homework'}".${pinned}
- Ground your answers in the exercise and any pinned materials **first** — that is what the student's questions refer to.
- You are **not restricted** to them: freely use the student's other course materials and your own knowledge when helpful.
- **Tutor** the student — explain, guide, and give hints toward understanding rather than just handing over the full solution.`;
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
${documentContext}${homeworkContext}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test -- prompts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompts.ts src/lib/ai/__tests__/prompts.test.ts
git commit -m "feat(homework): add homework mode to buildSystemPrompt"
```

---

### Task 4: `resolveHomeworkContext` resolver + unit tests

**Files:**

- Create: `src/lib/ai/homework-context.ts`
- Test: `src/lib/ai/__tests__/homework-context.test.ts`

- [ ] **Step 1: Write the resolver module**

Create `src/lib/ai/homework-context.ts`:

```ts
// ---------------------------------------------------------------------------
// Homework AI context resolver
//
// Pure (client-injected) builder of the "prioritized" tiers for a homework
// chat: the exercise text (Tier 1) and pinned-material texts (Tier 2). It does
// NOT touch auth — callers pass a user-scoped client (`supabase`) for the
// user's own content and an admin client (`admin`) for the shared Moodle
// registry. This keeps it unit-testable (mock clients) AND integration-testable
// (pass a real service-role client) — server actions that call auth cannot be
// tested in Vitest.
//
// Reuses extractDocumentText (ProseMirror JSON) and the PDF/DOCX extractors.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

import { extractDocxText } from '@/lib/ai/extraction/docx';
import { extractPdfText } from '@/lib/ai/extraction/pdf';
import { extractDocumentText } from '@/lib/ai/extract-document-text';
import type { HomeworkMaterialType } from '@/types/database';

/** Per-source verbatim cap (chars). Mirrors the doc-content limit style. */
export const MAX_HOMEWORK_SOURCE_CHARS = 15_000;
/** Max number of pinned materials injected verbatim (rest fall back to RAG). */
export const MAX_PINNED_MATERIALS = 5;
/** Total Tier-1 + Tier-2 budget; beyond it, text is dropped (RAG still covers it). */
export const MAX_HOMEWORK_TOTAL_CHARS = 60_000;

export interface HomeworkAiContext {
  exerciseName: string;
  exerciseText: string;
  pinned: Array<{ name: string; text: string }>;
  /** All pinned names (even those whose text was dropped) — for the system prompt. */
  pinnedNames: string[];
}

function cap(text: string, max: number): string {
  if (max <= 0) return '';
  return text.length > max ? text.slice(0, max) + '\n\n[...truncated]' : text;
}

function extractFileText(buffer: Buffer, mimeType: string): Promise<string> {
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('presentationml') ||
    mimeType.includes('powerpoint')
  ) {
    return extractPdfText(buffer);
  }
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  ) {
    return extractDocxText(buffer);
  }
  return Promise.resolve('');
}

/** Resolve one pinned material to { name, text }. Never throws — degrades to ''. */
async function resolvePinnedMaterial(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  type: HomeworkMaterialType,
  id: string,
): Promise<{ name: string; text: string } | null> {
  try {
    if (type === 'document') {
      const { data } = await supabase
        .from('documents')
        .select('title, content, pages')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        name: data.title ?? 'Document',
        text: extractDocumentText(data),
      };
    }

    // File-backed types: { table, client, bucket, nameCol }
    const cfg =
      type === 'course_material'
        ? {
            table: 'course_materials',
            client: supabase,
            bucket: 'course-materials',
            nameCol: 'file_name',
          }
        : type === 'personal_file'
          ? {
              table: 'personal_files',
              client: supabase,
              bucket: 'personal-files',
              nameCol: 'display_name',
            }
          : type === 'moodle_file'
            ? {
                table: 'moodle_files',
                client: admin,
                bucket: 'moodle-materials',
                nameCol: 'file_name',
              }
            : null;
    if (!cfg) return null;

    const { data: row } = await cfg.client
      .from(cfg.table)
      .select(`${cfg.nameCol}, storage_path, mime_type`)
      .eq('id', id)
      .maybeSingle();
    if (!row) return null;

    const name = (row as Record<string, string>)[cfg.nameCol] ?? 'Material';
    const storagePath = (row as { storage_path: string | null }).storage_path;
    const mimeType =
      (row as { mime_type: string | null }).mime_type ??
      'application/octet-stream';
    if (!storagePath) return { name, text: '' };

    const { data: file, error } = await cfg.client.storage
      .from(cfg.bucket)
      .download(storagePath);
    if (error || !file) return { name, text: '' };

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractFileText(buffer, mimeType);
    return { name, text };
  } catch {
    // Any failure (missing storage object, parse error) degrades to no text;
    // the material is still reachable via Tier-3 RAG.
    return { name: 'Material', text: '' };
  }
}

/**
 * Build the homework context for `documentId`, or null if it is not a homework
 * document. Applies per-source cap, max-pinned-count, and a total budget;
 * names are always returned even when a source's text is dropped.
 */
export async function resolveHomeworkContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  documentId: string,
): Promise<HomeworkAiContext | null> {
  const { data: session } = await supabase
    .from('homework_sessions')
    .select('id, exercise_document_id')
    .eq('document_id', documentId)
    .maybeSingle();
  if (!session) return null;

  // Tier 1 — exercise (today always a document)
  let exerciseName = 'Exercise';
  let exerciseText = '';
  if (session.exercise_document_id) {
    const { data: ex } = await supabase
      .from('documents')
      .select('title, content, pages')
      .eq('id', session.exercise_document_id)
      .maybeSingle();
    if (ex) {
      exerciseName = ex.title ?? 'Exercise';
      exerciseText = cap(extractDocumentText(ex), MAX_HOMEWORK_SOURCE_CHARS);
    }
  }

  // Tier 2 — pinned materials
  const { data: mats } = await supabase
    .from('homework_session_materials')
    .select('material_type, material_id')
    .eq('session_id', session.id);

  const pinned: Array<{ name: string; text: string }> = [];
  const pinnedNames: string[] = [];
  let budget = MAX_HOMEWORK_TOTAL_CHARS - exerciseText.length;

  for (const m of (mats ?? []).slice(0, MAX_PINNED_MATERIALS)) {
    const resolved = await resolvePinnedMaterial(
      supabase,
      admin,
      m.material_type as HomeworkMaterialType,
      m.material_id as string,
    );
    if (!resolved) continue;
    pinnedNames.push(resolved.name);
    const text = cap(
      resolved.text,
      Math.min(MAX_HOMEWORK_SOURCE_CHARS, budget),
    );
    budget -= text.length;
    pinned.push({ name: resolved.name, text });
  }

  return { exerciseName, exerciseText, pinned, pinnedNames };
}
```

- [ ] **Step 2: Write the failing unit tests**

Create `src/lib/ai/__tests__/homework-context.test.ts`. Model the mock-client shape on `src/lib/actions/__tests__/ai-context.test.ts`. Mock the extractors so no real PDF parsing runs:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfText: vi.fn(async () => 'PDF_TEXT'),
}));
vi.mock('@/lib/ai/extraction/docx', () => ({
  extractDocxText: vi.fn(async () => 'DOCX_TEXT'),
}));

import {
  resolveHomeworkContext,
  MAX_PINNED_MATERIALS,
} from '@/lib/ai/homework-context';

// Minimal chainable mock: each .from(table) returns a thenable query whose
// terminal .maybeSingle() resolves to the configured row, plus a storage stub.
function makeClient(opts: {
  rows: Record<string, unknown>; // keyed by table name -> single row
  lists?: Record<string, unknown[]>; // keyed by table name -> array (for .eq without maybeSingle)
  download?: () => {
    data: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
    error: unknown;
  };
}) {
  const client = {
    from(table: string) {
      const builder = {
        _table: table,
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle: async () => ({ data: opts.rows[table] ?? null }),
        then: undefined as unknown,
      };
      // Make `await builder` (no maybeSingle) resolve to a list result
      (builder as unknown as { then: (r: (v: unknown) => void) => void }).then =
        (resolve) => resolve({ data: opts.lists?.[table] ?? [] });
      return builder;
    },
    storage: {
      from() {
        return {
          download: async () =>
            opts.download
              ? opts.download()
              : {
                  data: { arrayBuffer: async () => new ArrayBuffer(8) },
                  error: null,
                },
        };
      },
    },
  };
  return client as unknown as Parameters<typeof resolveHomeworkContext>[0];
}

describe('resolveHomeworkContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the document has no homework session', async () => {
    const c = makeClient({ rows: { homework_sessions: null } });
    expect(await resolveHomeworkContext(c, c, 'doc-x')).toBeNull();
  });

  it('extracts exercise document text (Tier 1)', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: 'ex1' },
        documents: {
          title: 'PS1',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Hello exercise' }],
              },
            ],
          },
        },
      },
      lists: { homework_session_materials: [] },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.exerciseName).toBe('PS1');
    expect(ctx?.exerciseText).toContain('Hello exercise');
    expect(ctx?.pinned).toEqual([]);
  });

  it('extracts a pinned course_material via download + pdf extractor', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        course_materials: {
          file_name: 'Lecture 1',
          storage_path: 'p/x.pdf',
          mime_type: 'application/pdf',
        },
      },
      lists: {
        homework_session_materials: [
          { material_type: 'course_material', material_id: 'm1' },
        ],
      },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinnedNames).toEqual(['Lecture 1']);
    expect(ctx?.pinned[0].text).toBe('PDF_TEXT');
  });

  it('degrades to empty text (keeps name) when download fails', async () => {
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        personal_files: {
          display_name: 'My Notes',
          storage_path: 'p/y.pdf',
          mime_type: 'application/pdf',
        },
      },
      lists: {
        homework_session_materials: [
          { material_type: 'personal_file', material_id: 'm2' },
        ],
      },
      download: () => ({ data: null, error: new Error('not found') }),
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinnedNames).toEqual(['My Notes']);
    expect(ctx?.pinned[0].text).toBe('');
  });

  it('caps the number of pinned materials at MAX_PINNED_MATERIALS', async () => {
    const many = Array.from({ length: MAX_PINNED_MATERIALS + 3 }, (_, i) => ({
      material_type: 'document',
      material_id: `d${i}`,
    }));
    const c = makeClient({
      rows: {
        homework_sessions: { id: 's1', exercise_document_id: null },
        documents: { title: 'Doc', content: { type: 'doc', content: [] } },
      },
      lists: { homework_session_materials: many },
    });
    const ctx = await resolveHomeworkContext(c, c, 'hw1');
    expect(ctx?.pinned.length).toBe(MAX_PINNED_MATERIALS);
  });
});
```

> If the chainable mock proves brittle, the implementer may instead build per-table `vi.fn()` mocks following `ai-context.test.ts` exactly — the assertions above are the contract, not the mock mechanism.

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- homework-context`
Expected: PASS (all 5).

- [ ] **Step 4: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/homework-context.ts src/lib/ai/__tests__/homework-context.test.ts
git commit -m "feat(homework): add resolveHomeworkContext tiered text resolver"
```

---

### Task 5: Integration test — real seeded exercise text + graceful pinned failure

**Files:**

- Create: `src/lib/ai/homework-context.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `src/lib/ai/homework-context.integration.test.ts`. It calls the resolver with a real service-role client (bypasses RLS — we test extraction, not RLS, which is proven elsewhere):

```ts
import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/test/supabase-client';
import { resolveHomeworkContext } from '@/lib/ai/homework-context';

const HW_DOC_ID = '20000000-0000-0000-0000-000000000011';

describe('resolveHomeworkContext (integration, seeded data)', () => {
  it('returns null for a non-homework document', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(
      admin,
      admin,
      'ffffffff-0000-0000-0000-000000000000',
    );
    expect(ctx).toBeNull();
  });

  it('extracts the seeded exercise document text (Tier 1)', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(admin, admin, HW_DOC_ID);
    expect(ctx).not.toBeNull();
    expect(ctx!.exerciseName).toMatch(/Problem Set 1/);
    // From the seeded exercise document content:
    expect(ctx!.exerciseText).toContain('mutable and immutable');
    expect(ctx!.exerciseText).toContain('x = [1, 2, 3]'); // codeBlock preserved
  });

  it('keeps the pinned material name even though its storage object is not seeded', async () => {
    const admin = createAdminClient();
    const ctx = await resolveHomeworkContext(admin, admin, HW_DOC_ID);
    // seeded pin: course_material 50000000-...001 = "lecture-1-slides.pdf"
    expect(ctx!.pinnedNames).toContain('lecture-1-slides.pdf');
    // No storage object is seeded, so text degrades to '' (graceful).
    const pinned = ctx!.pinned.find((p) => p.name === 'lecture-1-slides.pdf');
    expect(pinned?.text).toBe('');
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:integration -- homework-context.integration`
Expected: PASS (3 tests). If the local DB lacks seed data, run `pnpm supabase db reset` first (see project memory "running-tests-locally").

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/homework-context.integration.test.ts
git commit -m "test(homework): integration test resolver against seeded exercise"
```

---

### Task 6: Inject homework tiers in `buildAiContext`

**Files:**

- Modify: `src/lib/actions/ai-context.ts:552-778`
- Test: `src/lib/actions/__tests__/ai-context.test.ts`

- [ ] **Step 1: Write the failing unit test**

Append to `src/lib/actions/__tests__/ai-context.test.ts` a test that mocks `resolveHomeworkContext` and asserts `buildAiContext` injects the exercise and flags usage. Add the mock near the other mocks at the top of the file:

```ts
vi.mock('@/lib/ai/homework-context', () => ({
  resolveHomeworkContext: vi.fn(async () => null),
  MAX_HOMEWORK_SOURCE_CHARS: 15000,
  MAX_PINNED_MATERIALS: 5,
  MAX_HOMEWORK_TOTAL_CHARS: 60000,
}));
```

Then add a test (adjust imports to match the file's existing style — it already mocks embeddings/search and Supabase):

```ts
import { resolveHomeworkContext } from '@/lib/ai/homework-context';
// NOTE: this file ALREADY mocks '@/lib/ai/prompts' (buildSystemPrompt returns a
// fixed string), so we must NOT assert on systemPrompt content here — that is
// Task 3's job. Instead assert that buildAiContext asked buildSystemPrompt for
// homework mode (call args) and that the homework text landed in `contents`.
import { buildSystemPrompt } from '@/lib/ai/prompts';

describe('buildAiContext — homework injection', () => {
  it('injects the exercise + pins and flags homeworkContextUsed when documentId is a homework doc', async () => {
    vi.mocked(resolveHomeworkContext).mockResolvedValueOnce({
      exerciseName: 'Problem Set 1',
      exerciseText: 'EXERCISE BODY TEXT',
      pinned: [{ name: 'Lecture 1', text: 'PINNED BODY TEXT' }],
      pinnedNames: ['Lecture 1'],
    });

    const { contents, homeworkContextUsed } = await buildAiContext({
      question: 'what is q1?',
      courseId: undefined, // skip RAG to isolate homework injection
      documentId: 'hw-doc-1',
      mode: 'quick',
    });

    expect(homeworkContextUsed).toBe(true);
    // buildSystemPrompt is mocked in this file — assert the call args, not the
    // returned string.
    expect(vi.mocked(buildSystemPrompt)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isHomeworkMode: true,
        exerciseName: 'Problem Set 1',
        pinnedMaterialNames: ['Lecture 1'],
      }),
    );
    const flat = JSON.stringify(contents);
    expect(flat).toContain('EXERCISE BODY TEXT');
    expect(flat).toContain('PINNED BODY TEXT');
  });

  it('does not inject homework context for a non-homework document', async () => {
    vi.mocked(resolveHomeworkContext).mockResolvedValueOnce(null);
    const { homeworkContextUsed } = await buildAiContext({
      question: 'hi',
      documentId: 'normal-doc',
      mode: 'quick',
    });
    expect(homeworkContextUsed).toBe(false);
    expect(vi.mocked(buildSystemPrompt)).toHaveBeenLastCalledWith(
      expect.objectContaining({ isHomeworkMode: false }),
    );
  });
});
```

> The existing `ai-context.test.ts` (verified) mocks `@/lib/ai/prompts` (so `buildSystemPrompt` returns a fixed string — hence the call-args assertions above), and mocks `getAuthUserId`/`createClient`/`createAdminClient`/`searchContext`. Reuse that scaffolding. Ensure the file's `beforeEach` clears mocks (or the `toHaveBeenLastCalledWith` assertions stay correct because we check the LAST call). Do NOT remove the `@/lib/ai/prompts` mock — homework prompt-string behavior is covered by Task 3.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- ai-context`
Expected: FAIL (`homeworkContextUsed` undefined; no HOMEWORK SESSION; exercise text absent).

- [ ] **Step 3: Implement the injection in `buildAiContext`**

In `src/lib/actions/ai-context.ts`:

(a) Add the import near the top:

```ts
import { resolveHomeworkContext } from '@/lib/ai/homework-context';
```

(b) Update the return type to include the flag:

```ts
export async function buildAiContext(params: QuestionParams): Promise<{
  systemPrompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contents: Array<{ role: string; parts: any[] }>;
  modelName: string;
  sources: QuestionResult['sources'];
  homeworkContextUsed: boolean;
}> {
```

(c) Right after `const supabase = await createClient();` and the destructure, create the admin client once and resolve homework BEFORE building the system prompt (move the `buildSystemPrompt` call down):

```ts
const admin = createAdminClient();

// Homework context (Tiers 1–2): resolved server-side from the open document,
// never trusting any client-supplied material list. null for normal docs.
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
```

Delete the now-duplicate `const admin = createAdminClient();` that currently sits in the signed-URL block (around line 621) — reuse the one created above.

(d) After the `if (hasDocumentContent) { ... }` block (the student's-document turn), insert the homework tiers BEFORE the `if (contextTexts.length > 0)` RAG block:

```ts
// Tier 1 — exercise (always injected when present)
if (homework?.exerciseText) {
  contents.push({
    role: 'user',
    parts: [
      {
        text: `Here is the EXERCISE the student is working on — "${homework.exerciseName}":\n\n${homework.exerciseText}\n\nThe student's questions refer to this.`,
      },
    ],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'I understand the exercise the student is working on.' }],
  });
}

// Tier 2 — pinned materials (always injected when present)
const pinnedWithText = homework?.pinned.filter((p) => p.text) ?? [];
if (pinnedWithText.length > 0) {
  const pinnedText = pinnedWithText
    .map((p) => `--- ${p.name} ---\n${p.text}`)
    .join('\n\n');
  contents.push({
    role: 'user',
    parts: [
      {
        text: `These are the materials the student marked as most relevant:\n\n${pinnedText}\n\nPrioritize them, but you may also use other course materials.`,
      },
    ],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'I have reviewed the pinned materials.' }],
  });
}
```

(e) Treat homework as injected context for the final question-merge logic. Add, just before the `const questionParts` block:

```ts
const hasInjectedContext =
  hasDocumentContent ||
  contextTexts.length > 0 ||
  !!homework?.exerciseText ||
  pinnedWithText.length > 0;
```

Then change the two conditionals that currently read `contextTexts.length === 0 && !hasDocumentContent`:

- the no-context note → `} else if (!hasInjectedContext) {`
- the new-user-turn decision → `if (params.imageData || !hasInjectedContext) {`

(f) Update the return statement:

```ts
return {
  systemPrompt,
  contents,
  modelName,
  sources,
  homeworkContextUsed: !!homework,
};
```

- [ ] **Step 4: Run unit tests**

Run: `pnpm test -- ai-context`
Expected: PASS (new homework tests + all pre-existing tests still green).

- [ ] **Step 5: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(homework): inject exercise + pinned tiers in buildAiContext"
```

---

### Task 7: Forward `homeworkContextUsed` in the ask route

**Files:**

- Modify: `src/app/api/ai/ask/route.ts:311-313` and the `sources` SSE enqueue (`:334-338`)

- [ ] **Step 1: Destructure the new flag**

Change the `buildAiContext` call:

```ts
const { systemPrompt, contents, modelName, sources, homeworkContextUsed } =
  await buildAiContext(params);
```

- [ ] **Step 2: Include it in the `sources` SSE event (both the real stream and the debug-mode stream)**

In the real stream's first enqueue:

```ts
controller.enqueue(
  encoder.encode(
    `data: ${JSON.stringify({ type: 'sources', sources, model: modelLabel, homeworkContextUsed })}\n\n`,
  ),
);
```

In the debug-mode stream's `sources` enqueue (around line 264), add `homeworkContextUsed: false` so the shape is stable:

```ts
              `data: ${JSON.stringify({ type: 'sources', sources: [], model: mode === 'deep' ? 'pro' : 'flash', homeworkContextUsed: false })}\n\n`,
```

- [ ] **Step 3: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai/ask/route.ts
git commit -m "feat(homework): surface homeworkContextUsed in ask SSE stream"
```

---

### Task 8: Analytics event `homework_context_used`

**Files:**

- Modify: `src/lib/analytics/events.ts:8-43`

- [ ] **Step 1: Add the event to the map**

Inside `AnalyticsEventMap`, add (no PII — counts + course UUID only):

```ts
homework_context_used: {
  course_id: string | undefined;
  pinned_count: number;
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/events.ts
git commit -m "feat(analytics): add homework_context_used event"
```

---

### Task 9: Thread `documentId` through the chat chain + fire analytics

**Files:**

- Modify: `src/components/ai/ai-chat-panel.tsx` (props `:55-75`, POST body `:306-320`, sources handler `:372-379`)
- Modify: `src/components/ai/ai-chat-wrapper.tsx:10-67`
- Modify: `src/components/ai/document-with-ai.tsx:99-109`
- Modify: `src/components/editor/tiptap-editor-with-versions.tsx:55`

- [ ] **Step 1: `AiChatPanel` — accept `documentId`, send it, fire the event**

In `AiChatPanelProps` add `documentId?: string;` and destructure it in the component signature.

In the `/api/ai/ask` POST body (handleSend), add `documentId`:

```ts
        body: JSON.stringify({
          question: fullQuestion,
          courseId,
          documentId,
          mode,
          courseName,
          documentContent,
          conversationId: currentConversationId || undefined,
          ...(imageData ? { imageData } : {}),
        }),
```

In the SSE handler, where `event.type === 'sources'` is handled, fire the analytics event when the server reports homework injection:

```ts
            if (event.type === 'sources') {
              sources = event.sources ?? [];
              model = event.model ?? 'flash';
              if (event.homeworkContextUsed) {
                trackEvent('homework_context_used', {
                  course_id: courseId,
                  pinned_count: (event.sources ?? []).length,
                });
              }
            } else if (event.type === 'conversation') {
```

> `trackEvent` is already imported in this file. `pinned_count` here is a coarse proxy (server doesn't currently send the exact pinned count); using `sources.length` keeps it dependency-free. If you prefer exactness, have the route also send `pinnedCount` in the `sources` event and read it here — optional, not required.

- [ ] **Step 2: `AiChatWrapper` — thread `documentId`**

Add `documentId?: string;` to `AiChatWrapperProps`, destructure it, and pass `documentId={documentId}` to `<AiChatPanel ... />`.

- [ ] **Step 3: `DocumentWithAi` — pass the document id**

In the `<AiChatWrapper ... />` usage, add `documentId={document.id}`.

- [ ] **Step 4: `TiptapEditorWithVersions` — pass the document id**

Change the wrapper usage:

```ts
      <AiChatWrapper
        courseId={courseId}
        courseName={courseName}
        documentId={document.id}
      />
```

- [ ] **Step 5: Verify compile + existing component tests**

Run: `pnpm exec tsc --noEmit && pnpm test -- ai-chat`
Expected: PASS (no ai-chat-panel unit test asserts the absence of `documentId`; if a test snapshots the POST body, update it to include `documentId`).

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/ai-chat-panel.tsx src/components/ai/ai-chat-wrapper.tsx src/components/ai/document-with-ai.tsx src/components/editor/tiptap-editor-with-versions.tsx
git commit -m "feat(homework): thread documentId to chat + fire homework_context_used"
```

---

### Task 10: Homework context chip on the document page

**Files:**

- Create: `src/components/dashboard/homework-context-chip.tsx`
- Create: `src/components/dashboard/__tests__/homework-context-chip.test.tsx`
- Modify: `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`

- [ ] **Step 1: Write the failing chip unit test**

Create `src/components/dashboard/__tests__/homework-context-chip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeworkContextChip } from '@/components/dashboard/homework-context-chip';
import type { HomeworkContext } from '@/types/database';

const ctx: HomeworkContext = {
  session: {
    id: 's1',
    document_id: 'd1',
    exercise_document_id: 'ex1',
    exercise_type: null,
    exercise_id: null,
    course_id: 'c1',
    user_id: 'u1',
    created_at: '2026-01-01',
  },
  exerciseDocument: { id: 'ex1', title: 'Problem Set 1' },
  materials: [
    { type: 'course_material', id: 'm1', name: 'Lecture 1' },
    { type: 'moodle_file', id: 'm2', name: 'syllabus.pdf' },
  ],
};

describe('HomeworkContextChip', () => {
  it('renders the exercise title and pinned material names', () => {
    render(<HomeworkContextChip context={ctx} />);
    expect(screen.getByText(/Problem Set 1/)).toBeInTheDocument();
    expect(screen.getByText(/Lecture 1/)).toBeInTheDocument();
    expect(screen.getByText(/syllabus\.pdf/)).toBeInTheDocument();
  });

  it('renders without materials gracefully', () => {
    render(<HomeworkContextChip context={{ ...ctx, materials: [] }} />);
    expect(screen.getByText(/Problem Set 1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- homework-context-chip`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the chip**

Create `src/components/dashboard/homework-context-chip.tsx` (server component — purely presentational, no interactivity):

```tsx
import { BookOpen, Paperclip } from 'lucide-react';
import type { HomeworkContext } from '@/types/database';

/**
 * A compact, read-only strip shown at the top of a homework document so the
 * student can see exactly what the AI is focused on. This is what finally
 * consumes getHomeworkContext() (built in Phase 1, never displayed until now).
 */
export function HomeworkContextChip({ context }: { context: HomeworkContext }) {
  return (
    <div
      data-testid="homework-context"
      className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-primary">
        <BookOpen className="size-3.5" />
        Homework: {context.exerciseDocument.title}
      </span>
      {context.materials.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <Paperclip className="size-3" />
          {context.materials.map((m) => (
            <span
              key={`${m.type}:${m.id}`}
              className="rounded-full bg-background px-2 py-0.5"
            >
              {m.name}
            </span>
          ))}
        </span>
      )}
      <span className="ml-auto text-muted-foreground/70">
        The AI prioritizes these but still sees all your materials.
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the chip test**

Run: `pnpm test -- homework-context-chip`
Expected: PASS.

- [ ] **Step 5: Render the chip in the document page**

In `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`:

Add imports:

```ts
import { getHomeworkContext } from '@/lib/actions/homework';
import { HomeworkContextChip } from '@/components/dashboard/homework-context-chip';
import type { HomeworkContext } from '@/types/database';
```

After resolving `course` (parallelize the homework lookup with the course fetch is fine, but a simple sequential call is acceptable), add:

```ts
const homeworkContext: HomeworkContext | null = await getHomeworkContext({
  documentId: docId,
});
```

Then render the chip just after the breadcrumb block and before the `isTextDocument ? ... : ...` ternary:

```tsx
{
  homeworkContext && <HomeworkContextChip context={homeworkContext} />;
}
```

- [ ] **Step 6: Verify compile + tests**

Run: `pnpm exec tsc --noEmit && pnpm test -- homework-context-chip`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/homework-context-chip.tsx src/components/dashboard/__tests__/homework-context-chip.test.tsx "src/app/(dashboard)/dashboard/documents/[docId]/page.tsx"
git commit -m "feat(homework): show homework context chip in document page"
```

---

### Task 11: Moodle files as a pinnable type in the Start Homework dialog

**Files:**

- Modify: `src/components/dashboard/start-homework-dialog.tsx`

- [ ] **Step 1: Lazy-fetch Moodle files when the dialog opens**

Add imports:

```ts
import { useEffect } from 'react';
import {
  getMoodleMaterialsForCourse,
  type MoodleSectionDto,
} from '@/lib/actions/moodle-materials';
```

(Adjust the existing `import { useState } from 'react';` to `import { useState, useEffect } from 'react';`.)

Add state and an effect that loads when `open` becomes true (only once):

```ts
const [moodleSections, setMoodleSections] = useState<MoodleSectionDto[]>([]);
const [moodleLoaded, setMoodleLoaded] = useState(false);

useEffect(() => {
  if (!open || moodleLoaded) return;
  setMoodleLoaded(true);
  getMoodleMaterialsForCourse(courseId)
    .then(setMoodleSections)
    .catch(() => setMoodleSections([]));
}, [open, moodleLoaded, courseId]);
```

- [ ] **Step 2: Render a Moodle group in the materials picker**

Inside the materials picker `<div className="max-h-48 ...">`, after the "Personal files" group, add:

```tsx
{
  /* Moodle files (lazy-loaded) */
}
{
  moodleSections.some((s) => s.files.length > 0) && (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Moodle Files
      </p>
      {moodleSections.flatMap((s) =>
        s.files.map((f) => {
          const key = `moodle_file:${f.id}`;
          return (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selectedMaterials.has(key)}
                onChange={() => toggleMaterial(key)}
                className="accent-primary"
              />
              <span className="truncate">{f.file_name}</span>
            </label>
          );
        }),
      )}
    </div>
  );
}
```

> `parseMaterialKey` already splits `type:id`, and `createHomeworkSession`'s `materialRefs` type is `HomeworkMaterialType` (now includes `moodle_file`), and the DB CHECK already allows `moodle_file` — so no other change is needed for submission.

- [ ] **Step 3: Verify compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/start-homework-dialog.tsx
git commit -m "feat(homework): allow pinning Moodle files in Start Homework dialog"
```

---

### Task 12: E2E — real homework + AI flow

**Files:**

- Create: `e2e/homework-ai-context.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Register the scenario in `e2e/TEST_REGISTRY.md`**

Add a section (match the file's existing format) describing:

- Feature: "Homework-focused AI context (Phase 2)".
- Scenarios: (1) Start Homework from a course → land on homework doc → homework context chip shows the exercise + a pinned material; (2) inside the homework doc, open AI Tutor and send a question → a response renders.

- [ ] **Step 2: Write the E2E spec (no `test.skip` — CLAUDE.md)**

Create `e2e/homework-ai-context.spec.ts`. Use the shared login helper; the seeded course has the exercise document already, so Start Homework can pick it:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const COURSE_URL = '/dashboard/courses/30000000-0000-0000-0000-000000000001';

test.describe('Homework-focused AI context', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(COURSE_URL);
    await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 10_000 });
  });

  test('start homework, see context chip, ask the AI', async ({ page }) => {
    test.setTimeout(90_000);

    // Open the Start Homework dialog
    await page.getByRole('button', { name: /start homework/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Pick the seeded exercise document
    await page
      .getByRole('dialog')
      .getByText('Problem Set 1: Variables', { exact: false })
      .first()
      .click();

    // Pin a material if any are offered (best-effort — the flow must work with 0 pins too)
    const firstMaterialCheckbox = page
      .getByRole('dialog')
      .locator('input[type="checkbox"]')
      .first();
    if (await firstMaterialCheckbox.count()) {
      await firstMaterialCheckbox.check().catch(() => {});
    }

    // Start → navigates to the new homework document
    await page.getByRole('button', { name: /^start$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/documents\//, {
      timeout: 15_000,
    });

    // The homework context chip consumes getHomeworkContext
    const chip = page.getByTestId('homework-context');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Problem Set 1');

    // Open the AI tutor (floating bubble has aria-label "Open AI chat")
    await page
      .getByRole('button', { name: /open ai chat/i })
      .first()
      .click();
    await expect(page.getByText('AI Tutor')).toBeVisible({ timeout: 5_000 });

    const input = page.locator(
      'input[placeholder*="about your course materials"]',
    );
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill('What is question 1 of this exercise asking?');
    await page.keyboard.press('Enter');

    // A response bubble appears (real Gemini; generous timeout)
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({
      timeout: 60_000,
    });
  });
});
```

> The AI-response assertion depends on `GOOGLE_GENERATIVE_AI_API_KEY` (present in CI). The deterministic value of this test is the **chip** (proves homework context is built and displayed) and reaching the chat from a homework doc. The "AI Assistant" label renders as soon as an assistant turn starts.

- [ ] **Step 3: Run the E2E (local Supabase must be running + seeded)**

Run: `pnpm test:e2e -- homework-ai-context`
Expected: PASS. If the chip selector or the Start Homework button label differs, fix the selector (do not weaken the assertion). If Start Homework offers no exercise, the seed is missing — run `pnpm supabase db reset`.

- [ ] **Step 4: Commit**

```bash
git add e2e/homework-ai-context.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(homework): e2e for homework context chip + AI flow"
```

---

### Task 13: Full suite, lint, build, finalize

**Files:** none (verification only)

- [ ] **Step 1: Revert any lockfile drift**

```bash
git checkout -- pnpm-lock.yaml 2>/dev/null || true
git status
```

Expected: clean working tree (all task commits in), `pnpm-lock.yaml` unchanged.

- [ ] **Step 2: Type check + lint + format**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec prettier --check .`
Expected: 0 errors.

- [ ] **Step 3: Unit + integration**

Run: `pnpm test && pnpm test:integration`
Expected: all green (Phase 1 baseline + new homework tests). Investigate any false-green: grep new test files for stale assertions and confirm new tests fail when the feature is reverted (spot-check the resolver test by temporarily breaking `resolveHomeworkContext` — then restore).

- [ ] **Step 4: Build + E2E**

Run: `pnpm build && pnpm test:e2e`
Expected: build succeeds; E2E green (Phase 1 flat-course specs + new homework spec).

- [ ] **Step 5: Final holistic review**

Dispatch a final code reviewer over the whole Phase 2 diff (`git diff dev...HEAD`) against this plan and spec §4.4–§4.5. Confirm: no `documentId`-absent regression, server-side-only material resolution (no client-trusted lists), graceful degradation present, no PII in the new analytics event, budgets enforced.

- [ ] **Step 6: Finish the branch**

Use superpowers:finishing-a-development-branch. Phase 1 + Phase 2 ship together as one PR to `dev` (protected, PR-only): push the branch and open a PR titled "Homework-focused AI context + flat course model (Phases 1–2)" whose body links the spec and both plans. CI (lint/format/unit/integration/build/E2E) must pass before merge.

---

## Self-review (completed by plan author)

- **Spec coverage (§4.4–§4.5, §6, §9):** exercise injection (T6 Tier 1), pinned injection (T6 Tier 2), prioritize-don't-restrict prompt (T3), `documentId`/homework plumbing (T9), server-side session resolve (T4/T6, never trusts client), token budget (T4 caps/total), `extractDocumentText` reuse (T4 — already exists, not recreated), `getHomeworkContext` `moodle_file` extension (T2), homework-context chip (T10), Moodle-pinnable dialog (T11, per user's "all your materials" answer), `homework_context_used` analytics (T8/T9). Tests at all three levels (T3/T4/T5/T6/T10 unit+integration, T12 E2E). **Embed-on-pin (§4.4) intentionally dropped:** Phase 1 already embeds every import on upload, so there is no unembedded-material path to cover — YAGNI.
- **Placeholder scan:** none — every code step has full code; selectors/IDs are concrete seeded values.
- **Type consistency:** `HomeworkAiContext` shape is identical across T4 (definition), T6 (consumption), and the unit-test mock; `resolveHomeworkContext(supabase, admin, documentId)` signature matches its call site in T6; `buildSystemPrompt` `SystemPromptContext` fields (T3) match the call in T6; `homeworkContextUsed` flows T6 → T7 → T9 with the same name; `HomeworkMaterialType` gains `moodle_file` (T1) before it's used in T2/T4/T11.
- **Ordering:** types (T1) → name resolution (T2) → prompt (T3) → resolver (T4/T5) → injection (T6) → route (T7) → analytics (T8) → plumbing (T9) → chip (T10) → dialog (T11) → E2E (T12) → gate (T13). Each task compiles and tests on its own.
