# Evidence Citations & Page-Accurate Sources — Design

- **Date:** 2026-05-27
- **Status:** Approved (ready for implementation planning)
- **Branch:** `feat/evidence-citations` (off latest `dev`)
- **Builds on:** the merged **document-context-files / focus-files** feature (citation
  delivery plumbing already exists — see §2)

## 1. Summary

When the AI chat answers from course materials, we want it to (a) **show its evidence** —
quote the exact passage it relied on — and (b) let the student **jump to that exact place**
in the source file. Today neither is reliable, for one root cause: **the RAG pipeline never
records *where* a passage lives.** PDFs are extracted into a single flat text blob, the blob
is stored as one ~25 000-character chunk, and `page_start`/`page_end` are hardcoded `null`.

This design fixes that at the source:

1. **Per-page extraction** — ask Gemini for structured per-page text instead of one blob.
2. **Small, page-tagged chunks** — replace the 25 000-char "one chunk per file" with a
   ~1 600-char (~400-token) budget, each chunk tagged with the page(s) it covers.
3. **Retrieve multiple chunks per file** — remove the dedupe-by-file limit so several
   relevant passages (and their pages) reach the model.
4. **Evidence-quote prompt** — instruct the model to quote the verbatim passage it used and
   cite `(File, p. N)`.

The citation UI is already done: `FileViewer` accepts `initialPage` and the chat panel turns
`pageRange` into a jump-to-page click. They simply start receiving real page numbers.

A secondary but real benefit: this **fixes a correctness bug** (today the embedder silently
truncates everything past ~2 048 tokens, so most of every large file is unsearchable) and
**reduces per-query cost** (small relevant chunks instead of giant blobs in the prompt).

## 2. Background / current state (verified against `dev`)

- **Chunking:** `src/lib/ai/embeddings.ts` — `MAX_CHARS_PER_CHUNK = 25000` (~6 000 tokens).
  `chunkText` only splits files *above* that limit; in practice each file → **one chunk**.
