# Tasks: Course Context Engine (v2 — Multimodal Embedding 2)

**Input**: Design documents from `/specs/006-course-context-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ai-context-api.md, quickstart.md

**Tests**: Required per constitution (Principle II: Test-Driven Quality).

**Organization**: Tasks grouped by user story. US1+US2 are P1 (co-dependent), US3+US4 are P2.

**Key change from v1**: Embedding 2 multimodal replaces Embedding 001 text-only. PDFs/PPTX embedded directly (no text extraction). Raw PDFs sent to Gemini for answering. 1,536 dimensions. `unpdf`, `jszip`, `chunker.ts` removed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3, US4)

## Phase 1: Setup

**Purpose**: Clean up v1 code, update dependencies and migrations for Embedding 2

- [x] T001 Remove unused dependencies: `pnpm remove unpdf jszip`
- [x] T002 Delete `src/lib/ai/extraction/pdf.ts` and `src/lib/ai/extraction/__tests__/pdf.test.ts`
- [x] T003 Delete `src/lib/ai/extraction/pptx.ts` and `src/lib/ai/extraction/__tests__/pptx.test.ts`
- [x] T004 Delete `src/lib/ai/chunker.ts` and `src/lib/ai/__tests__/chunker.test.ts`
- [x] T005 Rewrite migration `supabase/migrations/00012_create_content_embeddings.sql` — VECTOR(1536), page segments, get_week_file_refs
- [ ] T006 Run `sudo supabase db reset` to verify updated migration chain (needs local Supabase)

**Checkpoint**: Clean slate — old text extraction code removed, migrations updated for multimodal

---

## Phase 2: Foundational (Core Multimodal Utilities)

**Purpose**: Embedding 2 multimodal API wrappers and DB queries. MUST complete before user stories.

- [x] T007 [P] Update `src/lib/ai/provider.ts` — gemini-embedding-2-preview
- [x] T008 [P] Rewrite `src/lib/ai/embeddings.ts` — embedFileSegment, embedText, embedQuery via @google/genai with 1536 dims
- [x] T009 [P] Keep `src/lib/ai/extraction/docx.ts` unchanged
- [x] T010 Rewrite `src/lib/queries/embeddings.ts` — page segments, matchEmbeddings 1536, getWeekFileRefs
- [x] T011 [P] Rewrite unit test `src/lib/ai/__tests__/embeddings.test.ts`
- [x] T012 Rewrite integration test `src/lib/queries/__tests__/embeddings.integration.test.ts`
- [x] T013 Run `pnpm test` — 44 files, 316 tests, all passing

**Checkpoint**: Multimodal embedding utilities tested. Can embed PDF pages and text, search pgvector, get file refs.

---

## Phase 3: User Story 2 — Automatic Content Indexing (Priority: P1) 🎯 MVP

**Goal**: When PDFs/PPTX are uploaded or synced from Moodle, they are automatically split into 6-page segments and embedded via Embedding 2. DOCX has text extracted. All transparent to the student.

**Independent Test**: Upload a PDF → verify embedding rows appear in `content_embeddings` with correct `page_start`/`page_end`. Re-upload same file → verify skip via `content_hash`.

### Implementation

- [x] T014 [US2] Rewrite `src/lib/actions/ai-context.ts` indexContent() — multimodal PDF embedding, DOCX text extraction, content_hash dedup
- [x] T015 [P] [US2] Write unit test `src/lib/actions/__tests__/ai-context.test.ts`
- [x] T016 [US2] Indexing hooks in course-materials.ts verified
- [x] T017 [US2] Indexing hook in moodle upload route verified
- [x] T018 [US2] Tests passing

**Checkpoint**: Course materials are automatically indexed as multimodal embeddings on upload/sync.

---

## Phase 4: User Story 1 — In-Week Homework Help (Priority: P1)

**Goal**: Student asks question in Week 5 homework → system downloads raw PDFs from storage → sends to Gemini Flash as file parts → AI answers grounded in actual documents with math/diagrams/Hebrew preserved.

**Independent Test**: Upload PDF to a week, ask "explain problem 3", verify Gemini response references content from the PDF (not extracted text fragments).

### Implementation

- [x] T019 [US1] Rewrite `askQuestion()` — downloads raw PDFs, sends as file parts to Gemini, cross-week RAG supplement
- [x] T020 [US1] Updated prompts.ts for PDF-native context
- [x] T021 [US1] Updated ask/route.ts for pageRange in sources
- [x] T022 [P] [US1] askQuestion tests included in ai-context.test.ts
- [x] T023 [US1] Tests passing

**Checkpoint**: Students can ask questions and get answers grounded in real PDF content with math/diagrams preserved.

---

## Phase 5: User Story 3 — Cross-Week Semantic Search (Priority: P2)

**Goal**: Student searches "eigenvalues" → system returns ranked results with file name + page range (no text snippet). Student can then ask a follow-up question and Gemini reads the actual file.

**Independent Test**: Index 3+ weeks of PDFs, search for a concept, verify correct week/file/page range in top results.

### Implementation

- [x] T024 [US3] searchContext() returns file refs with page ranges
- [x] T025 [US3] Updated search/route.ts
- [x] T026 [P] [US3] searchContext test included in ai-context.test.ts
- [x] T027 [US3] Tests passing

**Checkpoint**: Semantic search returns file references with page ranges. Students find content by meaning.

---

## Phase 6: User Story 4 — Shared Context Cache (Priority: P2)

**Goal**: When 10+ students query the same week, raw PDF file parts are cached at Gemini. Subsequent queries pay 90% less.

**Independent Test**: Create cache for Week 5, verify `context_cache_registry` row, verify second query uses `cachedContent`.

### Implementation

- [x] T028 [US4] context-cache.ts updated — materials_hash from file names
- [x] T029 [US4] Cache integration in askQuestion() verified — cachedContent passed via providerOptions
- [x] T030 [US4] Cache invalidation hooks in course-materials.ts verified
- [x] T031 [P] [US4] context-cache.test.ts passing (3 tests)
- [x] T032 [US4] Tests passing

**Checkpoint**: Shared caching with raw PDF content reduces costs at scale.

---

## Phase 7: Polish & Cross-Cutting

- [x] T033 [P] Removed indexing/cleanup hooks from documents.ts (note indexing deferred)
- [ ] T034 [P] Add error handling to `indexContent()` — retry on embedding API failure
- [ ] T035 Update `supabase/seed.sql` — update for new schema if needed
- [ ] T036 Run `sudo supabase db reset` to verify clean migration + seed
- [x] T037 Run `pnpm test` — 44 files, 316 tests, all passing
- [ ] T038 Run `pnpm lint` — zero errors

---

## Dependencies & Execution Order

```
Phase 1 (Setup — cleanup v1)
    │
    ▼
