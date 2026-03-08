# Inline Math Feature Design

## Overview

Users can type `$` to insert an inline math expression. A text input box appears where they type natural language (e.g., "square root of x plus 5"). On Enter, Google Gemini converts it to LaTeX, and KaTeX renders it inline. The expression persists as part of the document's TipTap JSON.

## Architecture: Single InlineMath Node

One custom TipTap node handles all states — editing and display — via a React NodeView component.

### Node Attributes

| Attribute         | Type   | Persisted | Purpose                                  |
| ----------------- | ------ | --------- | ---------------------------------------- |
| `latex`           | string | Yes       | LaTeX expression rendered by KaTeX       |
| `naturalLanguage` | string | Yes       | Original NL input, shown when re-editing |

`isEditing` is transient React state in the NodeView component — not stored in the document.

## UX Flow

### Inserting New Math

1. User types `$` (or clicks toolbar button) → `$` consumed, `InlineMath` node inserted
2. Input box appears inline, auto-focused
3. User types natural language, presses Enter
4. Loading spinner → API call to Gemini → LaTeX returned
5. Node updates with `latex` + `naturalLanguage`, KaTeX renders inline
6. Escape → node deleted (cancelled)

### Editing Existing Math

1. Click rendered expression → input box reopens with `naturalLanguage` pre-filled
2. Toggle button switches between NL mode and raw LaTeX mode
3. NL mode + Enter: if text unchanged, skip AI call and close; if changed, call AI
4. LaTeX mode + Enter: update `latex` directly, no AI call
5. Escape → cancel, revert to previous expression

### Toolbar

- Math button (Sigma icon) in the editor toolbar, inserts an `InlineMath` node

## Persistence

- TipTap `editor.getJSON()` serializes `InlineMath` nodes with their `latex` and `naturalLanguage` attributes
- Stored in `documents.content` (JSONB) in Supabase via existing auto-save flow
- On reload, `editor.setContent(json)` reconstructs nodes → KaTeX renders → user sees math, not input boxes
- No database schema migration needed

## API Route

**`POST /api/math/translate`**

- Request: `{ "text": "square root of x plus 5" }`
- Response: `{ "latex": "\\sqrt{x + 5}" }`
- Uses `generateText` from Vercel AI SDK with `google('gemini-2.5-flash')`
- System prompt: output only raw LaTeX, no delimiters/markdown/explanation
- Sanitizes response (strips accidental `$$`, `\[`, markdown fences)
- Error: `{ "error": "message" }` with 400/500 status codes
- Env var: `GOOGLE_GENERATIVE_AI_API_KEY`

## Error Handling

- AI failure → error shown inline in the input box, user can retry
- Node stays in editing mode until successful or cancelled

## File Changes

| File                                       | Action | Purpose                                               |
| ------------------------------------------ | ------ | ----------------------------------------------------- |
| `src/lib/editor/inline-math.ts`            | New    | TipTap InlineMath node extension                      |
| `src/components/editor/math-node-view.tsx` | New    | React NodeView (input, KaTeX render, NL/LaTeX toggle) |
| `src/lib/editor/math-api.ts`               | New    | Client function to call translate API                 |
| `src/app/api/math/translate/route.ts`      | New    | Next.js API route (Vercel AI SDK + Gemini)            |
| `src/components/editor/tiptap-editor.tsx`  | Edit   | Register InlineMath extension                         |
| `src/components/editor/editor-toolbar.tsx` | Edit   | Add math toolbar button                               |
| `src/app/globals.css`                      | Edit   | Import KaTeX CSS                                      |

## Dependencies

- `ai` — Vercel AI SDK
- `@ai-sdk/google` — Google Gemini provider
- `katex` — LaTeX rendering
- `@types/katex` — TypeScript types

## Testing

| Test File                       | Type        | Verifies                                                                                                       |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `inline-math.test.ts`           | Unit        | Node extension: attributes, `$` shortcut, schema                                                               |
| `math-node-view.test.tsx`       | Unit        | Component: edit/display modes, Enter/Escape, toggle, skip AI when unchanged                                    |
| `route.test.ts`                 | Unit        | API route: valid input, missing text (400), AI failure (500)                                                   |
| `math-api.test.ts`              | Unit        | Client function: correct endpoint, success/error handling                                                      |
| `inline-math-roundtrip.test.ts` | Integration | Insert → getJSON → new editor → verify node renders with correct latex (simulates refresh)                     |
| `inline-math-sync.test.ts`      | Integration | Insert → save via updateDocumentContent → load back → verify math node intact (simulates full save/load cycle) |
