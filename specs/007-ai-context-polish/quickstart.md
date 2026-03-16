# Quickstart: AI Context Polish

**Feature**: 007-ai-context-polish
**Date**: 2026-03-15

## Prerequisites

- Node.js 18+, pnpm
- Local Supabase running (`supabase start`)
- `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`
- A course with at least one week and one uploaded PDF (for testing search/answer)

## Key files to modify

### System Prompt (US1)
- `src/lib/ai/prompts.ts` — convert static `SYSTEM_PROMPT` to `buildSystemPrompt()` function

### API & Server Action (US1 + US2)
- `src/lib/actions/ai-context.ts` — extend `askQuestion()` params, inject document content + dynamic prompt
- `src/app/api/ai/ask/route.ts` — pass new fields through

### UI Components (US1 + US2 + US4)
- `src/components/ai/ai-chat-panel.tsx` — accept document content callback, render markdown+LaTeX
- `src/components/ai/ai-chat-wrapper.tsx` — accept and pass document content props
- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` — wire up document content + course metadata
- `src/components/canvas/canvas-editor.tsx` — expose method to get current document text

### Embedding Cleanup (US3)
- `src/lib/actions/course-materials.ts` — add `deleteEmbeddingsBySource()` call
- `src/lib/actions/course-weeks.ts` — add cleanup for all materials in week
- `src/lib/actions/courses.ts` — add cleanup for all materials in course
- `src/lib/moodle/sync-service.ts` — add cleanup when files are flagged as removed

### Response Rendering (US4)
- `src/components/ai/ai-chat-panel.tsx` — replace `whitespace-pre-wrap` with markdown+KaTeX renderer
- New component: `src/components/ai/markdown-response.tsx` — reusable markdown+LaTeX renderer

### New dependencies (US4)
- `react-markdown`
- `remark-math`
- `rehype-katex`

## Testing

```bash
pnpm test          # unit tests
pnpm lint          # lint check
pnpm build         # verify build
```

## Manual verification

1. Open a document linked to a course/week
2. Open AI panel, ask a question
3. Verify response mentions course name and week
4. Verify LaTeX renders as visual math
5. Type some notes, ask "is my solution correct?" — verify AI references your content
6. Delete a course material, verify no stale search results
