# Tasks: AI Context Polish

**Input**: Design documents from `/specs/007-ai-context-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ai-ask-api.md, quickstart.md

**Tests**: Required per constitution (Principle II: Test-Driven Quality).

**Organization**: Tasks grouped by user story. US1+US2 are P1 (US2 depends on US1). US4 (rendering) is P1 and parallel with US1. US3 (cleanup) is P2 and independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3, US4)

## Phase 1: Setup

**Purpose**: Install new dependencies needed for markdown+LaTeX rendering.

- [x] T001 Install `react-markdown`, `remark-math`, `rehype-katex` via `pnpm add react-markdown remark-math rehype-katex`
- [x] T002 Verify `pnpm build` succeeds with new dependencies (ESM compatibility check for react-markdown v9 + Next.js 16)

**Checkpoint**: New dependencies installed and build passing.

---

## Phase 2: Foundational — Text Extraction Helper

**Purpose**: Create the shared text extraction utility needed by US2 (document content) and reusable elsewhere.

- [x] T003 [P] Create `src/lib/ai/extract-document-text.ts` — helper function that extracts plain text from TipTap JSON content, including math node LaTeX wrapped in `$...$`. Handle both canvas documents (`pages[].flowContent`) and text documents (`content` field). Reuse the `extractPlainText()` pattern from `src/lib/pdf/tiptap-to-pdf.ts` but extend it to include math nodes.
- [x] T004 [P] Write unit test `src/lib/ai/__tests__/extract-document-text.test.ts` — test with: empty doc, text-only doc, doc with math nodes, canvas doc with multiple pages, mixed content. Verify math LaTeX is preserved as `$...$`.

**Checkpoint**: Text extraction utility tested. Can convert any TipTap document to plain text with math preserved.

---

## Phase 3: User Story 1 — AI Knows Your Current Context (Priority: P1)

**Goal**: The system prompt dynamically includes the course name and week number so the AI references them naturally in responses.

**Independent Test**: Open a document linked to Week 5 of a course. Ask a question. Verify the AI response mentions the course name and week number.

### Implementation

- [x] T005 [US1] Rewrite `src/lib/ai/prompts.ts` — replace static `SYSTEM_PROMPT` with `buildSystemPrompt({ courseName?, weekLabel?, hasDocumentContent })` function. Keep `LATEX_SYSTEM_PROMPT` unchanged. The dynamic prompt should inject course name and week naturally (e.g., "You are a tutor for {courseName}. The student is currently working on {weekLabel}."). Include instruction about document awareness when `hasDocumentContent` is true.
- [x] T006 [US1] Write unit test `src/lib/ai/__tests__/prompts.test.ts` — test `buildSystemPrompt()` with: no context, course only, course + week, course + week + document, unnamed course. Verify output contains expected context strings.
- [x] T007 [US1] Extend `QuestionParams` type in `src/lib/actions/ai-context.ts` — add `courseName?: string`, `weekLabel?: string` fields. Update `askQuestion()` to call `buildSystemPrompt()` with these params instead of using static `SYSTEM_PROMPT`.
- [x] T008 [US1] Update `src/app/api/ai/ask/route.ts` — extract `courseName`, `weekLabel` from request body and pass to `askQuestion()`. No validation needed (optional fields).
- [x] T009 [US1] Extend props in `src/components/ai/ai-chat-panel.tsx` — add `courseName?: string`, `weekLabel?: string` props. Send them in the `/api/ai/ask` request body.
- [x] T010 [US1] Extend props in `src/components/ai/ai-chat-wrapper.tsx` — add `courseName?: string`, `weekLabel?: string` props. Pass through to `AiChatPanel`.
- [x] T011 [US1] Update `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — fetch the week record from `course_weeks` when `typedDocument.week_id` exists (currently only fetches course, not week). Pass `courseName={course.name}` and `weekLabel={"Week " + week.week_number}` to `AiChatWrapper`.
- [x] T012 [US1] Update `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx` — pass `courseName={typedCourse.name}` to the `AiChatWrapper` already rendered on the course page.
- [x] T013 [US1] Ensure the AI chat panel is NOT rendered when `courseId` is not available (document not linked to a course). Already partially handled — verify the `{course && ...}` guard in the document page covers this.
- [x] T014 [US1] Run `pnpm test` — all existing + new tests passing.

