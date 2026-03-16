# Feature Specification: AI Context Polish

**Feature Branch**: `007-ai-context-polish`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "Fix the AI context engine so it actually knows which course and week the student is working in, and if they're editing a document, the AI can see that document's content. Keep the existing text-based RAG pipeline — no architecture changes. Fix the system prompt to be context-aware. Clean up embedding deletion on material removal. Multimodal embedding and context caching are deferred until we have real users."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - AI Knows Your Current Context (Priority: P1)

A student is editing their homework document for Week 5 of Linear Algebra. They open the AI chat panel and ask "Help me with problem 3 from the homework." The AI knows it's Linear Algebra, Week 5, and responds accordingly — referencing the correct course and week in its answer. Search is always course-wide (a student in Week 5 may ask about a concept from Week 2, and that's expected).

**Why this priority**: Right now the system prompt is generic ("You are a course tutor"). It doesn't tell the AI which course or week the student is in. This means the AI can't say "Based on your Week 5 lecture..." because it doesn't know it's Week 5. This is the most impactful fix — it makes the AI feel like it actually understands the student's context.

**Independent Test**: Open a document linked to Week 5 of a course. Open the AI panel and ask a question. Verify the AI response mentions the course name and week number contextually.

**Acceptance Scenarios**:

1. **Given** a student is editing a document linked to Week 5 of Linear Algebra, **When** they ask a question, **Then** the AI's system prompt includes the course name ("Linear Algebra") and week context ("Week 5"), and the response references this context naturally.
2. **Given** a student is in Week 5 but asks about a concept from Week 2, **When** the search runs, **Then** it searches across all weeks of the course and returns relevant results from any week.
3. **Given** a student is editing a document linked to a course but no specific week, **When** they ask a question, **Then** the AI knows the course and searches across all weeks.
4. **Given** a student is on a course page (not editing a document), **When** they open the AI panel, **Then** the AI knows the course name and can search all weeks.
5. **Given** a student is editing a document not linked to any course, **When** they look for the AI panel, **Then** the AI panel button is not shown (no course context to search).

---

### User Story 2 - AI Can See Your Current Document (Priority: P1)

A student has been typing notes and partial solutions in their document. They ask the AI "Is my solution to problem 2 correct?" The AI can read the student's current document content and provide feedback — pointing out errors, suggesting improvements, or confirming the work is correct.

**Why this priority**: This is completely missing today. The AI has no visibility into what the student is writing. Without this, the AI can't help with "check my work" or "what am I missing" — which are the most natural questions a student asks while working on homework.

**Independent Test**: Create a document with some math notes. Open the AI panel and ask "what's wrong with my solution?" Verify the AI references specific content from the document.

**Acceptance Scenarios**:

1. **Given** a student has typed notes in their document, **When** they ask "is my solution correct?", **Then** the AI can read the document content and provides specific feedback about their work.
2. **Given** a student's document is empty, **When** they ask a question, **Then** the AI works normally using course materials only — no error from empty document content.
3. **Given** a student's document has both text and math (LaTeX), **When** the AI reads it, **Then** the math content is included in the context sent to the AI.
4. **Given** a student modifies their document and then asks a follow-up question, **When** the AI processes the question, **Then** it uses the latest document content (not a stale snapshot from when the panel was opened).

---

### User Story 3 - Embedding Cleanup on Material Deletion (Priority: P2)

When a course material or Moodle file is deleted, the system removes the corresponding embedding rows from the database. This prevents stale search results that reference files that no longer exist.

**Why this priority**: Without cleanup, deleted files still appear in search results. The student sees a citation like "See Lecture 5 Slides.pdf" but the file is gone. This is confusing and breaks trust in the AI.

**Independent Test**: Upload a file, verify embeddings exist. Delete the file. Verify embedding rows are removed. Search for content from the deleted file and verify no results.

**Acceptance Scenarios**:

1. **Given** a course material is deleted, **When** deletion completes, **Then** all embedding rows referencing that material are removed from the database.
2. **Given** a Moodle file is removed during a re-sync, **When** the removal is processed, **Then** the corresponding embedding rows are deleted.
3. **Given** embeddings were cleaned up for a deleted file, **When** a student searches for content that was only in that file, **Then** no stale results appear.

---

### User Story 4 - AI Responses Render Properly (Priority: P1)

When the AI responds with markdown formatting, LaTeX math expressions, or structured content (lists, headings, code), the student sees it rendered — not as raw markup. Math like `$\int_0^1 x\,dx$` displays as a real integral symbol. Bold text appears bold. Lists are formatted.

**Why this priority**: The system prompt tells the AI to use LaTeX for math and markdown for structure. But the chat panel currently renders everything as plain text. A math tutor that shows `$\frac{d}{dx}$` instead of a rendered derivative is broken. This directly undermines the value of every other improvement in this feature.

**Independent Test**: Ask the AI a math question. Verify the response renders LaTeX as visual math and markdown as formatted text.

**Acceptance Scenarios**:

1. **Given** the AI responds with inline LaTeX (e.g., `$x^2$`), **When** the response is displayed, **Then** the math is rendered visually (not shown as raw LaTeX text).
2. **Given** the AI responds with display LaTeX (e.g., `$$\int_0^\infty f(x)\,dx$$`), **When** the response is displayed, **Then** the math is rendered as a centered block equation.
3. **Given** the AI responds with markdown (bold, lists, headings, code blocks), **When** the response is displayed, **Then** the formatting renders correctly.
4. **Given** the AI responds with a mix of text, math, and markdown, **When** the response is displayed, **Then** all elements render correctly together without breaking each other.