- **Embedding:** `embedText`/`embedQuery` use `gemini-embedding-2-preview`, 1 536 dims,
  asymmetric task types (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`) — keep this.
  - **Input cap:** the Gemini embedding family caps input at **~2 048 tokens and silently
    truncates** overflow ([docs](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001)).
    A ~6 000-token chunk therefore embeds only its first third; the rest is stored as
    `segment_text` but **absent from the vector** → unsearchable. (Exact cap for the
    `-2-preview` variant to be confirmed during implementation; design stays well under it.)
- **Extraction:** `src/lib/ai/extraction/pdf.ts` sends the whole PDF to `gemini-2.5-flash`
  multimodal and returns **one flat string** — no page structure. (This multimodal step is
  deliberate: it preserves LaTeX, Hebrew, and scanned/image slides. We keep it.)
  `extraction/docx.ts` (mammoth) returns flat text with no page concept.
- **Indexing:** `indexContent` in `src/lib/actions/ai-context.ts` extracts → `chunkText` →
  `embedText` per chunk → `upsertEmbeddings`. It **hardcodes `page_start: null,
  page_end: null`** (lines ~289-290). `upsertEmbeddings` deletes prior rows for the source
  then inserts in batches of 20 (`src/lib/queries/embeddings.ts`).
- **Retrieval:** `searchContext` → `matchEmbeddings` RPC (`match_count` default 8, threshold
  0.3). The RPC already returns `segment_text`, `page_start`, `page_end`, `source_type`,
  `source_id`, `source_name`, `mime_type`, `similarity`, and supports the optional
  `match_source_ids` focus filter.
- **Context assembly:** `buildAiContext` runs a **focus pass** (attached files via
  `match_source_ids`) + a **course-wide pass**, concatenates, then **dedupes by
  `source_id`** (`if (r.segmentText && !seen.has(r.sourceId))`, ~line 604) — keeping **only
  one chunk per file**. It computes `pageRange` from `page_start/page_end` (~line 607, always
  `null` today) and generates signed URLs for every source.
- **Prompt:** `src/lib/ai/prompts.ts` `buildSystemPrompt` tells the model to cite materials
  and lists a `[Sources]` block, but does **not** ask for verbatim evidence quotes.
- **Citation UI (already built):**
  - `src/components/dashboard/file-viewer.tsx` — `FileViewerProps.initialPage` (0-indexed);
    on load scrolls to `#ctx-pdf-page-${initialPage}` (lines ~12, 50).
  - `src/components/ai/ai-chat-panel.tsx` — renders each source as a badge, parses the first
    number out of `pageRange` (`src.pageRange?.match(/\d+/)`, ~line 627) and calls
    `onOpenSource(sourceType, sourceId, page)` (~line 638), else falls back to the signed URL.
- **Schema:** `content_embeddings` already has `page_start`/`page_end` columns (migrations
  `00007_add_pages_column.sql`, `00012_create_content_embeddings.sql`). **No schema change
  needed.**

> Note: line numbers are from reads taken this session and will be re-verified before
> editing — the harness served some stale reads, so the implementation must read fresh.

## 3. Goals / non-goals

**Goals**

- Produce and store **page numbers** for every PDF/slide chunk.
- **Smaller, page-tagged chunks** (~400 tokens) that stay under the embedder's input cap and
  give sharp, discriminative vectors.
- Retrieve **multiple chunks per file** so the best passages (and their pages) reach the model.
- A prompt that makes the model **quote its evidence** and cite `(File, p. N)`.
- A **one-time backfill** to re-extract + re-embed already-indexed materials.

**Non-goals (this iteration)**

- Pixel-exact text highlighting inside the PDF (we jump to the *page*; sentence-level
  highlight via the viewer's text layer is a later enhancement).
- Changing the embedding model, the `match_embeddings` RPC signature, or the DB schema.
- Page numbers for DOCX (no native pages) — DOCX chunks keep `page_start/page_end = null` and
  cite by file name, exactly as today. Graceful degradation.
- Re-scoping the broad course-wide RAG or the focus-pass ranking (both stay).

## 4. Design

### 4.1 Per-page extraction (`extraction/pdf.ts`)

Change `extractPdfText` to request **structured per-page output** from Gemini using a response
schema, returning `Array<{ page: number; text: string }>` (1-indexed `page`, in document
order). Prompt unchanged in spirit ("extract all text, preserve LaTeX, handle Hebrew"), but
output is per page.

- New exported shape, e.g. `extractPdfPages(buffer): Promise<PageText[]>`. Keep a thin
  `extractPdfText` wrapper (`pages.map(p => p.text).join('\n\n')`) if any caller still needs
  flat text.
- **Validation guard:** compare the returned page count against the PDF's real page count
  (pdf.js `getDocument(...).numPages`, already a dependency). If they disagree beyond a small
  tolerance, fall back to flat extraction with `page = null` (degrade to today's behavior
  rather than emit wrong page numbers). Log the mismatch.
- DOCX path unchanged: returns flat text → treated as a single "page-less" stream (§4.2).

### 4.2 Chunking with page tags (`embeddings.ts`)

Replace the 25 000-char `chunkText` with a page-aware budgeted chunker:

```
CHUNK_CHAR_BUDGET = 1600   // ≈ 400 tokens (≈4 chars/token), safely under the ~2048 cap
CHUNK_CHAR_OVERLAP = 200   // overlap only within a single page's sub-chunks
```

Algorithm over `PageText[]`:

- Greedily **merge consecutive pages** into a buffer until adding the next page would exceed
  `CHUNK_CHAR_BUDGET`; flush as one chunk tagged `page_start = firstPage`,
  `page_end = lastPage`. (Tiny title-only slides combine → citation like "p. 11–12".)
- If a **single page exceeds** the budget, split it into multiple sub-chunks (with
  `CHUNK_CHAR_OVERLAP`), all tagged `page_start = page_end = thatPage`.
- Page-less input (DOCX / fallback): budgeted split with `page_start = page_end = null`.

Output `TextChunk { text, chunkIndex, pageStart, pageEnd }`. Token budget is approximated by
characters to avoid shipping a tokenizer — consistent with the existing char-based approach.
**All three numbers (`CHUNK_CHAR_BUDGET`, `CHUNK_CHAR_OVERLAP`, retrieval `match_count`) are
tunable constants** so retrieval quality can be measured and adjusted.

### 4.3 Indexing (`indexContent`)

- Call `extractPdfPages` for PDF/PPTX; build `PageText[]` (DOCX → single page-less entry).
- Run the new chunker; for each chunk set real `page_start`/`page_end` (replacing the
  hardcoded `null`s).
- **Embedding-call volume:** ~15 small embeds per slide deck instead of 1. Embeds are cheap,
  but bulk re-index must **throttle/batch** to respect rate limits — embed in small
  concurrency-limited batches; keep the existing 20-row insert batching.

### 4.4 Retrieval — allow multiple chunks per file (`buildAiContext`)

The current dedupe-by-`source_id` keeps only one chunk per file — correct when a file was one
chunk, wrong now. Change to:

- Dedupe by **chunk identity** (`source_id` + `segment_index`/row `id`), not by file.
- Keep up to **`MAX_CHUNKS_PER_SOURCE`** (e.g. 3, tunable) chunks per file to avoid one file
  crowding out others, while still surfacing several passages from the most relevant file.
- Preserve focus-pass-first ordering (attached files rank ahead).
- **Citations become per (source, page):** build one citation entry per distinct
  `(sourceId, pageRange)` actually used, each with its signed URL. The chat panel already
  renders multiple badges and jumps each to its own page — so "Lecture5 p. 7" and
  "Lecture5 p. 12" become two clickable citations.
- Consider raising `match_count` (e.g. 8 → 12–15) since chunks are smaller; tunable.

### 4.5 Evidence-quote prompt (`prompts.ts`)

Extend `buildSystemPrompt` so the model, when it uses a passage, **quotes the exact sentence
in a markdown blockquote** and attributes it inline as `(File name, p. N)`, in addition to the
existing `[Sources]` block. Keep existing rules ("match the question's language", "never
fabricate citations", "tutor, don't just answer"). The model already receives each chunk's
`segment_text`, so verbatim quoting is grounded — this part works the moment the prompt ships,
independent of the page work.

### 4.6 Citation → viewer (no change required)

Already built (§2): `pageRange` → parsed page → `onOpenSource(type, id, page)` → `FileViewer`
with `initialPage`. Once §4.1–4.4 emit real page numbers, jump-to-page works end to end. Only
touch this code if per-(source,page) citations need a display tweak (e.g. showing the page on
the badge label).

## 5. Data model

**No schema change.** `content_embeddings.page_start` / `page_end` already exist and are
returned by `match_embeddings`. We start writing real values instead of `null`. With ~15×
more rows per file, the existing pgvector index continues to work (more, smaller vectors is
the normal and preferred shape for ANN search).

## 6. Migration / backfill

Existing rows have `page_start/page_end = null` and oversized, truncated embeddings; they must
be rebuilt (page numbers can't be recovered from the flat `segment_text` already stored).

- **Mechanism:** reuse `reindexCourse` (clears `content_hash`) to force re-extract + re-embed
  on the next index run, plus a **backfill driver** (extend the existing `/api/ai/reindex`
  route or a one-off admin script) that iterates each `(source_type, source_id)` and calls
  `indexContent`. `upsertEmbeddings` already deletes prior rows per source, so re-runs are
  idempotent.
- **Throttling:** process sources sequentially / in a small concurrency pool; the per-file
  embedding-call count is now ~15×, so unbounded parallelism would hit rate limits.
- **Cost (one-time):** ~$0.02/file (re-extraction dominates; embedding adds <$0.001/file).
  ~$10 per 500 files. Pays back after ~4 Flash / ~1 Pro questions that touch the file.
- **Cutover:** the new code reads pages when present and degrades to `null` when absent, so
  the backfill can run gradually — un-backfilled files simply behave as they do today until
  reprocessed.

## 7. Cost & efficiency (justification)

Verified pricing (May 2026): Flash $0.30/1M in · Pro $1.25/1M in · Embedding $0.15/1M
([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).

- **Per query (recurring win):** context drops from ~20k tokens (up to 50–87k worst case) of
  blob to ~4k tokens of relevant chunks → **~16k fewer input tokens/question**.
  ≈ **$0.005/question (Flash)** / **$0.020/question (Pro)** saved. At 10k questions/month:
  ~$48 (Flash) / ~$200 (Pro).
- **Index side (small increase):** ~15× more embedding *calls*, ~3× more embedding *tokens*
  per file (because today truncates) — but embeddings are ~100× cheaper/token than
  generation, so absolute cost is negligible. Main concern is rate-limit pressure → throttle.
- **Honest framing:** absolute savings are modest at low volume; the primary justification is
  the **correctness fix** (un-truncating search) and **enabling the feature**, with cost as a
  favorable side effect that scales with usage.

## 8. Tunable parameters (single source of truth)

| Constant | Start | Purpose |
|---|---|---|
| `CHUNK_CHAR_BUDGET` | 1600 (~400 tok) | embedding/citation granularity |
| `CHUNK_CHAR_OVERLAP` | 200 | continuity across intra-page splits |
| `MAX_CHUNKS_PER_SOURCE` | 3 | stop one file dominating context |
| `match_count` | 12 | candidates retrieved per pass |

## 9. Testing plan

**Unit (Vitest)**

- Chunker: page merging (tiny slides → range), single-page split with overlap, page-less
  (DOCX) path, budget boundaries, `chunkIndex` continuity, `pageStart/pageEnd` correctness.
- Extraction: structured pages parsed in order; page-count validation guard triggers flat
  fallback on mismatch.
- `buildAiContext`: multiple chunks per source retained (cap respected), per-(source,page)
  citations built, focus-first ordering preserved, `pageRange` formatted ("p. N", "p. N–M").
- Prompt: evidence-quote + inline `(File, p. N)` instruction present.

**Integration (local Supabase)**

- Index a multi-page PDF → multiple `content_embeddings` rows with non-null, monotonic
  `page_start/page_end`; re-index is idempotent (old rows deleted).
- `match_embeddings` returns several chunks from the same file with distinct pages.
- DOCX indexes with `page_start/page_end = null` and still retrieves.

**E2E (Playwright) — real user flows, shared `e2e/helpers/auth.ts`, no `test.skip`**

1. **Evidence quote**: log in → open a course document → ask a question → the AI answer
   contains a blockquote and an inline `(file, p. N)` citation. (AI mocked via `page.route`
   per the no-Gemini-key-in-CI pattern; mock returns a quote + page citation.)
2. **Jump to page**: answer renders a source badge with a page → click it → `FileViewer`
   opens scrolled to that page (`#ctx-pdf-page-N` in view).
3. **Multiple pages from one file**: a mocked answer with two citations to the same file at
   different pages renders two badges, each jumping to its own page.

- Update `e2e/TEST_REGISTRY.md` with these scenarios before writing the tests.

**Full suite gate:** `pnpm test && pnpm test:integration && pnpm test:e2e` must pass.

## 10. Phasing (incremental, each testable)

1. **Prompt only** — evidence-quote instruction in `buildSystemPrompt`. Ships immediately,
   no migration; delivers "show evidence" using existing (whole-file) chunks. (Quick win.)
2. **Extraction + chunker** — `extractPdfPages` + page-aware budgeted chunker + unit tests.
3. **Indexing** — wire pages through `indexContent`; integration tests on real rows.
4. **Retrieval** — multi-chunk-per-file dedupe + per-(source,page) citations + `match_count`
   bump; verify jump-to-page end to end (UI already built).
5. **Backfill** — reindex driver + throttling; reprocess existing materials.
6. **Tests** at every level + `TEST_REGISTRY.md`; run the full suite.

## 11. Risks / open items

- **Embedder cap for `-2-preview`** — confirm the exact input token limit; keep
  `CHUNK_CHAR_BUDGET` well under it (1600 chars ≈ 400 tok is safe even at a 2 048 cap).
- **Gemini page attribution accuracy** — structured per-page output can mis-split/miscount on
  dense or oddly-laid-out PDFs; the page-count validation guard (§4.1) bounds the blast radius
  by falling back to page-less extraction rather than emitting wrong pages.
- **Rate limits on backfill** — ~15× embedding calls/file; must throttle (§6).
- **Chunk size is a guess until measured** — exposed as tunable constants (§8); validate with
  real queries and adjust before/after backfill.
- **Retrieval recall with smaller chunks** — smaller chunks can fragment context; mitigated by
  intra-page overlap, `MAX_CHUNKS_PER_SOURCE`, and a higher `match_count`. Re-measure.
- **Stale-read caution** — implementation must re-read target files fresh before editing.