**Checkpoint**: System prompt dynamically includes course name and week. AI references them in responses.

---

## Phase 4: User Story 4 — AI Responses Render Properly (Priority: P1)

**Goal**: AI responses render markdown formatting and LaTeX math as visual content, not raw markup.

**Independent Test**: Ask the AI a math question. Verify inline LaTeX renders as visual math and markdown (bold, lists) renders with formatting.

### Implementation

- [x] T015 [P] [US4] Create `src/components/ai/markdown-response.tsx` — reusable component using `react-markdown` + `remark-math` + `rehype-katex`. Import `katex/dist/katex.min.css` directly in this component (not relying on TipTap editor loading it). Apply Tailwind `prose prose-sm` class for compact markdown styling. Handle edge cases: empty content, content with no markdown, content with only LaTeX.
- [x] T016 [P] [US4] Write unit test `src/components/ai/__tests__/markdown-response.test.tsx` — test rendering of: plain text, markdown (bold, lists, headings), inline LaTeX (`$x^2$`), display LaTeX (`$$...$$`), mixed content. Use Vitest + jsdom.
- [x] T017 [US4] Update `src/components/ai/ai-chat-panel.tsx` — replace `<div className="whitespace-pre-wrap">{msg.content}</div>` with `<MarkdownResponse content={msg.content} />` for assistant messages only (user messages stay as plain text bubbles).
- [x] T018 [US4] Run `pnpm test` — all tests passing.

**Checkpoint**: AI responses render with formatted markdown and visual math equations.

---

## Phase 5: User Story 2 — AI Can See Your Current Document (Priority: P1)

**Goal**: The student's current document content is sent to the AI with each question so it can reference the student's own work.

**Independent Test**: Type some notes in a document. Ask the AI "is my solution correct?" Verify the AI references specific content from the document.

**Depends on**: Phase 3 (US1 — extended API params)

### Implementation

