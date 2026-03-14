# Research: Course Context Engine (Updated)

**Date**: 2026-03-14
**Feature**: 006-course-context-engine
**Update**: Switched from Embedding 001 (text-only) to Embedding 2 (multimodal)

## 1. Embedding Model

**Decision**: Gemini Embedding 2 Preview (`gemini-embedding-2-preview`) at 1,536 dimensions

**Rationale**:

- Natively embeds PDFs, images, PPTX — no text extraction needed for course materials
- Preserves math formulas, diagrams, tables, Hebrew RTL text that text extraction breaks
- Up to 6 pages per embedding call, 8,192 token limit for text
- 100+ language support including Hebrew, natively in the multimodal space
- Free tier for text and images
- 1,536 dimensions (Matryoshka truncation from 3,072) — good balance of quality and storage for multimodal content

**Alternatives considered**:

- Gemini Embedding 001: GA and stable, but text-only. Math formulas extracted as `01 x2 dx` instead of `∫₀¹ x² dx`. Hebrew often broken. $0.15/MTok with batch discount. Doesn't justify the quality loss for a math/science notebook.
- OpenAI text-embedding-3: Text-only, would require separate provider SDK
- Self-hosted: Overkill for this scale

**Tradeoffs accepted**:

- Preview status (no SLA, may change) — acceptable for this phase
- No batch API yet — $0.20/MTok text, $0.45/MTok images
- Embedding space incompatible with 001 — no migration path, must re-embed if switching

## 2. Vector Storage

**Decision**: Supabase pgvector with HNSW index, VECTOR(1536)

**Rationale**:

- Same as before, just wider vectors (1,536 vs 768)
- 1,536 dims × 4 bytes = 6KB per embedding row
- HNSW index works identically

## 3. PDF Indexing Strategy

**Decision**: Embed raw PDF pages directly via Gemini Embedding 2 — no text extraction

**Rationale**:

- Embedding 2 accepts PDF files as input, processes up to 6 pages per call
- A 20-page lecture PDF = 4 embedding calls (pages 1-6, 7-12, 13-18, 19-20)
- Each call returns one 1,536-dim vector representing those pages
- Math, diagrams, Hebrew, slide layouts preserved natively
- Eliminates need for `unpdf` dependency for PDF indexing

**Storage model**:

- Each embedding row represents a page segment (not a text chunk)
- `page_start` and `page_end` columns track which pages
- No `chunk_text` stored for PDF embeddings — content comes from the original file at query time

## 4. Full-Context Answering

**Decision**: Send raw PDFs from Supabase Storage directly to Gemini Flash/Pro as file parts

**Rationale**:

- Gemini Flash/Pro natively reads PDF files — sees math, diagrams, tables, Hebrew
- Quality far superior to sending extracted text
- Files downloaded from Supabase Storage at query time (~50ms local)
- Combined with shared context caching: first query caches the PDFs, subsequent queries pay 90% less

## 5. Search Result Display

**Decision**: Show source file name + page range (no text snippets stored)

**Rationale**:

- Multimodal embeddings don't produce text — they're vectors of visual/semantic content
- Search results show: "Lecture 5 Slides — pages 7-12" with link to open/download
- Detailed content comes from Gemini reading the raw PDF when student asks a follow-up
- No need for `unpdf` or text extraction for display purposes

## 6. DOCX Text Extraction

**Decision**: Keep `mammoth` for DOCX files only

**Rationale**:

- Embedding 2 multimodal doesn't accept DOCX format directly
- `mammoth.extractRawText()` → text → embed as text via Embedding 2
- DOCX is a minority format in Moodle (most materials are PDFs)

## 7. Context Caching

**Decision**: Gemini explicit context caching with raw PDF file parts

**Rationale**:

- Cache the raw PDF files (not extracted text) at Gemini
- 90% discount on cached input tokens
- Shared across all students via same API key
- TTL: 2 hours, tracked in `context_cache_registry`
- Cache created with actual file content, subsequent queries reference by cache name

## 8. LLM for Answers

**Decision**: Gemini 2.5 Flash (default) / Pro (deep mode)

**Rationale**: Same as before. Both accept PDF file parts natively.

## 9. Dependencies (Updated)

| Package         | Purpose                         | Change                                          |
| --------------- | ------------------------------- | ----------------------------------------------- |
| `mammoth`       | DOCX text extraction            | Kept (DOCX only)                                |
| `@google/genai` | Embedding 2 API + context cache | Kept                                            |
| `unpdf`         | ~~PDF text extraction~~         | **REMOVED** — no longer needed                  |
| `jszip`         | ~~PPTX text extraction~~        | **REMOVED** — Embedding 2 handles PPTX natively |

Net: **2 dependencies** instead of 4. Simpler.
