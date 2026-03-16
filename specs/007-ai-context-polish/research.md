# Research: AI Context Polish

**Feature**: 007-ai-context-polish
**Date**: 2026-03-15

## R1: How to extract text from the TipTap editor

**Decision**: Use `extractPlainText()` helper (already exists in `src/lib/pdf/tiptap-to-pdf.ts`) to recursively extract text from TipTap JSON. For math nodes, include the `latex` attribute value wrapped in `$...$` so the AI can read mathematical expressions.

**Rationale**: TipTap stores content as JSON, not HTML. The project already has a plain-text extraction function used for PDF export. The editor exposes `editor.getJSON()` to get the current document state. For canvas documents, content is spread across multiple pages in `flowContent` fields. We need to extract from all pages and concatenate.

**Alternatives considered**:

- `editor.getText()` — TipTap's built-in, but loses math node content entirely (just skips them)
- `editor.getHTML()` — returns HTML which is noisy and wastes tokens
- JSON serialization — would preserve structure but is too verbose for AI context

**Key finding**: The `CanvasEditor` component stores a Map of editors (`editorsRef`) keyed by pageId. There's also `activeEditor` state. For document content, we should iterate over all pages' `flowContent` rather than relying on a single editor instance.

## R2: How to render markdown + LaTeX in AI chat responses

**Decision**: Install `react-markdown` + `remark-math` + `rehype-katex`. Use these to render AI responses with markdown formatting and KaTeX math rendering. KaTeX is already installed (`katex@^0.16.37`). The `@tailwindcss/typography` plugin is installed and provides `prose` classes for styling.

**Rationale**: This is the standard React stack for rendering markdown with embedded LaTeX. KaTeX CSS is already loaded in the project (imported in `tiptap-editor.tsx`). The `prose` class from Tailwind Typography handles markdown styling out of the box.

**Alternatives considered**:

- `markdown-it` + manual KaTeX — more control but more custom code, no React integration
- Custom parser — too much work for standard markdown+math rendering
- `dangerouslySetInnerHTML` with a markdown-to-HTML library — XSS risk, unnecessary
- TipTap read-only editor — overkill for displaying AI responses

**New dependencies**: `react-markdown`, `remark-math`, `rehype-katex`

## R3: Embedding cleanup on deletion

**Decision**: Call `deleteEmbeddingsBySource()` (already exists in `src/lib/queries/embeddings.ts`) from the existing deletion functions in `course-materials.ts`, `course-weeks.ts`, `courses.ts`, and `sync-service.ts`.

**Rationale**: The cleanup function already exists and is unused. The deletion actions already handle storage file cleanup and DB record deletion — they just don't call embedding cleanup. This is a one-liner addition to each deletion function.

**Gaps found**:

| Action                   | Storage cleanup | DB cleanup | Embedding cleanup |
| ------------------------ | --------------- | ---------- | ----------------- |
| Delete course material   | Yes             | Yes        | **Missing**       |
| Delete course week       | Yes             | Yes        | **Missing**       |
| Delete course            | Yes             | Yes        | **Missing**       |
| Flag Moodle file removed | No              | Flags only | **Missing**       |

**Key file**: `deleteEmbeddingsBySource(sourceType, sourceId)` at `src/lib/queries/embeddings.ts:49-59`

## R4: How to pass document content from editor to AI panel

**Decision**: Add a `getDocumentContent` callback prop to `AiChatPanel`/`AiChatWrapper`. The document page component creates this callback using the editor instance or document data. The callback is called at question-time (not on mount) to get the latest content.

**Rationale**: The AI panel and editor are sibling components rendered by the document page. There's no shared context or state management. A callback is the simplest way to bridge them without introducing global state.

**Options considered**:

- React Context — adds complexity, would need to wrap the page
- Zustand/global store — not in the project, overkill
- Ref forwarding — awkward across sibling components
- Reading from Supabase — stale (only saved content), not real-time

**For the document page**: The page already fetches the document from Supabase. For canvas documents, it has `pages` with `flowContent`. For text documents, it has `content`. We can serialize the stored content on the server side AND provide a callback for client-side real-time content.

**Approach**: Since the document page is a Server Component and the editor is a Client Component, we'll:

1. Pass the initial document content (from DB) as a prop to AiChatWrapper
2. Also pass a `getDocumentContent` callback that the AiChatPanel calls before each question
3. The CanvasEditor exposes a ref or callback that returns current content

## R5: Dynamic system prompt with course/week context

**Decision**: Modify `askQuestion()` to accept `courseName` and `weekLabel` parameters. Build the system prompt dynamically by injecting these into a template. The current static `SYSTEM_PROMPT` becomes a function `buildSystemPrompt({ courseName, weekLabel, hasDocumentContent })`.

**Rationale**: The current prompt is a static string. It needs to become dynamic to include course/week context. The API route already receives `courseId` — we just need to look up the course name and week label, or pass them from the client (which already has this data from the page props).

**Trade-off**: Look up in server action vs pass from client.

- Server lookup: adds a DB query per request, but guarantees accuracy
- Client pass: no extra query, but client could send wrong data
- **Decision**: Pass from client. The document page already fetches course/week data. The worst case of wrong data is a slightly off AI response, not a security issue.