- [x] T019 [US2] Create `src/components/ai/document-with-ai.tsx` — Client Component wrapper that bridges `CanvasEditor` and `AiChatWrapper`. Holds a `getDocumentTextRef` (a ref to a function). Passes the ref setter to `CanvasEditor` and the getter to `AiChatWrapper`. Renders the course link header, AI wrapper, and editor as children.
- [x] T020 [US2] Update `src/components/canvas/canvas-editor.tsx` — accept an optional `onDocumentTextReady?: (getter: () => string) => void` prop. On mount (and when editors change), call it with a function that iterates `editorsRef.current` and extracts text from all page editors using the helper from T003. Include page flow content and text box content.
- [x] T021 [US2] Update `src/components/ai/ai-chat-wrapper.tsx` — accept optional `getDocumentContent?: () => string` prop. Pass through to `AiChatPanel`.
- [x] T022 [US2] Update `src/components/ai/ai-chat-panel.tsx` — accept optional `getDocumentContent?: () => string` prop. Before sending each question, call `getDocumentContent()` to get the latest document text. Include it as `documentContent` in the `/api/ai/ask` request body.
- [x] T023 [US2] Update `src/lib/actions/ai-context.ts` — extend `QuestionParams` with `documentContent?: string`. In `askQuestion()`, if `documentContent` is provided and non-empty, inject it as a labeled user turn before course materials: `"Here is the student's current document:\n\n{content}\n\nReview it to understand their work."` Truncate to 50K chars.
- [x] T024 [US2] Update `src/app/api/ai/ask/route.ts` — extract `documentContent` from request body and pass to `askQuestion()`.
- [x] T025 [US2] Refactor `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — replace the current sibling rendering of `AiChatWrapper` + `CanvasEditor` with the `DocumentWithAi` wrapper component. Pass course/week metadata and document data.
- [ ] T026 [US2] Write unit test `src/components/ai/__tests__/document-with-ai.test.tsx` — test that `getDocumentContent` callback is wired correctly between editor and AI panel.
- [x] T027 [US2] Run `pnpm test` — all tests passing.

**Checkpoint**: AI can read and reference the student's current document content.

---

## Phase 6: User Story 3 — Embedding Cleanup on Material Deletion (Priority: P2)

**Goal**: Embedding rows are deleted when their source material is deleted, preventing stale search results.

**Independent Test**: Upload a file and verify embeddings exist. Delete the file. Verify embedding rows are gone.

### Implementation

- [x] T028 [P] [US3] Update `src/lib/actions/course-materials.ts` — in `deleteCourseMaterial()`, call `deleteEmbeddingsBySource('course_material', materialId)` before deleting the storage file and DB record. Import from `@/lib/queries/embeddings`.
- [x] T029 [P] [US3] Update `src/lib/actions/course-weeks.ts` — in `deleteCourseWeek()`, for each material in the week, call `deleteEmbeddingsBySource('course_material', material.id)` before cascade deletion.
- [x] T030 [P] [US3] Update `src/lib/actions/courses.ts` — in `deleteCourse()`, for each material across all weeks, call `deleteEmbeddingsBySource('course_material', material.id)` before cascade deletion.
- [x] T031 [P] [US3] Update `src/lib/moodle/sync-service.ts` — in `flagRemovedFiles()`, call `deleteEmbeddingsBySource('moodle_file', fileId)` for each file being flagged as removed.
- [ ] T032 [US3] Write integration test `src/lib/actions/__tests__/embedding-cleanup.integration.test.ts` — verify that deleting a course material removes its embedding rows. Use the test Supabase client pattern from existing integration tests.
- [x] T033 [US3] Run `pnpm test` — all tests passing.

**Checkpoint**: No stale embedding rows remain after material or file deletion.

---

## Phase 7: Polish & Cross-Cutting

- [x] T034 Run `pnpm test` — all tests passing (unit + integration)
- [ ] T035 Run `pnpm lint` — zero errors
- [x] T036 Run `pnpm build` — verify build succeeds
- [ ] T037 Verify AI conversation resets when navigating between documents (the `DocumentWithAi` component should remount with new props)
- [ ] T038 Manual test: open document linked to course/week → ask AI a math question → verify response shows course context, renders LaTeX, and can reference document content

---

## Dependencies & Execution Order

```
Phase 1 (Setup — install deps)
    │
    ▼
Phase 2 (Foundation — text extraction)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
Phase 3 (US1 — System Prompt)    Phase 4 (US4 — Rendering)
    │                                  │
    ▼                                  │
Phase 5 (US2 — Document Content)       │
    │                                  │
    ├──────────────────────────────────┘
    ▼
Phase 6 (US3 — Embedding Cleanup) [can start anytime after Phase 1]
    │
    ▼
Phase 7 (Polish)
```

### Parallel Opportunities

**Phase 2**: T003 + T004 can run in parallel (different files)
**Phase 3 + Phase 4**: US1 (prompt) and US4 (rendering) are fully independent — different files, no shared state
**Phase 6**: US3 (cleanup) is independent of all UI work — can run in parallel with Phases 3-5
**Phase 6**: T028, T029, T030, T031 can all run in parallel (different action files)

---

## Implementation Strategy

### MVP (US1 + US4)

1. Phase 1: Install dependencies
2. Phase 2: Text extraction helper
3. Phase 3: Dynamic system prompt (AI knows course/week)
4. Phase 4: Markdown + LaTeX rendering
5. **VALIDATE**: Ask a math question → AI mentions course/week → response renders with real math

### Incremental

1. MVP → context-aware AI with rendered responses
2. US2 → AI sees student's document content
3. US3 → embedding cleanup on deletion
4. Polish → full test suite, lint, build

---

## Notes

- Total: 38 tasks across 7 phases
- No new migrations — all changes are to application code
- `deleteEmbeddingsBySource()` already exists in `src/lib/queries/embeddings.ts` — US3 just wires it up
- `extractPlainText()` pattern exists in `src/lib/pdf/tiptap-to-pdf.ts` — T003 extends it for math nodes
- KaTeX CSS must be imported in the chat panel component (T015), not just in tiptap-editor.tsx
- `react-markdown` v9 is ESM-only — verify Next.js 16 compatibility in T002
- The `DocumentWithAi` Client Component wrapper (T019) is the key architectural piece for US2
