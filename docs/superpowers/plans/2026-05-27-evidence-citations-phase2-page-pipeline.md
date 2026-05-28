# Evidence Citations — Phase 2: Page-Accurate Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce real page numbers for every PDF/slide chunk so the AI's citations jump to the exact page, by switching to per-page extraction, small math-aware page-tagged chunks, multi-chunk-per-file retrieval, and indexing course materials (a dead branch today) — plus a backfill driver.

**Architecture:** Extraction returns structured per-page text (`extractPdfPages`); a math-aware chunker (`chunkPages`/`chunkFlatText`) packs pages into ~1600-char chunks tagged with **0-indexed** page ranges; `indexContent` stores those pages (trusting Gemini's reported 1-based page numbers — it sees the real PDF) and now runs for `course_material` too; `buildAiContext` keeps several chunks per file and emits one citation per `(source, page)` with de-duplicated signed URLs. The viewer/citation UI is unchanged — it already jumps to `initialPage`.

**Tech Stack:** TypeScript, Next.js 16, `@google/genai` (structured output via `responseSchema`), Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-27-evidence-citations-design.md` (§4.1–§4.6, §6, §8–§11).

**Depends on:** Phase 1 plan (prompt forward-references the page in the material header, which this phase starts emitting).

---

## File structure

- `src/lib/ai/extraction/pdf.ts` — MODIFY: add `PageText` + `extractPdfPages`; keep `extractPdfText` as a wrapper.
- `src/lib/ai/embeddings.ts` — MODIFY: add `PageChunk`, `chunkPages`, `chunkFlatText`, math-aware split helpers, constants.
- `src/lib/actions/ai-context.ts` — MODIFY: `indexContent` (pages + guard + course_material), `buildAiContext` (multi-chunk + per-(source,page) citations + signed-URL dedupe), add `reindexAllContent`; DELETE dead `askQuestion`.
- `src/lib/actions/course-materials.ts` — MODIFY: `createCourseMaterial` awaits `indexContent`.
- `src/app/api/moodle/{upload,upload-finalize,import-existing}/route.ts` — MODIFY: await `indexContent` (was fire-and-forget — dropped on serverless freeze).
- `src/lib/actions/personal-files.ts` — MODIFY: `addPersonalFile` awaits `indexContent` (was `void`).
- `src/app/api/ai/reindex/route.ts` — MODIFY: call `reindexAllContent` instead of blanket delete.
- Tests: `src/lib/ai/extraction/__tests__/pdf.test.ts` (new), `src/lib/ai/__tests__/embeddings.test.ts` (extend), `src/lib/actions/__tests__/ai-context.test.ts` (extend), `src/lib/actions/__tests__/course-materials.test.ts` (new), `e2e/evidence-citations.spec.ts` (new), `e2e/TEST_REGISTRY.md` (update).

---

### Task 1: REMOVED — no page-count guard (trust Gemini's page numbers)

This task originally added `pdf-lib` + `getPdfPageCount` to cross-check Gemini's structured page count against the real PDF page count, falling back to page-less chunking on mismatch. **Dropped** because: (a) it would add a brand-new dependency; (b) the strict count-equality guard is counterproductive — Gemini correctly omits text-less image slides while keeping the *right* page numbers for the rest, so a deck with image slides returns fewer page-objects than the real count and the guard would wrongly downgrade the whole deck to page-less; (c) Gemini sees the actual PDF, so gross misnumbering is rare and the worst realistic case (off-by-one) is recoverable and still better than today's no-page. `extractPdfPages` already validates each `page` is an integer and sorts — that pure-code check is sufficient for v1. A range/monotonicity guard can be added later if misnumbering is observed in practice. **Start execution at Task 2.**

---

### Task 2: Structured per-page extraction (`extractPdfPages`)

**Files:**
- Modify: `src/lib/ai/extraction/pdf.ts`
- Test: `src/lib/ai/extraction/__tests__/pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/extraction/__tests__/pdf.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGenAI {
    models = { generateContent: mockGenerateContent };
  },
  Type: {
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
    INTEGER: 'INTEGER',
    STRING: 'STRING',
  },
}));

import { extractPdfPages, extractPdfText } from '../pdf';

afterEach(() => vi.clearAllMocks());

describe('extractPdfPages', () => {
  it('parses structured pages and sorts them by page number', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { page: 2, text: 'Second' },
        { page: 1, text: 'First with $x^2$' },
      ]),
    });
    const pages = await extractPdfPages(Buffer.from('pdf'));
    expect(pages).toEqual([
      { page: 1, text: 'First with $x^2$' },
      { page: 2, text: 'Second' },
    ]);
  });

  it('keeps Hebrew text intact through the JSON round-trip', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([{ page: 1, text: 'שלום עולם' }]),
    });
    const pages = await extractPdfPages(Buffer.from('pdf'));
    expect(pages[0].text).toBe('שלום עולם');
  });

  it('returns [] on invalid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not json' });
    expect(await extractPdfPages(Buffer.from('pdf'))).toEqual([]);
  });
});

describe('extractPdfText (wrapper)', () => {
  it('joins page texts with blank lines', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { page: 1, text: 'A' },
        { page: 2, text: 'B' },
      ]),
    });
    expect(await extractPdfText(Buffer.from('pdf'))).toBe('A\n\nB');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/ai/extraction/__tests__/pdf.test.ts`
Expected: FAIL ("extractPdfPages is not a function").

- [ ] **Step 3: Implement — rewrite `pdf.ts`**

Replace the entire contents of `src/lib/ai/extraction/pdf.ts` with:

```ts
import { GoogleGenAI, Type } from '@google/genai';

function getGenAI() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  });
}

export interface PageText {
  /** 1-indexed page number as returned by the model. */
  page: number;
  text: string;
}

/**
 * Extract text from a PDF/PPTX as structured per-page output using Gemini Flash
 * (multimodal). Faithful, text-only: preserves LaTeX and Hebrew; does NOT invent
 * figure descriptions (so quoted "evidence" stays verbatim). Returns pages sorted
 * by page number; returns [] if the response can't be parsed.
 */
