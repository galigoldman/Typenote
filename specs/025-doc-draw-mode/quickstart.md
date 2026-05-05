# Quickstart: Enable Draw Mode in Text Documents

**Feature**: 025-doc-draw-mode
**Date**: 2026-03-24

## Prerequisites

- Node.js 22+, pnpm
- Local Supabase running (`supabase start`)
- `.env.local` configured

## Setup

```bash
git checkout 025-doc-draw-mode
pnpm install
pnpm dev
```

No migration needed — uses existing `pages` JSONB column.

## How to Test Manually

1. Open the app, navigate to a text-only document (e.g., an imported .docx)
2. The toolbar should now show a **Draw** toggle button
3. Tap **Draw** — sub-tools appear (pen, highlighter, eraser)
4. Draw strokes on the document
5. Switch back to text mode — strokes should remain visible
6. Reload the page — strokes should persist

## Key Files to Work With

| File                                                       | Purpose                                           |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `src/components/editor/tiptap-editor.tsx`                  | Main text editor — add drawing overlay            |
| `src/components/editor/editor-toolbar.tsx`                 | Toolbar — add draw mode toggle + sub-tools        |
| `src/components/editor/drawing-overlay.tsx`                | **NEW** — Canvas overlay for drawing on text docs |
| `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` | Routing — fix `isTextDocument` check              |
| `src/hooks/use-drawing.ts`                                 | Drawing hook — reuse as-is                        |
| `src/hooks/use-eraser.ts`                                  | Eraser hook — reuse as-is                         |
| `src/types/canvas.ts`                                      | Types — Stroke, CanvasPage, CanvasTool            |

## Running Tests

```bash
pnpm test          # Unit tests
pnpm lint          # Linting
```
