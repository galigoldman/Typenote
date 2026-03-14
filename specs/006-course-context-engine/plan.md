# Implementation Plan: Course Context Engine

**Branch**: `006-course-context-engine` | **Date**: 2026-03-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-course-context-engine/spec.md`

## Summary

Build a multimodal AI context engine for course material search and homework assistance. PDFs and PPTX files are embedded directly using Gemini Embedding 2 (no text extraction) — preserving math, diagrams, and Hebrew natively. For in-week homework help, raw PDFs are sent directly to Gemini Flash/Pro as file parts with shared context caching. Cross-week search uses pgvector similarity search returning file references + page ranges. Student note indexing deferred to future phase.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+ + Next.js 16 (App Router), Vercel AI SDK (`ai` + `@ai-sdk/google`), `mammoth`, `@google/genai`
**Storage**: PostgreSQL via Supabase + pgvector extension, Supabase Storage (existing buckets)
**Testing**: Vitest (unit + integration), Playwright (e2e)
**Target Platform**: Web (Next.js)
**Project Type**: Web application (full-stack)
**Performance Goals**: <3s in-week answers, <5s cross-week search, <5min course indexing
**Constraints**: <$3/student/month at 15q/day, Embedding 2 Preview acceptable, Hebrew + English
**Scale/Scope**: 10-50 students per course, 13 weeks, ~40 files per course

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Incremental Development | PASS | Phases: migrations → embedding → search → answering → caching |
| II. Test-Driven Quality | PASS | Unit tests for embeddings/extraction, integration tests for pgvector + RLS |
| III. Protected Main Branch | PASS | Feature branch `006-course-context-engine`, PR with CI |
| IV. Migrations as Code | PASS | 3 migrations in `supabase/migrations/` |
| V. Interview-Ready Architecture | PASS | Multimodal vs text embedding tradeoffs, context caching, RAG architecture |

**Post-Phase 1 Re-check**: PASS

## Project Structure

### Documentation

```text
specs/006-course-context-engine/
├── spec.md              # Updated with Embedding 2 clarifications
├── plan.md              # This file (updated)
├── research.md          # Updated for multimodal
├── data-model.md        # Updated: VECTOR(1536), page segments
├── quickstart.md        # Updated
├── contracts/
│   └── ai-context-api.md  # Updated: raw PDFs, no chunk_text
├── checklists/
│   └── requirements.md
└── tasks.md             # To be regenerated
```

### Source Code

```text
supabase/migrations/
├── 00011_enable_pgvector.sql           # Enable vector extension
├── 00012_create_content_embeddings.sql  # VECTOR(1536), page segments, RLS, RPC
└── 00013_create_context_cache_registry.sql

src/lib/ai/
├── provider.ts              # MODIFIED — Embedding 2 model export
├── embeddings.ts            # REWRITTEN — multimodal PDF embedding + text embedding
├── context-cache.ts         # Shared cache with raw file parts
├── prompts.ts               # AI tutor system prompt
└── extraction/
    └── docx.ts              # mammoth (DOCX only — PDF/PPTX don't need extraction)

src/lib/actions/
├── ai-context.ts            # REWRITTEN — indexContent, searchContext, askQuestion
├── course-materials.ts      # MODIFIED — indexing + cache invalidation hooks
└── documents.ts             # MODIFIED — cleanup hooks only

src/lib/queries/
└── embeddings.ts            # REWRITTEN — page segments, match fn, file refs

src/app/api/ai/
├── ask/route.ts             # POST — downloads PDFs, sends to Gemini
└── search/route.ts          # GET — returns file refs + page ranges
```

**Structure Decision**: Same project layout. Removed `src/lib/ai/extraction/pdf.ts` and `pptx.ts` (no longer needed). Removed `src/lib/ai/chunker.ts` (no text chunking for PDFs). Kept `docx.ts` for DOCX-only text extraction.
