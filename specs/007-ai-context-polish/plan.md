# Implementation Plan: AI Context Polish

**Branch**: `007-ai-context-polish` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-ai-context-polish/spec.md`

## Summary

Polish the existing AI context engine with four focused improvements: (1) dynamic system prompt with course/week awareness, (2) pass the student's current document content to the AI, (3) render AI responses with markdown and LaTeX, (4) clean up embeddings when materials are deleted. No architecture changes — the existing text-based RAG pipeline is preserved.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+ + Next.js 16 (App Router), Vercel AI SDK, `@google/genai`
**Storage**: PostgreSQL via Supabase + pgvector, Supabase Storage (existing)
**Testing**: Vitest (unit + integration), Playwright (e2e)
**Target Platform**: Web (Next.js)
**Project Type**: Web application (full-stack)
**Constraints**: No new migrations, no architecture changes, preserve existing RAG pipeline

**New Dependencies**: `react-markdown`, `remark-math`, `rehype-katex`

## Constitution Check

| Principle                       | Status | Notes                                                                             |
| ------------------------------- | ------ | --------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | 4 independent stories, each produces working increment                            |
| II. Test-Driven Quality         | PASS   | Unit tests for prompt builder, rendering; integration tests for embedding cleanup |
| III. Protected Main Branch      | PASS   | Feature branch `007-ai-context-polish`, PR with CI                                |
| IV. Migrations as Code          | N/A    | No new migrations in this feature                                                 |
| V. Interview-Ready Architecture | PASS   | Prompt engineering, RAG context injection, component data flow                    |

## Project Structure

### Documentation

```text
specs/007-ai-context-polish/
├── spec.md
├── plan.md                    # This file
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    └── ai-ask-api.md
```

### Source Code Changes

```text
src/lib/ai/
├── prompts.ts                  # MODIFIED — buildSystemPrompt() replaces static SYSTEM_PROMPT

src/lib/actions/
├── ai-context.ts               # MODIFIED — accept courseName, weekLabel, documentContent
├── course-materials.ts          # MODIFIED — add embedding cleanup on delete
├── course-weeks.ts              # MODIFIED — add embedding cleanup on delete
├── courses.ts                   # MODIFIED — add embedding cleanup on delete

src/lib/moodle/
├── sync-service.ts              # MODIFIED — add embedding cleanup on file removal

src/app/api/ai/
├── ask/route.ts                 # MODIFIED — pass new fields through

src/components/ai/
├── ai-chat-panel.tsx            # MODIFIED — accept doc content, use markdown renderer
├── ai-chat-wrapper.tsx          # MODIFIED — accept and pass doc content + course metadata
├── markdown-response.tsx        # NEW — reusable markdown+KaTeX renderer component

src/app/(dashboard)/dashboard/
├── documents/[docId]/page.tsx   # MODIFIED — fetch week data, render DocumentWithAi wrapper

src/components/ai/
├── document-with-ai.tsx         # NEW — Client Component bridge between editor and AI panel