---

### Edge Cases

- What happens when the student's document contains only canvas/drawing content (no text)? The AI should note that it can see the document but it contains only drawings, and work with course materials only.
- What happens when the TipTap document content is very large (long notes)? The system should truncate to a reasonable size before sending to the AI to avoid exceeding context limits.
- What happens when a student switches between documents in different courses? The AI panel should reset its conversation and update to the new course/week context.
- What happens when no materials are indexed for the course? The AI should clearly state that no course materials were found and suggest uploading or syncing from Moodle, but can still help with the student's own document content.
- What happens when the course has no name (unnamed course)? The system prompt should handle this gracefully (e.g., "your course" instead of a specific name).

## Requirements _(mandatory)_

### Functional Requirements

**Context-Aware System Prompt**

- **FR-001**: The AI system prompt MUST include the course name when the student is working within a course context.
- **FR-002**: The AI system prompt MUST include the week number/label when the student is working within a specific week.
- **FR-003**: The system prompt MUST instruct the AI to reference the course and week naturally in its responses (e.g., "Based on your Week 5 Linear Algebra materials...").
- **FR-004**: The system prompt MUST instruct the AI to respond in the same language as the student's question (Hebrew or English).
- **FR-005**: The system prompt MUST instruct the AI to use LaTeX notation for mathematical expressions.

**Document Content Awareness**

- **FR-006**: System MUST serialize the current document's text content (from TipTap editor) and pass it to the AI as part of the conversation context.
- **FR-007**: The document content MUST be sent as a clearly labeled section (e.g., "The student's current document contains:") so the AI distinguishes it from course materials.
- **FR-008**: The system MUST use the latest document content at the time of each question (not a stale snapshot from when the panel was opened).
- **FR-009**: The system MUST handle empty documents gracefully — no errors, AI works with course materials only.
- **FR-010**: The system MUST truncate document content if it exceeds a reasonable size limit to avoid context overflow.

**UI Changes**

- **FR-011**: The AI chat panel MUST receive the current document content from the editor component.
- **FR-012**: The AI chat panel MUST NOT be shown when the document is not linked to any course (no courseId available).
- **FR-013**: When the student navigates to a different document, the AI panel conversation MUST reset and context MUST update.

**Response Rendering**

- **FR-014**: AI responses MUST render markdown formatting (bold, italic, lists, headings, code blocks).
- **FR-015**: AI responses MUST render inline LaTeX (wrapped in single `$`) as visual math expressions.
- **FR-016**: AI responses MUST render display LaTeX (wrapped in `$$`) as centered block equations.
- **FR-017**: The rendering MUST handle mixed content (text + math + markdown) without breaking.

**Embedding Cleanup**

- **FR-018**: When a course material is deleted, the system MUST delete all embedding rows where source_type = 'course_material' and source_id matches the deleted material.
- **FR-019**: When a Moodle file is removed, the system MUST delete all embedding rows where source_type = 'moodle_file' and source_id matches the removed file.

**Existing Behavior (no changes)**

- **FR-020**: The existing text-based extraction, embedding, and RAG search pipeline MUST remain unchanged.
- **FR-021**: The existing Quick (Flash) / Deep (Pro) mode toggle MUST continue to work.
- **FR-022**: The existing conversation history within a session MUST continue to work.
- **FR-023**: The existing source citation in responses MUST continue to work.

### Key Entities

- No new entities. This feature modifies the behavior of existing components (system prompt, AI chat panel, embedding lifecycle) without adding new data models.

## Scope Boundaries

**In scope**:

- Update system prompt to include course name and week context
- Pass current document content to the AI
- Add document content serialization from TipTap editor
- Render AI responses with markdown and LaTeX (KaTeX)
- Hide AI panel when no course context exists
- Delete embedding rows when materials are deleted
- Reset AI conversation when switching documents

**Out of scope (future phases)**:

- Multimodal embedding (replacing text extraction with raw PDF embedding)
- Sending raw PDF files to Gemini at answer time
- Shared context caching
- Student note indexing (embedding the student's own documents)
- Streaming AI responses
- Cross-course search

## Assumptions

- The document editor (CanvasEditor component) has access to the TipTap editor instance and can extract text content.
- The document page already fetches course and week data from Supabase.
- The existing `askQuestion()` server action can be extended to accept document content and course metadata without breaking the API contract.
- TipTap provides a method to export document content as plain text (e.g., `editor.getText()` or serializing the JSON content).
- Document content size is typically under 50K characters for student notes — truncation is a safety net, not a common case.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The AI correctly mentions the student's course name and week number in its responses when the student is working within a specific course/week context.
- **SC-002**: When a student asks "is my answer correct?" or "what am I missing?", the AI references specific content from the student's current document.
- **SC-003**: Deleting a course material or Moodle file results in zero stale embedding rows for that source within 5 seconds.
- **SC-004**: The AI panel is not visible on documents that are not linked to a course.
- **SC-005**: Switching between documents in different courses resets the AI conversation and updates the context correctly.
- **SC-006**: AI responses render LaTeX math as visual equations and markdown as formatted text — no raw markup visible to the student.
- **SC-007**: All existing AI functionality (search, Q&A, Quick/Deep modes, citations) continues to work without regression.
