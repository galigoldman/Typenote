# Evidence Citations & Page-Accurate Sources — Design

- **Date:** 2026-05-27
- **Status:** Approved — **revised 2026-05-27 after subagent review** (corrections folded in;
  see the ⚠️ markers and §12 changelog)
- **Decisions locked (2026-05-27):** (1) **text-only embeddings for v1** — multimodal/image
  embedding deferred to §13 (clean later add since the model is already multimodal);
  (2) **course-material indexing is in scope** (close the dead-branch gap); (3) **faithful
  text extraction** — no model-generated figure descriptions (image-only pages → page citation,
  no quote).
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

1. **Per-page extraction** — ask Gemini for structured per-page text instead of one blob,
   keeping today's **faithful, text-only** instruction (LaTeX + Hebrew preserved; *no*
   invented figure descriptions — see §4.0).
2. **Small, page-tagged, math-aware chunks** — replace the 25 000-char "one chunk per file"
   with a ~1 600-char budget, each chunk tagged with the page(s) it covers, **never splitting
   through a LaTeX expression.**
3. **Retrieve multiple chunks per file** — remove the dedupe-by-file limit so several
   relevant passages (and their pages) reach the model.
4. **Evidence-quote prompt** — instruct the model to quote the verbatim passage it used (when
   the page has faithful text to quote) and always cite `(File, p. N)`.

The citation UI is already done: `FileViewer` accepts `initialPage` and the chat panel turns
`pageRange` into a jump-to-page click. They simply start receiving real page numbers.

Secondary benefits: **sharper retrieval** (one vector for a ~6k-token multi-topic blob is a
mushy average; small focused chunks discriminate better) and **lower per-query cost** (small
relevant chunks instead of giant blobs in the prompt). ⚠️ Note: an earlier draft justified
this as fixing an embedder *truncation* bug — that was based on the old `gemini-embedding-001`
2 048-token cap. The live model `gemini-embedding-2-preview` allows **8 192 tokens**, so
today's ~6 250-token chunks are **not** truncated (a dense Hebrew chunk near the 25k-char
limit is the only edge case). The justification is dilution + page location + prompt cost, not
truncation.

## 2. Background / current state (verified against `dev`)

- **Chunking:** `src/lib/ai/embeddings.ts` — `MAX_CHARS_PER_CHUNK = 25000` (~6 000 tokens).
  `chunkText` only splits files *above* that limit; in practice each file → **one chunk**.