src/components/canvas/
├── canvas-editor.tsx            # MODIFIED — expose getDocumentText() via ref
```

## Phases

### Phase 1: Dynamic System Prompt (US1)

**Files**: `prompts.ts`, `ai-context.ts`, `ask/route.ts`, `ai-chat-panel.tsx`, `ai-chat-wrapper.tsx`, `documents/[docId]/page.tsx`

1. Convert `SYSTEM_PROMPT` to `buildSystemPrompt({ courseName, weekLabel, hasDocumentContent })` in `prompts.ts`
2. Extend `QuestionParams` with `courseName`, `weekLabel` in `ai-context.ts`
3. Call `buildSystemPrompt()` in `askQuestion()` instead of using static prompt
4. Pass `courseName`, `weekLabel` through `ask/route.ts`
5. Extend `AiChatPanel` and `AiChatWrapper` props to accept `courseName`, `weekLabel`
6. In document page: **fetch the week record** from `course_weeks` (currently only fetches course, not week — need `week_number` for the label)
7. Wire course name + week number into `AiChatWrapper`
8. Hide AI panel when no `courseId` is available
9. Tests: unit test for `buildSystemPrompt()`, verify prompt includes course/week

### Phase 2: Document Content Awareness (US2)

**Files**: `canvas-editor.tsx`, `ai-chat-panel.tsx`, `documents/[docId]/page.tsx`, `ai-context.ts`, `ask/route.ts`, NEW `document-with-ai.tsx`

**Key challenge**: The document page is a Server Component. `CanvasEditor` and `AiChatWrapper` are rendered as siblings. A Server Component can't create refs/callbacks to bridge them. Solution: create a new `DocumentWithAi` Client Component wrapper.

1. Create `src/components/ai/document-with-ai.tsx` — a Client Component that:
   - Renders both `CanvasEditor` and `AiChatWrapper` as children
   - Holds a ref to a `getDocumentText` function
   - Passes this ref to `CanvasEditor` (which populates it)
   - Passes the getter to `AiChatWrapper` (which calls it before each question)
2. Add text extraction helper that handles both document types:
   - Canvas documents: iterate `pages[].flowContent`, extract text + math from each
   - Text documents: extract from `content` field
   - Include math node LaTeX wrapped in `$...$` for AI readability
3. In `CanvasEditor`: accept a `onDocumentTextReady` ref/callback, populate it with a function that returns current document text from all page editors
4. Refactor document page to use `DocumentWithAi` wrapper instead of rendering siblings directly
5. In `AiChatPanel`, call `getDocumentContent()` at question-time (fresh content each question)
6. Send `documentContent` to `/api/ai/ask`
7. In `askQuestion()`, inject document content as a labeled turn: "Here is the student's current document:\n\n{content}"
8. Truncate to 50K chars if needed
9. Tests: unit test for text extraction helper, verify doc content appears in AI context

### Phase 3: Markdown + LaTeX Rendering (US4)

**Files**: `ai-chat-panel.tsx`, NEW `markdown-response.tsx`

1. Install `react-markdown`, `remark-math`, `rehype-katex`
   - Note: `react-markdown` v9 is ESM-only. Verify compatibility with Next.js 16 before proceeding. If issues, use v8.
2. Create `MarkdownResponse` component using react-markdown + remark-math + rehype-katex
3. **Import KaTeX CSS in the chat panel component** (currently only imported in `tiptap-editor.tsx` — won't be available on the course page where there's no TipTap editor)
4. Apply Tailwind `prose` class for markdown styling (plugin already installed)
5. Replace `<div className="whitespace-pre-wrap">{msg.content}</div>` with `<MarkdownResponse content={msg.content} />`
6. Style the prose container to fit the chat panel (smaller text, tighter spacing than default prose)
7. Tests: unit test for MarkdownResponse with various content (plain text, markdown, LaTeX, mixed)

### Phase 4: Embedding Cleanup (US3)

**Files**: `course-materials.ts`, `course-weeks.ts`, `courses.ts`, `sync-service.ts`

1. In `deleteCourseMaterial()`: call `deleteEmbeddingsBySource('course_material', materialId)` before deleting the DB record
2. In `deleteCourseWeek()`: for each material in the week, call `deleteEmbeddingsBySource()`
3. In `deleteCourse()`: for each material across all weeks, call `deleteEmbeddingsBySource()`
4. In `flagRemovedFiles()`: call `deleteEmbeddingsBySource('moodle_file', fileId)` for each removed file
5. Tests: integration test verifying embedding rows are deleted after material deletion

### Phase 5: Polish & Cross-Cutting

1. Run `pnpm test` — all tests pass
2. Run `pnpm lint` — zero errors
3. Run `pnpm build` — verify build succeeds
4. Manual test: full flow from document editor → AI panel → verify context-aware response with rendered math
5. Verify AI conversation resets when switching documents

## Dependencies & Execution Order

```
Phase 1 (System Prompt) ─────────────────┐
    │                                     │
    ▼                                     ▼
Phase 2 (Document Content)    Phase 3 (Rendering)
    │                                     │
    ▼                                     │
Phase 4 (Embedding Cleanup) ──────────────┘
    │
    ▼
Phase 5 (Polish)
```

### Parallel Opportunities

- **Phase 1 + Phase 3**: Independent — prompt changes and rendering are in different files
- **Phase 4**: Can start anytime (independent of UI work)
- **Phase 2 depends on Phase 1**: Document content injection builds on the extended API params

## Interview-Ready Concepts

- **Prompt Engineering**: Dynamic context injection vs static prompts — how context window usage affects response quality
- **Component Data Flow**: How to bridge sibling components (editor ↔ AI panel) without global state — callbacks vs context vs stores
- **RAG Architecture**: Why we keep text-based search but plan multimodal upgrade — cost vs quality tradeoffs at different scales
- **Embedding Lifecycle**: Why embedding cleanup on deletion matters — stale vector results and their impact on RAG quality