export async function extractPdfPages(buffer: Buffer): Promise<PageText[]> {
  const genai = getGenAI();

  const result = await genai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          {
            text: 'Extract the text of EACH PAGE of this PDF exactly as written, in page order. Preserve math notation using LaTeX ($...$ for inline, $$...$$ for display). Preserve Hebrew exactly. Do NOT describe images or invent figure captions — output only text that is actually written on the page. Return one object per page with its 1-based page number.',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            page: { type: Type.INTEGER },
            text: { type: Type.STRING },
          },
          required: ['page', 'text'],
        },
      },
    },
  });

  const raw = result.text ?? '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as PageText[])
    .filter(
      (p) => p && typeof p.page === 'number' && typeof p.text === 'string',
    )
    .sort((a, b) => a.page - b.page);
}

/**
 * Flat-text wrapper for callers that don't need page structure (and the
 * page-less fallback path).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pages = await extractPdfPages(buffer);
  return pages.map((p) => p.text).join('\n\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/ai/extraction/__tests__/pdf.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/extraction/pdf.ts src/lib/ai/extraction/__tests__/pdf.test.ts
git commit -m "feat(ai): structured per-page PDF extraction (faithful text-only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Math-aware, page-tagged chunker

**Files:**
- Modify: `src/lib/ai/embeddings.ts`
- Test: `src/lib/ai/__tests__/embeddings.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/ai/__tests__/embeddings.test.ts` (add the import and the new `describe` blocks):

```ts
import { chunkPages, chunkFlatText } from '../embeddings';

describe('chunkPages', () => {
  it('merges tiny consecutive pages into one chunk with a 0-indexed page range', () => {
    const chunks = chunkPages([
      { page: 1, text: 'Slide one title' },
      { page: 2, text: 'Slide two title' },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(0);
    expect(chunks[0].pageEnd).toBe(1);
    expect(chunks[0].text).toContain('Slide one');
    expect(chunks[0].text).toContain('Slide two');
  });

  it('splits a page larger than the budget into chunks tagged the same page', () => {
    const big = 'word '.repeat(700); // ~3500 chars > budget
    const chunks = chunkPages([{ page: 5, text: big }]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.pageStart).toBe(4); // 0-indexed
      expect(c.pageEnd).toBe(4);
    }
  });

  it('never splits inside a $$...$$ span (all chunks have balanced $)', () => {
    const math = '$$' + 'x+'.repeat(1200) + 'x$$'; // single span > budget
    const chunks = chunkPages([{ page: 1, text: `intro\n\n${math}\n\noutro` }]);
    for (const c of chunks) {
      const dollars = (c.text.match(/(?<!\\)\$/g) ?? []).length;
      expect(dollars % 2).toBe(0);
    }
  });

  it('skips empty / image-only pages', () => {
    const chunks = chunkPages([
      { page: 1, text: '   ' },
      { page: 2, text: 'real text' },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
  });
});

describe('chunkFlatText', () => {
  it('produces null page tags for page-less (DOCX) input', () => {
    const chunks = chunkFlatText('some docx text');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBeNull();
    expect(chunks[0].pageEnd).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- src/lib/ai/__tests__/embeddings.test.ts`
Expected: FAIL ("chunkPages is not a function").

- [ ] **Step 3: Implement — add to `embeddings.ts`**

In `src/lib/ai/embeddings.ts`, add the import near the top (after the existing imports) and append the new code below the existing `chunkText` function (keep `chunkText` and `TextChunk` unchanged):

```ts
import type { PageText } from '@/lib/ai/extraction/pdf';

export interface PageChunk {
  text: string;
  chunkIndex: number;
  pageStart: number | null; // 0-indexed
  pageEnd: number | null; // 0-indexed
}

/** Target chunk size. ~400 tokens for Latin text; far under the 8192-token cap. */
const CHUNK_CHAR_BUDGET = 1600;
const CHUNK_CHAR_OVERLAP = 200;

interface MathSpan {
  start: number;
  end: number; // [start, end) including delimiters
}

