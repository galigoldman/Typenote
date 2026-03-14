# Quickstart: Course Context Engine (Updated)

**Date**: 2026-03-14
**Feature**: 006-course-context-engine
**Update**: Multimodal Embedding 2 — raw PDFs, 1536 dimensions

## Prerequisites

- Local Supabase running (`supabase start`)
- `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`
- Node.js 22+

## Setup

```bash
# Dependencies (only 2 new — mammoth for DOCX, @google/genai for embedding + cache)
pnpm add mammoth @google/genai

# Remove unused deps from previous iteration
pnpm remove unpdf jszip

# Apply migrations
supabase db reset

# Start dev
pnpm dev
```

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│               INDEXING (write path)                   │
│                                                      │
│  PDF/PPTX upload ──→ Split into 6-page segments      │
│                      → Embed directly via Embedding 2 │
│                      → Store vectors in pgvector      │
│                                                      │
│  DOCX upload ──→ mammoth extracts text                │
│                  → Embed text via Embedding 2         │
│                  → Store vectors in pgvector          │
│                                                      │
│  No text extraction for PDFs. Math, diagrams,        │
│  Hebrew preserved natively.                          │
├──────────────────────────────────────────────────────┤
│              RETRIEVAL (read path)                    │
│                                                      │
│  In-week question:                                   │
│    → Download raw PDFs from storage                   │
│    → Send as file parts to Gemini Flash/Pro           │
│    → Shared context cache (90% off)                  │
│    → + cross-week RAG supplement                     │
│                                                      │
│  Cross-week search:                                  │
│    → Embed query → pgvector similarity search         │
│    → Return file name + page range                   │
│    → Gemini reads raw PDF when student asks follow-up │
└──────────────────────────────────────────────────────┘
```

## Key Files

```
supabase/migrations/
├── 00011_enable_pgvector.sql          # Enable vector extension
├── 00012_create_content_embeddings.sql # VECTOR(1536), page segments, match fn
└── 00013_create_context_cache_registry.sql

src/lib/ai/
├── provider.ts              # MODIFIED — Embedding 2 model + Flash/Pro
├── embeddings.ts            # REWRITTEN — multimodal embed for PDF pages + text
├── context-cache.ts         # Shared cache with raw PDF file parts
└── prompts.ts               # System prompt for AI tutor
└── extraction/
    └── docx.ts              # mammoth (DOCX only)

src/lib/actions/
├── ai-context.ts            # REWRITTEN — indexContent, searchContext, askQuestion
├── course-materials.ts      # MODIFIED — indexing + cache hooks
└── documents.ts             # Minor — cleanup hooks only (no note indexing)

src/lib/queries/
└── embeddings.ts            # REWRITTEN — page segments, match fn, file refs

src/app/api/ai/
├── ask/route.ts             # POST — sends raw PDFs to Gemini
└── search/route.ts          # GET — returns file refs + page ranges
```

## What Changed from v1 (Embedding 001)

| Aspect | v1 (Embedding 001) | v2 (Embedding 2) |
|--------|-------------------|-------------------|
| PDF handling | unpdf text extraction → chunk → embed text | Embed raw PDF pages directly |
| PPTX handling | jszip XML parsing → embed text | Embed raw file directly |
| DOCX handling | mammoth → embed text | Same (Embedding 2 doesn't accept DOCX) |
| Student notes | TipTap → text → embed | Deferred to future phase |
| Dimensions | 768 | 1,536 |
| chunk_text stored | Yes (for search snippets) | No (content from raw file at query time) |
| Answer context | Reassembled extracted text | Raw PDFs sent to Gemini |
| Dependencies | unpdf, mammoth, jszip, @google/genai | mammoth, @google/genai |
| Quality | Lossy (broken math, Hebrew) | Native (math, diagrams, Hebrew preserved) |

## Testing

- **Unit tests**: Embedding wrapper (mock API), DOCX extraction
- **Integration tests**: pgvector with VECTOR(1536), match_embeddings RPC, RLS
- **Manual tests**: Upload PDF → verify embeddings in DB → search → ask question → verify Gemini sees real PDF content
