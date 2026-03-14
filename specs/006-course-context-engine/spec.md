# Feature Specification: Course Context Engine

**Feature Branch**: `006-course-context-engine`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "AI-powered course context engine with hybrid RAG and context caching for course material search and homework assistance. Text content only — no handwriting/canvas transcription in this phase."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - In-Week Homework Help (Priority: P1)

A student is working on their Week 5 Calculus homework document. They type a question: "Help me solve the integral in problem 3." The system knows they are in Week 5 of Calculus (from the document's course and week linkage), gathers all of that week's lecture PDFs, tutorial slides, homework PDF, and the student's own typed notes, and sends them as full context to the AI. The AI generates a step-by-step explanation grounded in what was taught in the lecture, citing specific materials.

**Why this priority**: This is the primary use case — 70-80% of all AI queries will be students asking for help while working on a specific week's content. Full context ensures the AI understands the complete lecture, doesn't miss relationships between concepts, and can reference specific examples the professor used.

**Independent Test**: Upload a course with materials for one week, create a homework document linked to that week, ask a question. The AI response should reference specific content from the uploaded materials.

**Acceptance Scenarios**:

1. **Given** a student is editing a document linked to Week 5 of Calculus I, **When** they ask "help me with problem 3", **Then** the system retrieves all Week 5 materials and generates an answer referencing the relevant lecture content.
2. **Given** a student is in a homework document, **When** the AI generates an answer, **Then** the response cites which material the information came from (e.g., "As covered in the Week 5 lecture...").
3. **Given** a student asks a follow-up question within the same session, **When** the system processes the second query, **Then** it reuses the cached week context, responding faster.
4. **Given** a student is working on a week with no uploaded materials, **When** they ask a question, **Then** the system uses the student's own notes for that course and responds with the best answer available, noting that no course materials were found.
5. **Given** a student chooses "deep explanation" mode, **When** the system generates an answer, **Then** it uses the more capable model for detailed, multi-step reasoning.

---

### User Story 2 - Automatic Content Indexing on Upload/Sync (Priority: P1)

When course materials are imported from Moodle or uploaded by a student, the system automatically indexes the files for future retrieval. PDFs and PPTX files are embedded directly using a multimodal embedding model — no text extraction needed, preserving math formulas, diagrams, and Hebrew text natively. DOCX files have their text extracted first. This all happens in the background — the student never needs to think about it.

**Why this priority**: Without indexing, cross-week search (Story 3) doesn't work, and the system can't identify which content is relevant. Indexing must be automatic and invisible. This is the foundation.

**Independent Test**: Import a Moodle course with PDFs, then query the database to verify that text chunks and their vector representations are stored. Edit a note document and verify it gets re-indexed.

**Acceptance Scenarios**:

1. **Given** a Moodle course is synced with 40 PDF files, **When** the sync completes, **Then** all PDF text is extracted, chunked, and indexed. Files already indexed (matching content hash) are skipped.
2. **Given** a student uploads a PDF to their course materials, **When** the upload completes, **Then** the file text is extracted and indexed within 30 seconds.
3. **Given** a student saves a rich-text document with math expressions, **When** the content changes, **Then** the document text is re-indexed automatically.
4. **Given** a Moodle file was already indexed by another student's sync, **When** a second student syncs the same course, **Then** the system recognizes the file by content hash and skips re-indexing — both students search against the same shared index.
5. **Given** a DOCX or PPTX file is imported from Moodle, **When** indexing runs, **Then** the text content is extracted and indexed just like PDF files.
6. **Given** a document is deleted, **When** deletion completes, **Then** its index entries are also removed.

---

### User Story 3 - Cross-Week Semantic Search (Priority: P2)

A student preparing for a midterm types "Where did we cover eigenvalues?" into a search interface. The system searches across all weeks of that course — both shared lecture materials and the student's own notes — and returns the most relevant passages ranked by relevance, showing the source week, file name, and a text snippet.

**Why this priority**: Cross-week search is essential for exam preparation and connecting concepts across the semester. It transforms the notebook from a passive storage tool into an active study assistant. It depends on Story 2 (indexing) being complete.

**Independent Test**: Index a full course (13 weeks of materials), search for a concept that appears in specific weeks. Verify results point to the correct weeks and sources.

**Acceptance Scenarios**:

1. **Given** a course with 13 weeks of indexed materials, **When** a student searches "eigenvalues", **Then** results are returned ranked by relevance, showing the source week, file name, and a text snippet.
2. **Given** a student has personal notes mentioning "eigenvalues", **When** they search, **Then** results include both shared course materials AND their own notes, clearly labeled by source type.
3. **Given** a student searches with a vague query like "that matrix thing from the middle of the semester", **When** results are returned, **Then** the system finds semantically related content even though the exact words don't match.
4. **Given** a student is enrolled in multiple courses, **When** they search from within a specific course, **Then** results are scoped to that course only.
5. **Given** a search query in Hebrew, **When** results are returned, **Then** Hebrew course materials are found and ranked correctly.

---

### User Story 4 - Shared Context Cache for Active Courses (Priority: P2)

When multiple students in the same course are actively studying the same week, the system maintains a shared context cache for that week's materials. The first student's query creates the cache; subsequent students' queries reuse it automatically. The cache expires after a period of inactivity. Caching is only activated when enough students are active to justify the storage cost.

**Why this priority**: This is a cost optimization that becomes critical at scale. With 10+ students in a course, shared caching reduces per-query costs by up to 90% on input tokens while maintaining full-context quality. The system works without it (just costs more per query), so it's P2.

**Independent Test**: Simulate 10 students querying the same week and measure that follow-up queries use the cached context rather than re-sending full materials.

**Acceptance Scenarios**:

1. **Given** Student A asks a question about Week 5, **When** Student B asks about Week 5 within 2 hours, **Then** Student B's query reuses the existing shared cache.
2. **Given** a shared cache exists for Week 5, **When** no queries hit it for 2 hours, **Then** the cache expires automatically.
3. **Given** fewer than 8 students are active in a course, **When** the system evaluates caching, **Then** it uses direct queries without caching (cheaper at low volume).
4. **Given** a cache exists for Week 5, **When** new materials are added to Week 5, **Then** the cache is invalidated and rebuilt on the next query.

---

### Edge Cases

- What happens when a PDF contains only scanned images with no extractable text? The system should detect low text yield and flag the file to the student as "not fully indexed — scanned content cannot be searched."
- What happens when a student asks a question about a course with no materials at all? The system should inform the student and suggest uploading materials or syncing from Moodle.
- What happens when the embedding service is temporarily unavailable? Indexing should be queued and retried. Search should degrade gracefully, showing available content rather than failing.
- What happens when course materials are in Hebrew? The embedding model and search must support Hebrew and mixed Hebrew/English content.
- What happens when two students search the same query simultaneously? Both should receive results without conflict; shared caches must handle concurrent reads.
- What happens when a very large PDF (500+ pages) is uploaded? The system should process it in manageable batches and not time out.
- What happens when a student's note document is empty? The system should skip indexing without errors.

## Requirements _(mandatory)_

### Functional Requirements

**Content Indexing**

- **FR-001**: System MUST automatically generate vector embeddings for PDF and PPTX files upon upload or Moodle sync by embedding the raw file pages directly (multimodal embedding), preserving math notation, diagrams, and Hebrew text natively.
- **FR-002**: System MUST extract text from DOCX files imported from Moodle and embed the extracted text.
- **FR-003**: Student note indexing (TipTap documents) is deferred to a future phase — notes will eventually be exported as PDFs and embedded via the same multimodal pipeline.
- **FR-004**: System MUST split large PDFs into segments of up to 6 pages each for embedding (model limit per call).
- **FR-005**: System MUST generate vector embeddings and store them for similarity search.
- **FR-006**: System MUST skip re-indexing files that have not changed (identified by content hash for Moodle files, content comparison for documents).
- **FR-007**: System MUST index shared Moodle materials once globally (not per student), so all enrolled students search against the same index.
- **FR-008**: System MUST remove index entries when their source content is deleted.

**Context Retrieval**

- **FR-009**: System MUST provide full-context retrieval for the current working week — raw PDF/PPTX files are downloaded from storage and sent directly to the AI model as file parts, preserving all formatting, math, and diagrams. Context is shared-cached across students.
- **FR-010**: System MUST provide chunk-based retrieval (semantic search) for cross-week queries — only the most relevant chunks from across the course are returned.
- **FR-011**: System MUST automatically determine retrieval mode based on whether the student is working within a specific week or searching broadly.
- **FR-012**: System MUST include both shared course materials AND the student's personal notes in retrieval results.
- **FR-013**: System MUST scope search results to the student's current course when querying from within a course context.

**Shared Context Caching**

- **FR-014**: System MUST maintain a shared context cache per active week, reusable across all students in the same course.
- **FR-015**: System MUST automatically create a cache when the first in-week query is made, and expire it after a configurable inactivity period (default: 2 hours).
- **FR-016**: System MUST invalidate a week's cache when materials for that week are added, updated, or removed.
- **FR-017**: System MUST only use shared caching when the number of active students justifies the cost (configurable threshold, default: 8 students).

**AI Response Generation**

- **FR-018**: System MUST generate answers grounded in the retrieved context, citing source materials where possible.
- **FR-019**: System MUST support both a quick-answer mode (faster, cheaper) and a deep-explanation mode (more thorough, premium) at the student's choice.
- **FR-020**: System MUST handle follow-up questions within a session, maintaining conversational context.

**Search Interface**

- **FR-021**: System MUST provide a search interface that returns ranked results from across all weeks of a course.
- **FR-022**: Search results MUST include the source type (lecture material, homework), week number, file name, and page range. Detailed content is provided by the AI when the student asks a follow-up question — Gemini reads the raw PDF at that point.
- **FR-023**: System MUST support semantic search — matching by meaning, not just exact keywords.

### Key Entities

- **Content Embedding**: A searchable vector representation of a file page segment (up to 6 pages) or text content, linked to its source (Moodle file, course material, or document). Contains the vector, source reference, page range, course/week scope, and ownership (shared or per-user). No text snippet stored for multimodal embeddings — content is retrieved from the original file at query time.
- **Context Cache**: A temporary, shared cache of a week's full materials for a specific course. Has a time-to-live, is shared across all students in the course, and is invalidated when materials change. Tracked in an application-level registry.

## Clarifications

### Session 2026-03-14

- Q: For PDFs and PPTX, should we embed raw file pages directly (multimodal) or extract text first? → A: Embed raw pages directly via Embedding 2 (no text extraction for PDFs/PPTX). Student note indexing deferred — notes will eventually be PDF-exported and use the same multimodal pipeline.
- Q: For in-week answering, send extracted text or raw PDFs to Gemini? → A: Send raw PDFs directly to Gemini Flash as file parts, with shared context caching across students in the same course/week.
- Q: What do search results display without stored text snippets? → A: Show source file name + page range. Detailed answers come from Gemini reading the raw PDF at question time with good instructions.
- Q: What embedding dimensions for multimodal content? → A: 1,536 dimensions (Matryoshka truncation from 3,072 default). Better quality for PDF pages with visual content.

## Scope Boundaries

**In scope**:

- Multimodal embedding of PDF and PPTX files directly (no text extraction needed)
- Text extraction from DOCX files
- Vector embedding and similarity search
- Full-context mode for current week
- RAG mode for cross-week search
- Shared context caching
- AI answer generation with source citations
- Hebrew and English support

**Out of scope (future phases)**:

- Student note indexing (TipTap documents — will use PDF export → multimodal embedding later)
- Handwriting/canvas transcription and indexing
- Cross-course search
- Voice input for questions
- Real-time collaborative AI sessions

## Assumptions

- Students work in focused sessions (1-3 hours) on a specific week's content, making session-based caching effective.
- 70-80% of AI queries relate to the current working week; 20-30% are cross-week searches.
- Average course has 13 weeks with ~40 files totaling ~257K tokens of extractable text.
- The existing Moodle deduplication system (content_hash) prevents duplicate indexing across students.
- Hebrew and English content are both used in Israeli university courses; the embedding model supports both natively via multimodal embedding.
- The embedding model (Embedding 2) is in Preview status — acceptable for this phase, with plan to use GA when available.
- PDFs are split into segments of up to 6 pages per embedding call (model limit).
- Vector dimensions are 1,536 (Matryoshka truncation from 3,072 default).
- The system processes indexing in the background without blocking the student's workflow.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Students receive contextually relevant AI answers within 3 seconds for in-week questions and within 5 seconds for cross-week search queries.
- **SC-002**: AI answers reference specific course materials (citing week and source) in at least 80% of responses where materials exist.
- **SC-003**: Cross-week search returns the correct source week for a concept in the top 3 results at least 90% of the time.
- **SC-004**: Course material indexing completes within 5 minutes for a typical 40-file course, and individual document re-indexing completes within 10 seconds of save.
- **SC-005**: Shared context caching reduces per-query input costs by at least 80% for in-week queries when 10+ students are active in a course.
- **SC-006**: Total AI cost per student remains below $3/month for medium usage (15 questions/day) using the standard answer mode.
- **SC-007**: System gracefully handles service interruptions — indexing retries automatically, and search degrades to showing available content rather than failing.
- **SC-008**: Search and AI answers work correctly for both Hebrew and English course content.