- **Embedding:** `embedText`/`embedQuery` use `gemini-embedding-2-preview`, 1 536 dims,
  asymmetric task types (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`) — keep this.
  - **Input cap:** `gemini-embedding-2-preview` allows **8 192 input tokens**
    ([docs](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview)), 4× the
    old `gemini-embedding-001` (2 048). Today's ≤25 000-char chunks (~6 250 tokens) are
    therefore **not truncated** — correcting an earlier draft assumption. The only edge case is
    very dense non-Latin text (Hebrew/CJK ≈1–2 chars/token) near the 25k limit, which can
    approach/exceed 8 192. Smaller chunks keep us comfortably clear regardless.
  - **Multimodal:** this model is **natively multimodal** (text/image/video/audio, ≤6
    images/request). We use it in text mode; this leaves the door open to image-based options
    (see §13 Alternatives).
- **Extraction:** `src/lib/ai/extraction/pdf.ts` sends the whole PDF to `gemini-2.5-flash`
  multimodal and returns **one flat string** — no page structure. The prompt explicitly asks
  to preserve LaTeX and handle Hebrew (`pdf.ts:29`); it is this multimodal step that also
  reads scanned/image slides. `extraction/docx.ts` (mammoth) returns flat text, no pages.
- **Indexing:** `indexContent` in `src/lib/actions/ai-context.ts` extracts → `chunkText` →
  `embedText` per chunk → `upsertEmbeddings`. It **hardcodes `page_start: null,
  page_end: null`** (~lines 289-290). `upsertEmbeddings` deletes prior rows for the source
  then inserts in batches of 20 (`src/lib/queries/embeddings.ts`).
- ⚠️ **`course_material` is never indexed today.** The only `indexContent` callers pass
  `moodle_file` (`moodle/upload/route.ts:141,185`, `moodle/upload-finalize/route.ts:125,167`,
  `moodle/import-existing/route.ts:111`) and `personal_file` (`personal-files.ts:48`). The
  `course_material` branch (`ai-context.ts:178-209`) is **dead** — directly-uploaded course
  materials are not searchable, and attaching one as a focus file retrieves nothing. This is a
  pre-existing gap this feature must address (§6, §11).
- **Retrieval:** `searchContext` → `matchEmbeddings` RPC (`match_count` default 8, threshold
  0.3). ⚠️ The **live** RPC signature is in
  `supabase/migrations/20260526120000_document_context_files.sql:66-105` (params include
  `match_moodle_course_id`, `match_imported_moodle_file_ids`, `match_source_ids`; no
  `week_id`). It returns `segment_text, page_start, page_end, source_type, source_id,
  source_name, mime_type, similarity` and supports the focus filter. Read this migration, not
  the older `00012`/`00014`.
- **Context assembly:** the **live** path is `buildAiContext` (used by `POST /api/ai/ask`,
  `ask/route.ts:4,312`). ⚠️ `askQuestion` (`ai-context.ts:373-530`) is a **dead** legacy twin
  that also has the dedupe loop and hardcodes `pageRange: null` — delete it or update it too,
  don't leave it diverging. `buildAiContext` runs a **focus pass** (attached files via
  `match_source_ids`) + a **course-wide pass**, concatenates, then **dedupes by `source_id`**
  (`if (r.segmentText && !seen.has(r.sourceId))`, ~line 604) — keeping **only one chunk per
  file**. It computes `pageRange` from `page_start/page_end` (~line 607, always `null` today)
  and generates signed URLs per source (~lines 631-700).
- **Prompt:** `src/lib/ai/prompts.ts` `buildSystemPrompt` tells the model to cite materials
  and lists a `[Sources]` block, but does **not** ask for verbatim evidence quotes.
- **Citation UI (already built):**
  - `src/components/dashboard/file-viewer.tsx` — `FileViewerProps.initialPage` (**0-indexed**);
    renders page canvases with id `#ctx-pdf-page-${i-1}` (`file-viewer.tsx:86`) and on load
    scrolls to `#ctx-pdf-page-${initialPage}` (~line 50).
  - `src/components/ai/ai-chat-panel.tsx` — renders each source as a badge, parses the first
    number out of `pageRange` and **subtracts 1** (`~line 628`), then calls
    `onOpenSource(sourceType, sourceId, page)` (~line 638), else falls back to the signed URL.
  - `src/components/ai/markdown-response.tsx` — renders answers with `remark-math` +
    `rehype-katex` (LaTeX works), but ⚠️ sets **no `dir` attribute** (RTL hazard, §4.5).
- ⚠️ **Page-index contract:** `pageRange` is built as `pageStart + 1`, the badge shows human
  "p. N", the chat subtracts 1, and the viewer id is 0-indexed. So **stored `page_start`/
  `page_end` are 0-indexed.** Extraction returns Gemini's 1-indexed page → **subtract 1 when
  storing** (§4.3), or jump-to-page is off by one.
- **Schema:** `content_embeddings.page_start`/`page_end` originate in
  `00012_create_content_embeddings.sql:14-15` (the unrelated `00007_add_pages_column.sql` adds
  a `pages` JSONB to **`documents`** for canvas data — not embeddings). **No schema change
  needed.**

> Note: line numbers are from reads taken this session and will be re-verified before
> editing — the harness served some stale reads, so the implementation must read fresh.

## 3. Goals / non-goals

**Goals**

- Produce and store **0-indexed page numbers** for every PDF/slide chunk.
- **Smaller, page-tagged, math-aware chunks** (~400 tokens) that stay under the embedder's
  input cap and give sharp, discriminative vectors.
- Retrieve **multiple chunks per file** so the best passages (and their pages) reach the model.
- A prompt that makes the model **quote its evidence when faithful text exists** and always
  cite `(File, p. N)`.
- **Index course materials** (close the dead-branch gap) and provide a **one-time backfill**
  that re-extracts + re-embeds existing moodle/personal content.

**Non-goals (this iteration)**

- Pixel-exact text highlighting inside the PDF (we jump to the *page*; sentence-level
  highlight via the viewer's text layer is a later enhancement).
- Changing the embedding model, the `match_embeddings` RPC signature, or the DB schema.
- Page numbers for DOCX (no native pages) — DOCX chunks keep `page_start/page_end = null` and
  cite by file name, as today. Graceful degradation.
- ⚠️ **Handwriting / freehand strokes in the student's own note are invisible to the AI.**
  `documentContent` is built by `extractNodeText` over TipTap JSON (text + math nodes only);
  strokes in the `pages` JSONB layer are never sent. Evidence/quoting covers **typed content
  and course materials**, not the student's freehand work. (Longer term: rasterize the stroke
  layer and send it via the existing `imageData` multimodal path, `ai-context.ts:767-774`.)

## 4. Design

### 4.0 Images & handwriting — today vs proposed (no regressions)

The design **reuses the existing multimodal Gemini extraction** (we are *not* switching to a
pdf.js text layer), so nothing the AI can "see" today gets lost. Concretely:

| Content | Today | Proposed |
|---|---|---|
| Strokes/handwriting in the student's **own note** | Invisible (`documentContent` = text+math via `extractNodeText`) | **Unchanged — invisible** (non-goal, §3) |
| Pasted **images in the student's own note** | Invisible (only the explicit `imageData` screenshot path sends an image) | **Unchanged — invisible** |
| **Text** in course PDFs (incl. handwriting OCR'd from scans) | Extracted, but truncated past ~2048 tok, one chunk, no page | **Fully extracted, per-page, locatable** (improvement) |
| **Figures/diagrams** (image-only) in course PDFs | Not captured — prompt is "text as written, no commentary" | **Decision (§4.1): default text-only (unchanged); page citation, no quote** |

⚠️ **Decision — figure descriptions.** Today's extractor is deliberately faithful ("extract
text exactly as written… no commentary", `pdf.ts:29`). Adding model-generated figure
descriptions would improve coverage of diagram-heavy slides **but** produces prose the source
never literally contained — which an *evidence/quote* feature must not present as verbatim.
**Default: keep faithful text-only.** Image-only pages therefore get a **page citation with no
blockquote** (consistent with §4.5's quote-optional rule). Revisit only if diagram retrieval
proves necessary, and then label such content as a paraphrase, never a quote.

### 4.1 Per-page extraction (`extraction/pdf.ts`)

Change `extractPdfText` to request **structured per-page output** from Gemini using a response
schema, returning `Array<{ page: number; text: string }>` (Gemini's `page` is 1-indexed, in
document order). The prompt must **explicitly retain** today's faithful behavior: extract all text **exactly
as written**, **preserve math as `$...$`/`$$...$$` LaTeX**, handle **Hebrew** — and **no
invented figure descriptions / commentary** (per the §4.0 decision). Handwriting in scanned
pages is still OCR'd to text by the multimodal model, exactly as today.

- New exported `extractPdfPages(buffer): Promise<PageText[]>`; keep a thin `extractPdfText`
  wrapper (`pages.map(p => p.text).join('\n\n')`) for any flat-text caller.
- ⚠️ **Server-side page count:** the validation guard needs the PDF's real page count, but the
  repo's `pdfjs-setup.ts` is **browser-only** (sets `workerSrc` to a public URL). `indexContent`
  is `'use server'`. Use a Node-safe page count (`pdf-lib`'s `getPageCount()`, or `pdfjs-dist`
  legacy build with `disableWorker`) — do **not** import the browser setup server-side.
- **Validation guard:** compare returned page count to the real count. On mismatch beyond a
  small tolerance, fall back to flat extraction with `page = null` (degrade rather than emit
  wrong pages). Log it.
- ⚠️ **Large-PDF risk:** a single structured call over a very long PDF can hit **output-token
  limits and silently drop trailing pages** — and the guard then falls back to page-less,
  losing pages for exactly the big docs that need them. For PDFs over ~N pages (tunable, e.g.
  50), extract in **page-range batches** and concatenate, so no single call is output-bound.
- DOCX path unchanged: flat text → single "page-less" stream (§4.2).

### 4.2 Math-aware chunking with page tags (`embeddings.ts`)

Replace the 25 000-char `chunkText` with a page-aware, math-aware budgeted chunker:

```
CHUNK_CHAR_BUDGET = 1600   // ≈ 400 tokens for Latin text; see language note below
CHUNK_CHAR_OVERLAP = 200   // overlap only within a single page's sub-chunks
```

Algorithm over `PageText[]`:

- Greedily **merge consecutive pages** into a buffer until adding the next page would exceed
  `CHUNK_CHAR_BUDGET`; flush tagged `page_start = firstPage`, `page_end = lastPage` (**stored
  0-indexed** — subtract 1 from Gemini's 1-based page). Tiny title-only slides combine →
  citation "p. 11–12".
- If a **single page exceeds** the budget, split it into sub-chunks with `CHUNK_CHAR_OVERLAP`,
  all tagged that page.
- ⚠️ **Never split inside a math span.** When choosing a split point, reject any boundary that
  falls inside `$...$`, `$$...$$`, or `\[...\]` (e.g. reject a position with an odd count of
  unescaped `$` before it). If a single math span alone exceeds the budget, **keep it whole**
  as an over-budget chunk rather than bisecting it (a broken `$$` poisons the embedding and
  renders as a KaTeX error in the quote).
- Page-less input (DOCX / fallback): budgeted, math-aware split with `page_start/page_end =
  null`.

Output `TextChunk { text, chunkIndex, pageStart, pageEnd }` (pageStart/pageEnd 0-indexed or
null). ⚠️ **Char/token ratio is language-dependent:** ~4 chars/token holds for Latin scripts;
Hebrew/CJK run **~1–2 chars/token**, so a 1 600-char Hebrew chunk can be 800–1 600 tokens —
still under the cap, but each chunk carries less meaning, so Hebrew may need a higher
`MAX_CHUNKS_PER_SOURCE` / `match_count`. Validate recall on a Hebrew deck; don't assume the
Latin ratio. All four constants in §8 are tunable.

### 4.3 Indexing (`indexContent`)

- Call `extractPdfPages` for PDF/PPTX; build `PageText[]` (DOCX → single page-less entry).
- Run the new chunker; set **0-indexed** `page_start`/`page_end` per chunk (replacing the
  hardcoded `null`s).
- ⚠️ **Wire up `course_material` indexing** so the dead branch is actually called (see §6).
- **Embedding-call volume:** ~15 small embeds per slide deck instead of 1. Embeds are cheap,
  but bulk work must **throttle** — embed in a small concurrency-limited pool; keep the 20-row
  insert batching. Preserve the invariant that all chunks of a source share
  `source_type`/`source_id`/`user_id` (so `upsertEmbeddings`'s delete-by-`rows[0]` and
  admin-vs-user client selection stay correct).

### 4.4 Retrieval — allow multiple chunks per file (`buildAiContext`)

The current dedupe-by-`source_id` keeps only one chunk per file — correct when a file was one
chunk, wrong now. Change to:

- Dedupe by **chunk identity** (row `id`, or `source_id` + `segment_index`), not by file.
- Keep up to **`MAX_CHUNKS_PER_SOURCE`** (e.g. 3, tunable) chunks per file so one file can't
  crowd out others.
- Preserve focus-pass-first ordering (attached files rank ahead).
- ⚠️ **Bound the assembled context.** With multi-chunk retrieval, `materialsText`
  (`ai-context.ts:730`) has no cap (unlike the 50k `MAX_DOC_CHARS` doc cap). It's bounded in
  practice (~`match_count` × budget × 2 passes ≈ 38k chars at the defaults) — make that cap
  explicit.
- **Citations become per `(source, page)`:** build one citation entry per distinct
  `(sourceId, pageRange)` actually used. ⚠️ **The signed-URL fetch must dedupe by `sourceId`**
  — today `ai-context.ts:631-700` maps over `sourceIds` 1:1, which would now re-sign the same
  file once per chunk. Fetch one signed URL per distinct file and fan it out to that file's
  citation entries.
- Consider raising `match_count` (e.g. 8 → 12–15) since chunks are smaller; tunable.
- ⚠️ Apply the same changes to `askQuestion` **or delete it** (§2) so the two builders don't
  diverge.

### 4.5 Evidence-quote prompt + safe rendering (`prompts.ts`, `markdown-response.tsx`)

Extend `buildSystemPrompt` so that:

- **Always** attribute a used passage inline as `(File name, p. N)` plus the existing
  `[Sources]` block.
- **Quote is optional, citation is required.** When a page has faithful text, quote the exact
  sentence in a markdown blockquote. ⚠️ When a page is **image-only / low-text** (scanned slide,
  figure), instruct the model to **omit the blockquote** and cite the page only — never
  fabricate a quote (consistent with the existing "never fabricate citations" rule).
- Keep existing rules (match the question's language, tutor don't dump, never fabricate).

Rendering hardening (so a quote can't break the UI):

- ⚠️ **Math:** set `rehype-katex` `throwOnError: false` (and `strict: false`) in
  `markdown-response.tsx` so a malformed `$$` from a quoted fragment degrades to literal text
  instead of a red error / blanked message.
- ⚠️ **RTL:** add `dir="auto"` to the markdown wrapper and to blockquote/list elements, and
  wrap the inline `(File, p. N)` citation in an **LTR isolate** (`<span dir="ltr">` or
  `⁦…⁩`) so an LTR citation doesn't corrupt the order of a surrounding Hebrew quote.

The model already receives each chunk's `segment_text`, so a faithful quote is grounded — the
prompt part works the moment it ships, independent of the page work.

### 4.6 Citation → viewer (small change, not "none")

The jump chain is built (§2): `pageRange` → parsed page → `onOpenSource(type, id, page)` →
`FileViewer` `initialPage`. Once §4.1–4.4 emit real 0-indexed pages, jump-to-page works end to
end. ⚠️ The citation **array shape changes** to per-`(source, page)`, so verify the chat
renders multiple badges for the same file at different pages (it maps over `sources`, so it
should) and that nothing upstream de-dupes them by file. Optionally show the page on the badge
label.

## 5. Data model

**No schema change.** `content_embeddings.page_start`/`page_end` already exist
(`00012_create_content_embeddings.sql`) and are returned by `match_embeddings`
(`20260526120000_document_context_files.sql`). We start writing real **0-indexed** values
instead of `null`. With ~15× more rows per file, the existing pgvector index continues to work
(more, smaller vectors is the normal, preferred shape for ANN search).

## 6. Indexing gaps + migration / backfill ⚠️ (rewritten after review)

Two distinct problems:

1. **Course materials were never indexed** (§2). Add an `indexContent({ type:
   'course_material', ... })` call to the course-material upload path (mirroring the moodle /
   personal-file callers) so new uploads are indexed going forward.
2. **Existing rows are stale** — `null` pages + oversized/truncated embeddings — and **cannot
   be fixed lazily.** `POST /api/ai/reindex` today only **deletes all rows** and tells the user
   to re-sync; `reindexCourse` only clears `content_hash` and depends on a **manual moodle
   re-sync** to re-drive `indexContent`. There is no automatic re-trigger for personal files or
   course materials. So "gradual cutover" is **not** real today.

**Required: a real backfill driver** (new server action / admin endpoint) that:

- Enumerates every indexed source — distinct `(source_type, source_id)` in
  `content_embeddings` — **plus every not-yet-indexed course material** — and calls
  `indexContent` for each. `upsertEmbeddings` deletes prior rows per source, so re-runs are
  idempotent.
- Runs with a **concurrency limit** (the per-file embedding-call count is now ~15×; unbounded
  parallelism hits rate limits).
- Is resumable/observable (log per-source success/skip/error), since this touches all content.

**Cost (one-time):** ~$0.02–0.03/file — re-extraction dominates, and structured per-page output
is a *longer* generation than today's flat extract, so output tokens rise too. ~$10–15 per 500
files. Pays back after ~4 Flash / ~1 Pro questions that touch the file.

**Cutover:** the new read path uses pages when present and degrades to `null`/file-name
citation when absent, so un-backfilled files behave as today until the driver reprocesses them.

## 7. Cost & efficiency (justification)

Verified pricing (May 2026): Flash $0.30/1M in · Pro $1.25/1M in · Embedding $0.15/1M
([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).

- **Per query (recurring win):** context drops from ~20k tokens (up to 50–87k worst case) of
  blob to ~4k tokens of relevant chunks → **~16k fewer input tokens/question**.
  ≈ **$0.005/question (Flash)** / **$0.020/question (Pro)** saved. At 10k questions/month:
  ~$48 (Flash) / ~$200 (Pro).
- **Index side (small increase):** ~15× more embedding *calls*, ~3× more embedding *tokens*
  per file; embeddings are ~100× cheaper/token than generation, so absolute cost is negligible.
  Structured extraction adds some output tokens. Main concern is rate-limit pressure → throttle.
- **Honest framing:** absolute savings are modest at low volume; the primary justification is
  **enabling the feature** (page-accurate evidence), plus **sharper retrieval** (less vector
  dilution) and **indexing course materials at all** — with cost as a favorable side effect
  that scales with usage. (Not truncation — see §1/§2.)

## 8. Tunable parameters (single source of truth)

| Constant | Start | Purpose |
|---|---|---|
| `CHUNK_CHAR_BUDGET` | 1600 (~400 tok Latin; more for Hebrew/CJK) | embedding/citation granularity |
| `CHUNK_CHAR_OVERLAP` | 200 | continuity across intra-page splits |
| `MAX_CHUNKS_PER_SOURCE` | 3 | stop one file dominating context |
| `match_count` | 12 | candidates retrieved per pass |
| `BATCH_EXTRACT_PAGE_THRESHOLD` | 50 | split extraction into page ranges above this |

## 9. Testing plan

**Unit (Vitest)**

- Chunker: page merging (tiny slides → range), single-page split with overlap, page-less
  (DOCX) path, budget boundaries, `chunkIndex` continuity, **0-indexed** `pageStart/pageEnd`
  correctness, and ⚠️ **boundary never lands inside `$...$`/`$$...$$`/`\[...\]`** + over-budget
  math span kept whole.
- Extraction: structured pages parsed in order; page-count validation guard triggers flat
  fallback on mismatch; LaTeX + Hebrew + **faithful "no figure commentary"** instructions
  present; ⚠️ a **Hebrew sample** survives the JSON round-trip; large-PDF batching path.
- `buildAiContext`: multiple chunks per source retained (cap respected), per-`(source,page)`
  citations built, signed-URL fetch **deduped by `sourceId`**, focus-first ordering preserved,
  `pageRange` formatted ("p. N", "p. N–M"), context size bounded.
- Prompt: evidence-quote (optional) + always-inline `(File, p. N)` instruction; omit-quote on
  low-text pages.

**Integration (local Supabase)**

- Index a multi-page PDF → multiple rows with non-null, monotonic **0-indexed**
  `page_start/page_end`; re-index idempotent (old rows deleted).
- ⚠️ Index a **course material** end to end (was never indexed before).
- `match_embeddings` returns several chunks from the same file with distinct pages.
- DOCX indexes with `page_start/page_end = null` and still retrieves.

**E2E (Playwright) — real user flows, shared `e2e/helpers/auth.ts`, no `test.skip`**

1. **Evidence quote**: log in → open a course document → ask → answer contains a blockquote +
   inline `(file, p. N)`. (AI mocked via `page.route` per the no-Gemini-key-in-CI pattern.)
2. **Jump to page**: click a source badge with a page → `FileViewer` opens scrolled to that
   page (`#ctx-pdf-page-N` in view); assert the **0-index/1-index** mapping lands on the right
   page.
3. **Multiple pages from one file**: a mocked answer with two citations to the same file at
   different pages renders two badges, each jumping to its own page.
4. ⚠️ **RTL render**: a mocked Hebrew answer with a quote + `(file, p. N)` renders with
   correct direction (no bidi-jumbled citation).

- Update `e2e/TEST_REGISTRY.md` with these scenarios before writing the tests.
- ⚠️ Add a `MarkdownResponse` unit test: malformed `$$` from a quote degrades to literal text
  (no KaTeX crash); RTL `dir="auto"` + LTR-isolated citation.

**Full suite gate:** `pnpm test && pnpm test:integration && pnpm test:e2e` must pass.

## 10. Phasing (incremental, each testable)

1. **Prompt + render hardening** — evidence-quote (optional) instruction in
   `buildSystemPrompt`; `rehype-katex` `throwOnError:false`; `dir="auto"` + LTR-isolated
   citations in `MarkdownResponse`. Ships immediately, no migration; delivers "show evidence"
   on existing (whole-file) chunks, safely for Hebrew/math. (Quick win.)
2. **Extraction + math-aware chunker** — `extractPdfPages` (with server-side page count,
   batching for big PDFs) + the chunker + unit tests.
3. **Indexing** — wire pages (0-indexed) through `indexContent`; **add course-material
   indexing**; integration tests on real rows.
4. **Retrieval** — multi-chunk-per-file dedupe + per-`(source,page)` citations +
   signed-URL dedupe + `match_count` bump; verify jump-to-page end to end. Update/delete
   `askQuestion`.
5. **Backfill** — the real reindex driver + throttling; reprocess existing materials and index
   course materials.
6. **Tests** at every level + `TEST_REGISTRY.md`; run the full suite.

## 11. Risks / open items

- ✅ **Decided: course-material indexing is in scope** (one `indexContent` call + backfill).
  Was previously unindexed (dead branch), so course-material citations were impossible.
- **Embedder cap** — `gemini-embedding-2-preview` = 8 192 tokens (verified); `CHUNK_CHAR_BUDGET`
  of 1600 chars is far under it for any language.
- ⚠️ **Server-side page counting** — the repo's pdf.js is browser-only; need a Node-safe count
  (`pdf-lib`/legacy `pdfjs-dist`). New dependency surface.
- ⚠️ **Large-PDF extraction** — single structured call can hit output limits and drop trailing
  pages; mitigated by page-range batching (§4.1) + the validation guard.
- **Gemini page-attribution accuracy** — structured output can mis-split on dense/odd layouts;
  the validation guard bounds the blast radius by falling back to page-less.
- ⚠️ **Math-span integrity** — chunker must not bisect LaTeX; covered by §4.2 + tests.
- ⚠️ **Hebrew** — language-dependent token budget (recall) and RTL rendering (bidi); covered by
  §4.2 / §4.5 + tests.
- ⚠️ **Drawings** — student handwriting is invisible to the AI (non-goal, §3); image-only
  course pages get page citation without a quote (§4.5).
- **Rate limits on backfill** — ~15× embedding calls/file; must throttle (§6).
- **Chunk size is a guess until measured** — exposed as tunable constants (§8); validate with
  real queries (incl. a Hebrew deck) and adjust.
- **Stale-read caution** — implementation must re-read target files fresh before editing.

## 12. Changelog — 2026-05-27 post-review revisions

Folded in after a subagent review verified against the code:

- §2/§6: `/api/ai/reindex` only **deletes**; **`course_material` is never indexed** (dead
  branch) — backfill rewritten + course-material indexing added to scope.
- §2/§4.3/§5: **page index is 0-based** in storage — store `geminiPage − 1` (off-by-one fix).
- §4.2: **math-aware chunking** (never split inside `$…$`/`$$…$$`/`\[…\]`); **language-dependent
  char/token ratio** for Hebrew/CJK.
- §4.5: evidence **quote optional / citation required** (image pages); **KaTeX
  `throwOnError:false`**; **RTL `dir="auto"` + LTR-isolated citations**.
- §4.1: **server-side** page counting (repo pdf.js is browser-only); **batch extraction** for
  large PDFs (output-token limit).
- §4.4/§4.6: signed-URL fetch **deduped by `sourceId`**; per-`(source,page)` citation shape;
  `askQuestion` is dead — update or delete.
- §2 corrections: `00007` is `documents.pages` (not embeddings); live `match_embeddings` is in
  `20260526120000_document_context_files.sql`.
- §3: added non-goal — **handwriting/strokes in the student's own note are invisible to the AI.**
- §4.0 (new): **images & handwriting today-vs-proposed contrast** (no regressions); reverted the
  accidental "describe figures" change — **default faithful text-only**, image pages get a page
  citation with no quote.
- §1/§2/§7/§11: **corrected the truncation claim** — `gemini-embedding-2-preview` allows 8 192
  tokens (not 2 048), so current chunks aren't truncated; justification reframed to dilution +
  page location + prompt cost. Added §13 (multimodal/image-embedding alternatives).

## 13. Alternatives considered — multimodal / image embeddings

**Could we embed PDF pages as images (to capture diagrams) instead of extracting text?**
Yes — `gemini-embedding-2-preview` is natively multimodal (≤6 images/request), so a rendered
page image can be embedded as a single 1536-dim vector in the same space as text queries,
working in pgvector unchanged. **Not chosen as the primary path because:**

- **Evidence quotes require text.** An image embedding finds the right page but yields no
  quotable sentence; the feature's core ("show the exact sentence") still needs extracted
  text. So image embedding is *additive*, not a replacement → more cost, two pipelines.
- **Text-heavy slides** retrieve at least as well from extracted text; image embedding's unique
  win is pure-figure pages (the minority for lecture decks).
- **Cost/complexity:** server-side page rasterization (Hebrew/math fonts) + higher
  image-embedding rates + keeping the text pipeline.
- **ColPali-style multi-vector visual retrieval** is SOTA for visual docs but needs ~1000× the
  vectors and late-interaction (MaxSim) scoring pgvector doesn't do natively — out of scope.

**Kept as future options (clean because the model is already multimodal):**

1. **Answer-time grounding (cheap, recommended next):** for a figure-heavy cited page, attach
   that page's image to the *generation* call via the existing `imageData` path so the model
   can see the diagram — no retrieval changes.
2. **Per-page image embedding as a 2nd vector** (later, only if diagram *retrieval* proves
   weak): store an image-modality row per page alongside the text chunks; same table/pgvector.