/** Locate `$...$` and `$$...$$` spans so we never split through one. */
function mathSpans(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '$' && text[i - 1] !== '\\') {
      const display = text[i + 1] === '$';
      const delimLen = display ? 2 : 1;
      let j = i + delimLen;
      let close = -1;
      while (j < text.length) {
        if (text[j] === '$' && text[j - 1] !== '\\') {
          if (!display || text[j + 1] === '$') {
            close = j;
            break;
          }
        }
        j++;
      }
      if (close === -1) {
        spans.push({ start: i, end: text.length }); // unterminated — keep whole
        break;
      }
      const end = close + delimLen;
      spans.push({ start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return spans;
}

function insideMath(spans: MathSpan[], pos: number): boolean {
  return spans.some((s) => pos > s.start && pos < s.end);
}

/** Largest clean boundary <= hardEnd that isn't inside a math span. */
function findSafeBoundary(
  text: string,
  spans: MathSpan[],
  from: number,
  hardEnd: number,
): number {
  for (const sep of ['\n\n', '\n', ' ']) {
    let pos = text.lastIndexOf(sep, hardEnd);
    while (pos > from) {
      const cut = pos + sep.length;
      if (!insideMath(spans, cut)) return cut;
      pos = text.lastIndexOf(sep, pos - 1);
    }
  }
  const span = spans.find((s) => hardEnd > s.start && hardEnd < s.end);
  return span ? span.end : hardEnd; // extend past an over-budget math span
}

/** Split one text into budgeted, math-safe pieces with overlap. */
function splitText(text: string): string[] {
  const t = text.trim();
  if (t.length <= CHUNK_CHAR_BUDGET) return t ? [t] : [];
  const spans = mathSpans(t);
  const out: string[] = [];
  let start = 0;
  while (start < t.length) {
    const hardEnd = Math.min(start + CHUNK_CHAR_BUDGET, t.length);
    const end =
      hardEnd >= t.length ? t.length : findSafeBoundary(t, spans, start, hardEnd);
    const piece = t.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= t.length) break;
    let next = end - CHUNK_CHAR_OVERLAP;
    if (next <= start || insideMath(spans, next)) next = end; // progress + no mid-math start
    start = next;
  }
  return out;
}

/** PDF/PPTX: pack pages into budgeted chunks tagged with the 0-indexed page range. */
export function chunkPages(pages: PageText[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  let idx = 0;
  let buf = '';
  let bufStart: number | null = null;
  let bufEnd: number | null = null;

  const flush = () => {
    const t = buf.trim();
    if (t) {
      chunks.push({ text: t, chunkIndex: idx++, pageStart: bufStart, pageEnd: bufEnd });
    }
    buf = '';
    bufStart = null;
    bufEnd = null;
  };

  for (const p of pages) {
    const page0 = p.page - 1; // store 0-indexed
    const text = (p.text ?? '').trim();
    if (!text) continue; // image-only / empty page: nothing to embed or quote

    if (text.length > CHUNK_CHAR_BUDGET) {
      flush();
      for (const part of splitText(text)) {
        chunks.push({ text: part, chunkIndex: idx++, pageStart: page0, pageEnd: page0 });
      }
      continue;
    }

    if (buf && buf.length + text.length + 2 > CHUNK_CHAR_BUDGET) flush();
    if (!buf) bufStart = page0;
    bufEnd = page0;
    buf = buf ? `${buf}\n\n${text}` : text;
  }
  flush();
  return chunks;
}

/** DOCX / page-less fallback: budgeted, math-safe chunks with null page tags. */
export function chunkFlatText(text: string): PageChunk[] {
  return splitText(text).map((t, i) => ({
    text: t,
    chunkIndex: i,
    pageStart: null,
    pageEnd: null,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/lib/ai/__tests__/embeddings.test.ts`
Expected: PASS (existing `chunkText`/`embedText`/`embedQuery` tests + the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embeddings.ts src/lib/ai/__tests__/embeddings.test.ts
git commit -m "feat(ai): math-aware page-tagged chunker (chunkPages/chunkFlatText)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire pages through `indexContent` (+ validation guard)

**Files:**
- Modify: `src/lib/actions/ai-context.ts` (function `indexContent`, the extract→chunk→embed block, ~lines 251-307)
- Test: `src/lib/actions/__tests__/ai-context.test.ts`

- [ ] **Step 1: Update the test mocks and add the page assertion**

In `src/lib/actions/__tests__/ai-context.test.ts`:

(a) Replace the `@/lib/ai/embeddings` mock (lines ~3-7) with:

```ts
vi.mock('@/lib/ai/embeddings', () => ({
  chunkText: vi.fn((text: string) => [{ text, chunkIndex: 0 }]),
  chunkPages: vi.fn((pages: { page: number; text: string }[]) =>
    pages.map((p, i) => ({
      text: p.text,
      chunkIndex: i,
      pageStart: p.page - 1,
      pageEnd: p.page - 1,
    })),
  ),
  chunkFlatText: vi.fn((text: string) => [
    { text, chunkIndex: 0, pageStart: null, pageEnd: null },
  ]),
  embedText: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
  embedQuery: vi.fn(async () => Array.from({ length: 1536 }, () => 0.1)),
}));
```

(b) Replace the `@/lib/ai/extraction/pdf` mock (lines ~13-15) with:

```ts
vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfPages: vi.fn(async () => [
    { page: 1, text: 'PDF page one with $x^2$ math' },
    { page: 2, text: 'PDF page two' },
  ]),
  extractPdfText: vi.fn(async () => 'PDF page one with $x^2$ math\n\nPDF page two'),
}));
```

(c) Replace the first `indexContent` test body ("extracts text from PDF and embeds as text") with:

```ts
  it('extracts per-page text and stores 0-indexed page numbers', async () => {
    const result = await indexContent({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });

    expect(result.success).toBe(true);
    expect(result.segmentsIndexed).toBe(2);
    expect(upsertEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_type: 'course_material',
          segment_text: 'PDF page one with $x^2$ math',
          page_start: 0,
          page_end: 0,
        }),
        expect.objectContaining({
          segment_text: 'PDF page two',
          page_start: 1,
          page_end: 1,
        }),
      ]),
    );
  });
```

Also update the import line `import { extractPdfText } from '@/lib/ai/extraction/pdf';` to `import { extractPdfPages } from '@/lib/ai/extraction/pdf';` and remove any now-unused `extractPdfText` assertions.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts`
Expected: FAIL (current `indexContent` calls `extractPdfText`/`chunkText` and writes `page_start: null`).

- [ ] **Step 3: Implement — update `indexContent` in `ai-context.ts`**

(a) Update the imports at the top of `ai-context.ts`:

```ts
import {
  chunkFlatText,
  chunkPages,
  embedQuery,
  embedText,
  type PageChunk,
} from '@/lib/ai/embeddings';
import { extractPdfPages } from '@/lib/ai/extraction/pdf';
```

(remove the old `chunkText`/`embedText` import line and the old `extractPdfText` import).

(b) Replace the extraction+chunking block (from `// Extract text from file` through the `const chunks = chunkText(text);` and the row-building `for` loop) with:

```ts
    // Extract + chunk with page tags.
    const isPdfLike =
      mimeType === 'application/pdf' ||
      mimeType.includes('presentationml') ||
      mimeType.includes('powerpoint');
    const isDocx =
      mimeType.includes('wordprocessingml') || mimeType === 'application/msword';

    let chunks: PageChunk[] = [];

    if (isPdfLike) {
      const pages = await extractPdfPages(fileBuffer);
      // Trust Gemini's reported 1-based page numbers (it reads the real PDF).
      // extractPdfPages already drops non-integer pages and sorts; an empty
      // result means nothing extractable, so produce no chunks.
      chunks = pages.length > 0 ? chunkPages(pages) : [];
    } else if (isDocx) {
      const text = await extractDocxText(fileBuffer);
      chunks = chunkFlatText(text);
    } else {
      return {
        success: false,
        segmentsIndexed: 0,
        skipped: false,
        error: `Unsupported mime type: ${mimeType}`,
      };
    }

    if (chunks.length === 0) {
      return { success: true, segmentsIndexed: 0, skipped: true };
    }

    const rows: EmbeddingRow[] = [];
    for (const chunk of chunks) {
      const embedding = await embedText(chunk.text);
      if (!embedding.length) continue;

      rows.push({
        source_type: sourceType,
        source_id: sourceId,
        segment_index: chunk.chunkIndex,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        segment_text: chunk.text,
        embedding,
        user_id: userId,
        course_id: courseId,
        source_name: sourceName,
        mime_type: mimeType,
        content_hash: hash,
      });
    }
```