Phase 2 (Foundation — Embedding 2 utilities)
    │
    ▼
Phase 3 (US2 — Indexing) ──────────────────┐
    │                                       │
    ▼                                       ▼
Phase 4 (US1 — Homework Help)    Phase 5 (US3 — Search)
    │
    ▼
Phase 6 (US4 — Cache)
    │
    ▼
Phase 7 (Polish)
```

### Parallel Opportunities

**Phase 1**: T002, T003, T004 can run in parallel (deleting independent files)
**Phase 2**: T007, T008, T009, T011 can run in parallel (independent files)
**Phase 3+5**: US3 (search) can start once Phase 2 is done, parallel with US2/US1

---

## Implementation Strategy

### MVP (US2 + US1)

1. Phase 1: Cleanup v1 code + update migrations
2. Phase 2: Embedding 2 utilities + DB queries
3. Phase 3: Auto-indexing (PDFs embedded on upload)
4. Phase 4: askQuestion with raw PDFs to Gemini
5. **VALIDATE**: Upload PDF → ask question → get answer with real PDF content

### Incremental

1. MVP → course material Q&A works
2. US3 → cross-week search
3. US4 → cost optimization via caching
4. Polish → error handling, cleanup

---

## Notes

- Total: 38 tasks across 7 phases (down from 49 in v1 — simpler architecture)
- No text extraction for PDFs/PPTX — Embedding 2 handles natively
- `unpdf`, `jszip`, `chunker.ts` removed — 2 deps instead of 4
- Student note indexing explicitly deferred — not in any task
- VECTOR(1536) — wider vectors for better multimodal quality
