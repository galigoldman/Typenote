# Quickstart: Infinite Canvas with Moveable Elements & iPad Drawing

## Prerequisites

- Node.js 20+, pnpm 10+
- Supabase CLI (local development)
- iPad with Apple Pencil (for manual testing)
- Both devices on same network (for iPad testing against local dev server)

## Setup

```bash
# Install new dependency (gesture handling)
pnpm add @use-gesture/react

# Start local dev
pnpm dev
```

## Testing on iPad

1. Find your Mac's local IP: `ipconfig getifaddr en0`
2. Start dev server: `pnpm dev --hostname 0.0.0.0`
3. On iPad Safari, navigate to `http://<your-ip>:3000`
4. For PWA install: Tap Share → "Add to Home Screen"

**Note**: Service workers require HTTPS. Use `ngrok` or deploy to staging for full PWA testing.

## Key Files

### Canvas System (new)

| Area | File | Purpose |
|------|------|---------|
| Canvas container | `src/components/canvas/canvas-viewport.tsx` | Pan/zoom viewport with CSS transforms |
| Canvas element | `src/components/canvas/canvas-element.tsx` | Positioned, draggable element wrapper |
| Text block | `src/components/canvas/text-block.tsx` | TipTap editor inside a canvas element |
| Drawing layer | `src/components/canvas/drawing-layer.tsx` | Canvas 2D drawing surface |
| Canvas toolbar | `src/components/canvas/canvas-toolbar.tsx` | Drawing tools, background, mode toggle |
| Selection | `src/components/canvas/selection-manager.tsx` | Multi-select, lasso, shift-click |
| Viewport state | `src/lib/canvas/viewport-store.ts` | Zustand store for pan/zoom state |
| Element types | `src/lib/canvas/types.ts` | CanvasElement, TextBlock, DrawingLayer |
| History manager | `src/lib/canvas/history-manager.ts` | Global undo/redo command stack |
| Editor manager | `src/lib/canvas/editor-manager.ts` | Registry of active TipTap instances |

### Existing Files (modified)

| Area | File | Change |
|------|------|--------|
| Document page | `src/app/(dashboard)/documents/[id]/page.tsx` | Route to canvas or linear editor based on `content.format` |
| Document sync | `src/hooks/use-document-sync.ts` | Switch to notification-then-fetch sync |
| Realtime sync | `src/hooks/use-realtime-sync.ts` | Use `updated_at` signal, fetch full doc |
| Drawing types | `src/lib/drawing/types.ts` | Extend for canvas element model |
| Stroke renderer | `src/lib/drawing/stroke-renderer.ts` | Adapt for canvas coordinate system |
| Document actions | `src/lib/actions/documents.ts` | Canvas-aware save/load helpers |
| Database types | `src/types/database.ts` | Add canvas format types |
| Create dialog | `src/components/dashboard/create-document-dialog.tsx` | Add canvas document option |

### Existing Files (unchanged)

| Area | File | Purpose |
|------|------|---------|
| Offline cache | `src/lib/offline/document-cache.ts` | Works with canvas JSONB as-is |
| Sync queue | `src/lib/offline/sync-queue.ts` | Works with canvas JSONB as-is |
| Service worker | `src/app/sw.ts` | PWA caching unchanged |
| PWA manifest | `public/manifest.json` | Already configured |

## Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Specific test files
pnpm test src/lib/canvas/history-manager.test.ts
pnpm test:e2e e2e/canvas.spec.ts
```

## Architecture Quick Reference

```
Canvas Document Architecture
─────────────────────────────
┌─────────────────────────────────────────────┐
│  Viewport Container                         │
│  (handles pan/zoom via CSS transform)       │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  DOM Layer (transformed div)         │   │
│  │  ┌──────────┐  ┌──────────┐         │   │
│  │  │Text Block│  │Text Block│  ...     │   │
│  │  │(TipTap)  │  │(TipTap)  │         │   │
│  │  └──────────┘  └──────────┘         │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Canvas Layer (HTML5 Canvas)         │   │
│  │  Strokes rendered with               │   │
│  │  perfect-freehand + Canvas 2D        │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Interaction Layer                   │   │
│  │  Pointer events → route by type:     │   │
│  │  pen → draw | touch → pan/zoom       │   │
│  │  mouse → tool-dependent              │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

Data Flow
─────────
User action
  → Command created (TextEdit / Stroke / CanvasOp)
  → Pushed to HistoryManager (global undo stack)
  → Canvas state updated
  → Auto-save debounce (800ms)
  → Save canvas JSONB to Supabase
  → Supabase Realtime sends updated_at signal
  → Other device fetches full document
  → Diffs and applies canvas changes
```
