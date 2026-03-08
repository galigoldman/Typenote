# Quickstart: Freeform Canvas Editor

**Branch**: `001-canvas-editor` | **Date**: 2026-03-08

## Prerequisites

- Node.js 18+, pnpm 10+
- Supabase CLI (for local DB and migrations)
- A device with stylus support for manual testing (iPad + Apple Pencil, Surface with pen, or Wacom tablet)

## New Dependency

```bash
pnpm add perfect-freehand
```

No other new dependencies. All other features use native browser APIs (Pointer Events, Canvas, IntersectionObserver).

## Key Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `src/components/canvas/canvas-page.tsx` | Single A4 page: canvas layer + text layer + interaction layer |
| `src/components/canvas/canvas-editor.tsx` | Document-level container: pages list, scroll, zoom, toolbar |
| `src/components/canvas/canvas-toolbar.tsx` | Tool switcher: Pen, Eraser, Selection/Cut |
| `src/components/canvas/text-box.tsx` | Positioned text box with own TipTap editor instance |
| `src/components/canvas/selection-overlay.tsx` | SVG overlay for lasso/rectangle selection and handles |
| `src/hooks/use-drawing.ts` | Pen stroke capture, rendering, perfect-freehand integration |
| `src/hooks/use-canvas-zoom.ts` | Pinch-to-zoom and trackpad zoom handling |
| `src/hooks/use-selection.ts` | Selection tool logic: lasso, rectangle, hit detection, move |
| `src/hooks/use-eraser.ts` | Eraser tool: stroke hit detection and removal |
| `src/hooks/use-canvas-pages.ts` | Page management: auto-create, virtualization |
| `src/lib/canvas/stroke-utils.ts` | Stroke rendering, bbox computation, point-in-polygon |
| `src/lib/canvas/coordinate-utils.ts` | Screen ↔ page coordinate transforms |
| `src/lib/canvas/text-split.ts` | ProseMirror document splitting logic |
| `src/types/canvas.ts` | TypeScript types: Stroke, Page, TextBox, CanvasDocument |

### Modified files

| File | Change |
|------|--------|
| `src/components/editor/tiptap-editor.tsx` | Replace with canvas-editor for documents using canvas mode |
| `src/hooks/use-document-sync.ts` | Handle `pages` field in save/load |
| `src/hooks/use-auto-save.ts` | Support saving `pages` JSONB alongside content |
| `src/hooks/use-realtime-sync.ts` | Sync `pages` field via Realtime |
| `src/lib/actions/documents.ts` | Accept and persist `pages` in server actions |
| `src/types/database.ts` | Add `pages` field to Document type |
| `supabase/migrations/` | New migration adding `pages` column |

## Architecture Overview

```
┌─ canvas-editor.tsx ──────────────────────────────────────┐
│  Scroll container + zoom transform                       │
│  ┌─ canvas-page.tsx (per A4 page) ─────────────────────┐ │
│  │  Layer 1: Page background (white + grid/lines CSS)  │ │
│  │  Layer 2: <canvas> (committed + working strokes)    │ │
│  │  Layer 3: Text boxes (positioned TipTap editors)    │ │
│  │  Layer 4: Selection overlay (SVG)                   │ │
│  │  Layer 5: Interaction layer (transparent, events)   │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─ canvas-toolbar.tsx ────────────────────────────────┐ │
│  │  [Pen] [Eraser] [Selection/Cut]                     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Running Locally

```bash
# Start Supabase locally
pnpm supabase start

# Run the new migration (after creating it)
pnpm supabase db reset

# Install dependencies (including perfect-freehand)
pnpm install

# Start dev server
pnpm dev
```

## Testing Strategy

- **Unit tests**: Stroke utils (bbox computation, point-in-polygon, coordinate transforms)
- **Integration tests**: Drawing hook (mock pointer events → verify stroke data), save/load cycle
- **E2E tests**: Limited — stylus input is difficult to simulate in Playwright. Focus on tool switching, page creation, and text typing flows. Use `page.dispatchEvent()` with `pointerType: 'pen'` for basic pen simulation.
