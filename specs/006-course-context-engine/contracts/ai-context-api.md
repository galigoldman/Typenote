# API Contracts: Course Context Engine (Updated)

**Date**: 2026-03-14
**Update**: Multimodal Embedding 2 — raw PDFs, no text extraction for PDF/PPTX

## Server Actions

### indexContent

Embeds course material files for semantic search. PDFs and PPTX are embedded directly as multimodal content. DOCX has text extracted first.

**Signature**: `indexContent(source: IndexSource): Promise<IndexResult>`

**Input**:
```typescript
type IndexSource =
  | { type: 'moodle_file'; fileId: string; courseId: string; weekId?: string }
  | { type: 'course_material'; materialId: string; courseId: string; weekId: string };
```

Note: No `document` type — student note indexing deferred to future phase.

**Output**:
```typescript
type IndexResult = {
  success: boolean;
  segmentsIndexed: number;
  skipped: boolean;
  error?: string;
};
```

**Behavior**:
- Downloads file from Supabase Storage
- Checks `content_hash` — skips if unchanged
- For PDF/PPTX: splits into 6-page segments, embeds each segment directly via Embedding 2 multimodal API
- For DOCX: extracts text via mammoth, embeds text via Embedding 2
- Stores embeddings in `content_embeddings` with `page_start`/`page_end` for PDF/PPTX
- Moodle files: `user_id = NULL` (shared). Course materials: `user_id = owner`

---

### searchContext

Semantic search across indexed course materials.

**Signature**: `searchContext(params: SearchParams): Promise<SearchResult[]>`

**Input**:
```typescript
type SearchParams = {
  query: string;
  courseId: string;
  weekId?: string;
  maxResults?: number; // default: 8
};
```

**Output**:
```typescript
type SearchResult = {
  id: number;
  sourceType: 'moodle_file' | 'course_material';
  sourceId: string;
  sourceName: string;
  pageStart: number | null;
  pageEnd: number | null;
  courseId: string;
  weekId: string | null;
  mimeType: string | null;
  similarity: number;
};
```

Note: No `chunkText` — results show file name + page range. Content comes from Gemini at question time.

---

### askQuestion

Main AI endpoint. Downloads raw PDFs from storage and sends to Gemini as file parts.

**Signature**: `askQuestion(params: QuestionParams): Promise<QuestionResult>`

**Input**:
```typescript
type QuestionParams = {
  question: string;
  courseId: string;
  weekId?: string;         // enables full-context mode
  documentId?: string;
  mode: 'quick' | 'deep';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};
```

**Output**:
```typescript
type QuestionResult = {
  answer: string;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    weekId: string | null;
    pageRange: string | null;
  }>;
  model: 'flash' | 'pro';
  cached: boolean;
};
```

**Behavior**:
1. `weekId` provided → **full-context mode**:
   - Get file refs for the week (storage paths + metadata)
   - Download raw PDFs/PPTX from Supabase Storage
   - Check/create shared context cache
   - Send files as `{ type: 'file', data: buffer, mimeType }` parts to Gemini
   - ALSO run RAG search for cross-week supplement (embed query → match_embeddings → get page refs from other weeks → download those specific files too)
2. No `weekId` → **RAG mode**:
   - Embed query → match_embeddings → get top results with page ranges
   - Download the matched source files from storage
   - Send to Gemini with the question
3. Build prompt with system instructions + file parts + conversation history + question
4. Return answer with source citations

---

## API Routes

### POST /api/ai/ask

Wraps `askQuestion()`. Body: `{ question, courseId, weekId?, documentId?, mode, conversationHistory? }`.

### GET /api/ai/search

Wraps `searchContext()`. Query params: `query, courseId, weekId?, maxResults?`. Returns `{ results }` with file names and page ranges.

---

## Indexing Triggers

| Event | Action |
|-------|--------|
| Moodle file uploaded (upload route) | `indexContent({ type: 'moodle_file', ... })` |
| Course material uploaded | `indexContent({ type: 'course_material', ... })` |
| Moodle file removed | Delete rows from `content_embeddings` |
| Course material deleted | Delete rows from `content_embeddings` + invalidate cache |