(Leave the surrounding code — the `if (!rows.length)` skip, `upsertEmbeddings(rows)`, and the success return — unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts`
Expected: PASS for the `indexContent` describe block. (`searchContext`/`buildAiContext` tests still pass; `askQuestion` tests are removed in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(ai): index per-page chunks with 0-indexed page numbers + guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Index course materials on upload (await — serverless-safe)

**Files:**
- Modify: `src/lib/actions/course-materials.ts` (function `createCourseMaterial`)
- Test: `src/lib/actions/__tests__/course-materials.test.ts` (create)

> Why `await` and not `void indexContent(...)`: fire-and-forget work is dropped when the serverless function freezes after responding (see memory `serverless-fire-and-forget-guardrail`). Trade-off: the upload response waits for extraction+embedding (seconds). Acceptable for a one-off upload; if it ever needs to be non-blocking, switch to Next.js `after()` from `next/server` (survives the response without blocking).

- [ ] **Step 1: Write the failing test**

Create `src/lib/actions/__tests__/course-materials.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const indexContent = vi.fn(async () => ({
  success: true,
  segmentsIndexed: 3,
  skipped: false,
}));
vi.mock('../ai-context', () => ({ indexContent }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'mat-1', course_id: 'course-1' },
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

import { createCourseMaterial } from '../course-materials';

afterEach(() => vi.clearAllMocks());

describe('createCourseMaterial', () => {
  it('awaits indexContent for an embeddable PDF', async () => {
    await createCourseMaterial({
      course_id: 'course-1',
      category: 'material',
      storage_path: 'p.pdf',
      file_name: 'p.pdf',
      file_size: 10,
      mime_type: 'application/pdf',
    });
    expect(indexContent).toHaveBeenCalledWith({
      type: 'course_material',
      materialId: 'mat-1',
      courseId: 'course-1',
    });
  });

  it('does not index a non-embeddable type (e.g. image)', async () => {
    await createCourseMaterial({
      course_id: 'course-1',
      category: 'material',
      storage_path: 'p.png',
      file_name: 'p.png',
      file_size: 10,
      mime_type: 'image/png',
    });
    expect(indexContent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/actions/__tests__/course-materials.test.ts`
Expected: FAIL (`indexContent` is never called today).

- [ ] **Step 3: Implement — update `createCourseMaterial`**

In `src/lib/actions/course-materials.ts`, replace the tail of `createCourseMaterial` (from `if (error) throw new Error(error.message);` to `return material;`) with:

```ts
  if (error) throw new Error(error.message);

  // Index for AI search so the material is searchable and citable.
  // Awaited (not fire-and-forget): serverless freezes drop detached promises.
  const embeddable =
    data.mime_type === 'application/pdf' ||
    data.mime_type.includes('wordprocessingml') ||
    data.mime_type === 'application/msword' ||
    data.mime_type.includes('presentationml') ||
    data.mime_type.includes('powerpoint');
  if (embeddable) {
    const { indexContent } = await import('./ai-context');
    try {
      await indexContent({
        type: 'course_material',
        materialId: material.id,
        courseId: data.course_id,
      });
    } catch (err) {
      console.error('Course material indexing failed:', err);
    }
  }

  revalidatePath('/dashboard');
  return material;
```

> Note: the test mocks `../ai-context` statically, so the dynamic `import('./ai-context')` resolves to the mock. If the test runner can't intercept the dynamic import in your setup, change the implementation to a top-level `import { indexContent } from './ai-context';` — `course-materials.ts` and `ai-context.ts` don't import each other, so there's no cycle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/actions/__tests__/course-materials.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/course-materials.ts src/lib/actions/__tests__/course-materials.test.ts
git commit -m "feat(ai): index course materials on upload (awaited, serverless-safe)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5b: Make Moodle + personal-file indexing serverless-safe (await)

**Why this task exists:** The three Moodle routes and `addPersonalFile` currently fire `indexContent(...)` **without awaiting** and return the HTTP response immediately. On Vercel the function can freeze after responding, dropping the in-flight Gemini extraction+embedding — so the file lands in storage but **never gets a vector**, and the AI literally cannot find it. This is a primary cause of "Moodle files aren't embedded / the AI can't find them." Fix: await the call (logging, not failing, on error) exactly like Task 5 does for course materials.

**Files:**
- Modify: `src/app/api/moodle/upload/route.ts` (2 call sites)
- Modify: `src/app/api/moodle/upload-finalize/route.ts` (2 call sites)
- Modify: `src/app/api/moodle/import-existing/route.ts` (1 call site)
- Modify: `src/lib/actions/personal-files.ts` (`addPersonalFile`, the `void indexContent` site)
- Test: `src/app/api/moodle/import-existing/route.test.ts` (extend)

> Why `await` and not Next's `after()`: `after()` would keep the fast upload response while surviving the freeze, but it isn't used anywhere in this codebase yet and would mean mocking `next/server`'s `after` in tests. The established decision (memory `serverless-fire-and-forget-guardrail`) is to await in server routes. `indexContent` short-circuits on a content-hash match, so re-syncs of unchanged files stay instant; only genuinely new files pay the extraction cost. If bulk-sync latency ever bites, switching these sites to `after(() => indexContent(...))` is a clean follow-up.

- [ ] **Step 1: Write the failing test — the route must await indexing before responding**

In `src/app/api/moodle/import-existing/route.test.ts`, add this test inside the main `describe` (it uses a deferred promise to prove the response does not resolve until `indexContent` settles):

```ts
  it('awaits indexing before returning the response', async () => {
    const admin = buildAdmin({
      file: {
        id: 'file-1',
        storage_path: 'm.org/c1/abc.pdf',
        content_hash: 'h',
        file_size: 1,
        mime_type: 'application/pdf',
      },
    });
    setupAuth(admin);

    let resolveIndex!: () => void;
    const gate = new Promise<{ success: boolean; segmentsIndexed: number; skipped: boolean }>(
      (resolve) => {
        resolveIndex = () => resolve({ success: true, segmentsIndexed: 1, skipped: false });
      },
    );
    vi.mocked(indexContent).mockReturnValueOnce(gate);

    const respPromise = POST(makeRequest(body) as never);

    // Let microtasks run: indexContent should have been dispatched...
    await new Promise((r) => setImmediate(r));
    let settled = false;
    void respPromise.then(() => {
      settled = true;
    });
    await new Promise((r) => setImmediate(r));
    // ...but the response must NOT have resolved yet (proves we await).
    expect(settled).toBe(false);

    resolveIndex();
    const res = await respPromise;
    expect(res.status).toBe(200);
  });
```

> If `buildAdmin`/`setupAuth`/`makeRequest`/`body` differ in the existing file, reuse that file's exact helpers — do not invent new ones. The key assertion is `settled === false` before `resolveIndex()`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/app/api/moodle/import-existing/route.test.ts -t "awaits indexing"`
Expected: FAIL — today the route fires `indexContent(...).catch(...)` and returns immediately, so `settled` is already `true`.

- [ ] **Step 3: Implement — `src/app/api/moodle/import-existing/route.ts`**

Replace this block:

```ts
    if (appCourseId) {
      // Fire-and-forget. indexContent itself short-circuits on a content
      // hash match, so re-imports don't re-embed.
      indexContent({
        type: 'moodle_file',
        fileId: file.id,
        courseId: appCourseId,
      }).catch((err) => console.error('Index failed:', err));
    }
```

with:

```ts
    if (appCourseId) {
      // Awaited (not fire-and-forget): a detached promise is dropped when the
      // serverless function freezes after responding, leaving the file
      // un-embedded and unfindable. indexContent short-circuits on a content
      // hash match, so re-imports stay cheap. Failure is logged, not fatal.
      try {
        await indexContent({
          type: 'moodle_file',
          fileId: file.id,
          courseId: appCourseId,
        });
      } catch (err) {
        console.error('Index failed:', err);
      }
    }
```

- [ ] **Step 4: Implement — `src/app/api/moodle/upload/route.ts` (both sites)**

There are two identical fire-and-forget blocks (one for the updated `fileRecord`, one for the inserted `newRecord`). Replace each:

```ts
      // Index for AI search (fire-and-forget)
      if (appCourseId) {
        indexContent({
          type: 'moodle_file',
          fileId: fileRecord.id,
          courseId: appCourseId,
        }).catch((err) => console.error('Index failed:', err));
      }
```

with (await + try/catch; the second site uses `newRecord.id` — change `fileRecord.id` accordingly):

```ts
      // Index for AI search. Awaited (not fire-and-forget): detached promises
      // are dropped on serverless freeze, leaving the file unfindable.
      if (appCourseId) {
        try {
          await indexContent({
            type: 'moodle_file',
            fileId: fileRecord.id,
            courseId: appCourseId,
          });
        } catch (err) {
          console.error('Index failed:', err);
        }
      }
```

- [ ] **Step 5: Implement — `src/app/api/moodle/upload-finalize/route.ts` (both sites)**

Identical change to the two blocks there (one uses `fileRecord.id`, the other `newRecord.id`):

```ts
      if (appCourseId) {
        try {
          await indexContent({
            type: 'moodle_file',
            fileId: fileRecord.id,
            courseId: appCourseId,
          });
        } catch (err) {
          console.error('Index failed:', err);
        }
      }
```

- [ ] **Step 6: Implement — `src/lib/actions/personal-files.ts` (`addPersonalFile`)**

Replace:

```ts
  if (embeddable) {
    const { indexContent } = await import('@/lib/actions/ai-context');
    void indexContent({
      type: 'personal_file',
      fileId: file.id,
      courseId: data.courseId,
    });
  }
```

with:

```ts
  if (embeddable) {
    // Awaited (not fire-and-forget): detached promises are dropped on
    // serverless freeze, leaving the file un-embedded and unfindable.
    const { indexContent } = await import('@/lib/actions/ai-context');
    try {
      await indexContent({
        type: 'personal_file',
        fileId: file.id,
        courseId: data.courseId,
      });
    } catch (err) {
      console.error('Personal file indexing failed:', err);
    }
  }
```

- [ ] **Step 7: Verify no fire-and-forget indexing remains**

Run: `grep -rn "indexContent" src/app/api/moodle src/lib/actions/personal-files.ts | grep -E "\.catch\(|void indexContent"`
Expected: NO output (every call site now awaits).

- [ ] **Step 8: Run the test + the existing route tests to verify they pass**

Run: `pnpm test -- src/app/api/moodle/import-existing/route.test.ts`
Expected: PASS (existing tests + the new "awaits indexing" test).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/moodle/upload/route.ts src/app/api/moodle/upload-finalize/route.ts src/app/api/moodle/import-existing/route.ts src/lib/actions/personal-files.ts src/app/api/moodle/import-existing/route.test.ts
git commit -m "fix(ai): await Moodle + personal-file indexing (serverless-safe)

Fire-and-forget indexContent was dropped on serverless freeze, leaving
files un-embedded and unfindable by the AI. Await so the embedding
completes within the request lifetime; log (not fail) on error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Retrieval — multiple chunks per file + per-(source,page) citations

**Files:**
- Modify: `src/lib/actions/ai-context.ts` (`buildAiContext`: the dedupe loop + signed-URL fetch, ~lines 581-700; bump `match_count`)
- Test: `src/lib/actions/__tests__/ai-context.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `ai-context.test.ts`:

```ts
describe('buildAiContext multi-chunk retrieval + page citations', () => {
  it('keeps several chunks per file and emits one citation per (source,page)', async () => {
    const mk = (id: number, page: number) => ({
      id,
      source_type: 'course_material',
      source_id: 'mat-9',
      source_name: 'Lecture9.pdf',
      segment_text: `chunk ${id}`,
      page_start: page,
      page_end: page,
      course_id: 'course-1',
      mime_type: 'application/pdf',
      similarity: 0.9,
    });
    // No attached files -> only the course-wide pass runs (one matchEmbeddings call).
    vi.mocked(matchEmbeddings).mockResolvedValueOnce([
      mk(1, 0),
      mk(2, 0), // same page as chunk 1 -> citation deduped
      mk(3, 6),
    ]);

    const { sources } = await buildAiContext({
      question: 'q',
      courseId: 'course-1',
      mode: 'quick',
    });

    // Two distinct citations: p.1 and p.7 (0-indexed 0 and 6).
    expect(sources).toHaveLength(2);
    const ranges = sources.map((s) => s.pageRange).sort();
    expect(ranges).toEqual(['p. 1', 'p. 7']);
    // Same file -> both citations share the one signed URL (fetched once).
    expect(sources.every((s) => s.signedUrl?.startsWith('http'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts -t "multi-chunk"`
Expected: FAIL (today's loop dedupes by `source_id`, returning 1 source).

- [ ] **Step 3: Implement — rewrite the dedupe + signed-URL block in `buildAiContext`**

Add the constant near the top of `ai-context.ts` (after the imports):

```ts
const MAX_CHUNKS_PER_SOURCE = 3;
```

Bump the course-wide retrieval to 12 — change the `courseResults` call:

```ts
  const courseResults = courseId
    ? await searchContext({ query: question, courseId, maxResults: 12 })
    : [];
```

Replace the entire block from `const contextTexts: string[] = [];` (the `seen` dedupe loop) **through** the end of the `await Promise.all(sourceIds.map(...))` signed-URL block with:

```ts
  const contextTexts: string[] = [];
  const sources: QuestionResult['sources'] = [];
  const perSourceCount = new Map<string, number>();
  const seenChunk = new Set<string>();
  const seenCitation = new Set<string>();
  // sourceId -> { sourceType, idxs: indices in `sources` that share this file's URL }
  const citationsBySource = new Map<
    string,
    { sourceType: string; idxs: number[] }
  >();

  const pageRangeOf = (r: SearchResult): string | null =>
    r.pageStart != null
      ? r.pageEnd != null && r.pageEnd !== r.pageStart
        ? `p. ${r.pageStart + 1}–${r.pageEnd + 1}`
        : `p. ${r.pageStart + 1}`
      : null;

  for (const r of results) {
    if (!r.segmentText) continue;
    const chunkKey = String(r.id);
    if (seenChunk.has(chunkKey)) continue;
    const count = perSourceCount.get(r.sourceId) ?? 0;
    if (count >= MAX_CHUNKS_PER_SOURCE) continue;
    seenChunk.add(chunkKey);
    perSourceCount.set(r.sourceId, count + 1);

    const pageRange = pageRangeOf(r);
    const header = pageRange
      ? `--- ${r.sourceName} (${pageRange}) ---`
      : `--- ${r.sourceName} ---`;
    contextTexts.push(`${header}\n${r.segmentText}`);

    const citationKey = `${r.sourceId}|${pageRange ?? ''}`;
    if (!seenCitation.has(citationKey)) {
      seenCitation.add(citationKey);
      sources.push({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        sourceName: r.sourceName,
        pageRange,
        signedUrl: null,
      });
      const idx = sources.length - 1;
      const entry = citationsBySource.get(r.sourceId) ?? {
        sourceType: r.sourceType,
        idxs: [],
      };
      entry.idxs.push(idx);
      citationsBySource.set(r.sourceId, entry);
    }
  }

  // One signed URL per distinct file, fanned out to all its (page) citations.
  const distinct = [...citationsBySource.entries()].map(
    ([sourceId, v]) => ({ sourceId, sourceType: v.sourceType, idxs: v.idxs }),
  );
  const moodleIds = distinct
    .filter((s) => s.sourceType === 'moodle_file')
    .map((s) => s.sourceId);
  const materialIds = distinct
    .filter((s) => s.sourceType === 'course_material')
    .map((s) => s.sourceId);
  const personalIds = distinct
    .filter((s) => s.sourceType === 'personal_file')
    .map((s) => s.sourceId);

  const moodlePaths: Record<string, string> = {};
  const materialPaths: Record<string, string> = {};
  const personalPaths: Record<string, string> = {};

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
  if (personalIds.length > 0) {
    const { data } = await supabase
      .from('personal_files')
      .select('id, storage_path')
      .in('id', personalIds);
    for (const row of (data ?? []) as { id: string; storage_path: string }[]) {
      personalPaths[row.id] = row.storage_path;
    }
  }

  await Promise.all(
    distinct.map(async ({ sourceId, sourceType, idxs }) => {
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
      const client = bucket === 'moodle-materials' ? admin : supabase;
      const { data } = await client.storage
        .from(bucket)
        .createSignedUrl(path, 3600);
      const url = data?.signedUrl ?? null;
      for (const idx of idxs) sources[idx].signedUrl = url;
    }),
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts`
Expected: PASS, including the existing "attaches signedUrl" and "focus pass" tests (sources now keyed by (source,page) but those tests use null pages → one citation per file, unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(ai): retrieve multiple chunks/file + per-(source,page) citations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Delete the dead `askQuestion` builder

**Files:**
- Modify: `src/lib/actions/ai-context.ts` (remove `askQuestion`)
- Modify: `src/lib/actions/__tests__/ai-context.test.ts` (remove its tests)

- [ ] **Step 1: Confirm nothing imports `askQuestion` except the test**

Run: `grep -rn "askQuestion" src --include="*.ts" --include="*.tsx" | grep -v "__tests__"`
Expected: only its definition in `ai-context.ts` (the live route uses `buildAiContext`). If any other importer appears, STOP and update that caller to `buildAiContext` first.

- [ ] **Step 2: Remove `askQuestion`**

Delete the entire `export async function askQuestion(...)` function from `ai-context.ts` (and the now-unused `QuestionResult.answer`-only usage if exclusive to it — keep `QuestionResult` since `buildAiContext` uses `sources`).

- [ ] **Step 3: Remove its tests**

In `ai-context.test.ts`, delete the `describe('askQuestion', ...)` block and the `askQuestion` import.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts && pnpm lint`
Expected: PASS, no unused-import or type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/ai-context.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "refactor(ai): remove dead askQuestion (buildAiContext is the live path)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Backfill driver (`reindexAllContent`) + wire the reindex route

**Files:**
- Modify: `src/lib/actions/ai-context.ts` (add `reindexAllContent`)
- Modify: `src/app/api/ai/reindex/route.ts`
- Test: `src/lib/actions/__tests__/ai-context.test.ts`

> Scope note (honest limitation): `indexContent` for `course_material`/`personal_file` runs under the **caller's** Supabase session (RLS), while `moodle_file` uses the admin client. So an admin-run backfill fully covers Moodle files and the caller's own materials; a complete cross-user historical re-index of every user's course materials/personal files would need an admin-client variant of `indexContent` (follow-up). New uploads are covered by Task 5. This is acceptable for v1.

- [ ] **Step 1: Write the failing test**

Add to `ai-context.test.ts` (extend the admin mock's `from` to handle a `content_embeddings` select + a `course_materials` list; the existing admin mock already returns chainable objects — add these handlers):

```ts
describe('reindexAllContent', () => {
  it('enumerates indexed sources + unindexed course materials and indexes each', async () => {
    // The admin mock should return:
    //   content_embeddings -> [{ source_type:'moodle_file', source_id:'file-1', course_id:'mc-1' }]
    //   course_materials   -> [{ id:'mat-2', course_id:'course-2' }]
    // (Configure via the admin-client mock's `from` switch, mirroring the
    //  existing moodle_files handler.)
    const { reindexAllContent } = await import('../ai-context');
    const res = await reindexAllContent();
    expect(res.processed + res.failed).toBeGreaterThanOrEqual(2);
  });
});
```

> Because the existing admin mock is shared, configure the two new tables in that mock's `from(table)` switch (return chainable objects whose `then`/`select` resolve the rows above). Keep it minimal — the assertion only checks that jobs were attempted.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts -t "reindexAllContent"`
Expected: FAIL ("reindexAllContent is not a function").

- [ ] **Step 3: Implement `reindexAllContent` in `ai-context.ts`**

Add after `reindexCourse`:

```ts
/**
 * One-time backfill: re-extract + re-embed all indexed sources (so they pick up
 * per-page chunking) and index any course materials that were never indexed.
 * Throttled with a small concurrency pool to respect embedding rate limits.
 *
 * Limitation: course_material/personal_file indexing runs under the caller's
 * RLS; Moodle files use the admin client. Run as an authenticated admin.
 */
export async function reindexAllContent(): Promise<{
  processed: number;
  failed: number;
}> {
  await getAuthUserId();
  const admin = createAdminClient();

  const { data: indexed } = await admin
    .from('content_embeddings')
    .select('source_type, source_id, course_id');
  const { data: materials } = await admin
    .from('course_materials')
    .select('id, course_id');

  const jobs: IndexSource[] = [];
  const seen = new Set<string>();
  for (const r of (indexed ?? []) as {
    source_type: string;
    source_id: string;
    course_id: string;
  }[]) {
    const key = `${r.source_type}:${r.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.source_type === 'moodle_file')
      jobs.push({ type: 'moodle_file', fileId: r.source_id, courseId: r.course_id });
    else if (r.source_type === 'course_material')
      jobs.push({ type: 'course_material', materialId: r.source_id, courseId: r.course_id });
    else if (r.source_type === 'personal_file')
      jobs.push({ type: 'personal_file', fileId: r.source_id, courseId: r.course_id });
  }
  for (const m of (materials ?? []) as { id: string; course_id: string }[]) {
    const key = `course_material:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ type: 'course_material', materialId: m.id, courseId: m.course_id });
  }

  // Force re-extraction: clear content hashes so indexContent won't skip.
  await admin
    .from('content_embeddings')
    .update({ content_hash: null })
    .not('content_hash', 'is', null);

  const CONCURRENCY = 3;
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((j) => indexContent(j)));
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.success) processed++;
      else failed++;
    }
  }
  return { processed, failed };
}
```

- [ ] **Step 4: Wire the reindex route**

Replace the blanket-delete body of `POST` in `src/app/api/ai/reindex/route.ts` (keep the auth check) with:

```ts
    const { reindexAllContent } = await import('@/lib/actions/ai-context');
    const { processed, failed } = await reindexAllContent();
    return NextResponse.json({
      processed,
      failed,
      message: `Re-indexed ${processed} sources (${failed} failed).`,
    });
```

(Remove the now-unused `createAdminClient` import if it's no longer referenced in the route.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- src/lib/actions/__tests__/ai-context.test.ts -t "reindexAllContent"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/ai-context.ts src/app/api/ai/reindex/route.ts src/lib/actions/__tests__/ai-context.test.ts
git commit -m "feat(ai): backfill driver re-indexes sources + unindexed course materials

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Integration test — real per-page indexing into local Supabase

**Files:**
- Test: `src/lib/actions/__tests__/page-indexing.integration.test.ts` (create)

> Uses the local seeded Supabase (see memory `running-tests-locally`). Extraction is mocked (no Gemini key locally/CI per memory `ai-e2e-no-gemini-key-in-ci`); embeddings are mocked to deterministic vectors. The point is to verify real rows land with non-null 0-indexed pages and that re-indexing replaces them.

- [ ] **Step 1: Write the test**

Create `src/lib/actions/__tests__/page-indexing.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/embeddings', async (orig) => {
  const actual = await orig<typeof import('@/lib/ai/embeddings')>();
  return {
    ...actual, // keep real chunkPages/chunkFlatText
    embedText: vi.fn(async () => Array.from({ length: 1536 }, () => 0.05)),
    embedQuery: vi.fn(async () => Array.from({ length: 1536 }, () => 0.05)),
  };
});
vi.mock('@/lib/ai/extraction/pdf', () => ({
  extractPdfPages: vi.fn(async () => [
    { page: 1, text: 'Integration page one' },
    { page: 2, text: 'Integration page two' },
  ]),
  extractPdfText: vi.fn(async () => 'Integration page one\n\nIntegration page two'),
}));

// NOTE: This test needs a seeded course_material row + its storage object in
// local Supabase. Follow the seeding helper used by the existing
// *.integration.test.ts files (see src/lib/actions/__tests__ and the
// `typenote-test-gotchas` memory for the seed-user lookup). Create a
// course_material pointing at a small uploaded object, capture its id as
// `materialId` and `courseId`, then:

describe('per-page indexing (integration)', () => {
  it('stores non-null 0-indexed page numbers, replaced on re-index', async () => {
    const { indexContent } = await import('../ai-context');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();

    // ---- arrange materialId/courseId via the shared seeding helper ----
    // const { materialId, courseId } = await seedCourseMaterial(admin, 'small.pdf');

    const r1 = await indexContent({ type: 'course_material', materialId, courseId });
    expect(r1.success).toBe(true);
    expect(r1.segmentsIndexed).toBe(2);

    const { data } = await admin
      .from('content_embeddings')
      .select('segment_index, page_start, page_end, segment_text')
      .eq('source_type', 'course_material')
      .eq('source_id', materialId)
      .order('segment_index');

    expect(data).toHaveLength(2);
    expect(data![0].page_start).toBe(0);
    expect(data![1].page_start).toBe(1);
    expect(data!.every((row) => row.page_start !== null)).toBe(true);

    // Re-index replaces (delete-then-insert in upsertEmbeddings).
    const r2 = await indexContent({ type: 'course_material', materialId, courseId });
    expect(r2.segmentsIndexed).toBe(2);
  });
});
```

> Implement `seedCourseMaterial` (or inline the insert + storage upload) following the existing integration tests' seeding pattern; declare `materialId`/`courseId` from it. Do not leave it as a placeholder — wire it to the real seed helper before running.

- [ ] **Step 2: Run the integration test**

Run: `pnpm test:integration -- src/lib/actions/__tests__/page-indexing.integration.test.ts`
Expected: PASS (rows have page_start 0 and 1).

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/__tests__/page-indexing.integration.test.ts
git commit -m "test(ai): integration — per-page indexing stores 0-indexed pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: E2E — evidence quote + jump-to-page (mocked AI)

**Files:**
- Create: `e2e/evidence-citations.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

> AI is mocked via `page.route` on `/api/ai/ask` (CI has no Gemini key — memory `ai-e2e-no-gemini-key-in-ci`). The route returns the same SSE event shape the real route streams: a `sources` event (with `pageRange`), `text` events (answer with a blockquote + inline citation), then `done`. Use the shared login helper `e2e/helpers/auth.ts`.

- [ ] **Step 1: Add the registry entry**

In `e2e/TEST_REGISTRY.md`, add a section:

```markdown
### Evidence citations & page-accurate sources (`e2e/evidence-citations.spec.ts`)
- AI answer renders a verbatim blockquote + inline `(file, p. N)` citation.
- Clicking a source badge with a page opens the FileViewer scrolled to that page.
- Two citations to the same file at different pages render as two badges, each jumping to its own page.
```

- [ ] **Step 2: Write the E2E spec**

Create `e2e/evidence-citations.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/** Build one SSE frame. */
function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

test.describe('Evidence citations', () => {
  test('answer shows a quote and a citation that jumps to the page', async ({
    page,
  }) => {
    await login(page);

    // Mock the AI endpoint with a deterministic streamed answer + sources.
    await page.route('**/api/ai/ask', async (route) => {
      const body =
        sse({
          type: 'sources',
          model: 'flash',
          contextFilesUsed: false,
          sources: [
            {
              sourceType: 'course_material',
              sourceId: 'mat-1',
              sourceName: 'Lecture5.pdf',
              pageRange: 'p. 7',
              signedUrl: null,
            },
          ],
        }) +
        sse({
          type: 'text',
          text: '> Eigenvalues satisfy det(A - λI) = 0.\n\nThat is the key idea (Lecture5.pdf, p. 7).',
        }) +
        sse({ type: 'done' });
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body,
      });
    });

    // Navigate to a course document with the AI chat. Adjust the navigation to
    // the project's seeded course/document (see existing e2e/ai-chat specs).
    await page.goto('/dashboard');
    // ... open a course document and the AI chat panel (reuse existing helpers/steps) ...

    await page.getByPlaceholder(/ask/i).fill('What defines an eigenvalue?');
    await page.getByRole('button', { name: /send/i }).click();

    // Evidence: a blockquote is rendered.
    await expect(page.locator('blockquote')).toContainText('det(A - λI)');

    // Citation badge with the page, and it opens the viewer.
    const citation = page.getByTestId('ai-citation').first();
    await expect(citation).toContainText('Lecture5.pdf');
    await expect(citation).toContainText('p. 7');
    await citation.click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
  });
});
```

> The navigation steps (open a seeded course doc + the chat panel) must reuse the patterns in the existing AI-chat E2E specs — copy those exact selectors/steps rather than inventing new ones. Do not leave the `...` comment in the final test.

- [ ] **Step 3: Run the E2E test**

Run: `pnpm test:e2e -- e2e/evidence-citations.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/evidence-citations.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(e2e): evidence quote + jump-to-page citation flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Full suite + manual backfill

- [ ] **Step 1: Run the full suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all PASS.

- [ ] **Step 2: Lint, format, build**

Run: `pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 3: Backfill existing content (manual, one-time)**

After deploying, trigger `POST /api/ai/reindex` as an authenticated admin to re-extract + re-embed existing materials with page numbers. Expect a JSON `{ processed, failed }`. Watch logs for rate-limit errors; the driver throttles at concurrency 3, but a very large corpus may need to be run in waves.

---

## Self-review notes

- **Spec coverage:** §4.1 structured per-page extraction → Task 2, 4 (no page-count guard — Task 1 removed; we trust Gemini's page numbers); §4.2 math-aware page-tagged chunks → Task 3; §4.3 indexing 0-indexed pages + course_material → Task 4–5; serverless-safe indexing of Moodle + personal files (so they actually get embedded) → Task 5b; §4.4 multi-chunk + per-(source,page) + signed-URL dedupe → Task 6; §4.6 viewer (already built, exercised) → Task 10; §6 course-material indexing + backfill → Task 5, 8; testing → Task 9–11. §4.5 (prompt/render) is **Phase 1**.
- **Moodle findability (Task 5b):** fixes the *future-uploads* half of "the AI can't find Moodle files" (embedding was silently dropped at upload time); Task 8's backfill re-embeds *existing* files that were dropped; Task 6's multi-chunk retrieval + Task 3's smaller chunks fix the *retrieval-quality* half. All three together close the issue.
- **Type consistency:** `PageText` (defined in `pdf.ts`, imported by `embeddings.ts` and the `indexContent` flow), `PageChunk` (embeddings.ts), `chunkPages`/`chunkFlatText`, `reindexAllContent`, `MAX_CHUNKS_PER_SOURCE`, `CHUNK_CHAR_BUDGET` — all referenced consistently across tasks.
- **0-indexed contract:** stored `page_start/page_end` are 0-indexed (chunkPages subtracts 1); `pageRangeOf` adds 1 for display ("p. N"); the chat badge subtracts 1 again for `FileViewer.initialPage`. Verified end-to-end in Task 6 + Task 10.
- **Known limitations (documented, accepted for v1):** cross-user historical backfill of course_material/personal_file is RLS-bound (Task 8 note); pure-image pages produce no chunk (not retrievable in text-only v1 — §13 future); very large PDFs that overflow the extraction model's output limit may return partial/truncated pages (we trust whatever pages come back) — batched extraction for >50-page PDFs is a follow-up if it bites.
- **Open follow-up (not blocking):** admin-client variant of `indexContent` for a complete cross-user backfill; per-span LTR isolation of citations in Hebrew prose; batched extraction for very large PDFs.
