# Implementation Plan: Freeform Canvas Editor

**Branch**: `001-canvas-editor` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-canvas-editor/spec.md`

## Summary

Replace the current text-only TipTap editor with a GoodNotes/OneNote-style freeform canvas. The canvas uses a layered architecture: HTML Canvas for pen strokes (rendered via `perfect-freehand`), positioned HTML divs for text boxes (each with its own TipTap instance), and an SVG overlay for selection feedback. Documents are structured as vertically-scrolled A4 pages with strokes and text boxes stored in a new `pages` JSONB column. Stylus-only drawing via Pointer Events API, whole-stroke eraser, rectangle/lasso selection with drag-to-move, pinch-to-zoom via CSS transforms.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16
**Primary Dependencies**: TipTap 3 (text editing), `perfect-freehand` (stroke geometry), Pointer Events API (input), Canvas 2D API (rendering)
**Storage**: Supabase PostgreSQL — new `pages` JSONB column on `documents` table
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web — iPads, tablets, laptops with stylus. Safari, Chrome, Firefox
**Project Type**: Web application (Next.js)
**Performance Goals**: <50ms stroke latency, 60fps during drawing, responsive with 500+ strokes across 10+ pages
**Constraints**: `pages` JSONB must stay under ~800 KB for Supabase Realtime compatibility. Stylus-only drawing (no mouse/trackpad).
**Scale/Scope**: Single-user note-taking app. Documents up to ~10-15 pages with moderate stroke density.

## Constitution Check

*No constitution defined — no gates to check.*

## Project Structure

### Documentation (this feature)

```text
specs/001-canvas-editor/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technical research
├── data-model.md        # Phase 1: data model design
├── quickstart.md        # Phase 1: setup guide
├── contracts/           # Phase 1: type contracts
│   └── canvas-data-contract.ts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── canvas/                    # NEW: Canvas editor components
│   │   ├── canvas-editor.tsx      # Document container: pages, scroll, zoom
│   │   ├── canvas-page.tsx        # Single A4 page: canvas + text + interaction layers
│   │   ├── canvas-toolbar.tsx     # Tool switcher: Pen, Eraser, Selection
│   │   ├── text-box.tsx           # Positioned text box with TipTap editor
│   │   └── selection-overlay.tsx  # SVG overlay for selection feedback
│   ├── editor/                    # EXISTING: Modified for canvas integration
│   │   ├── tiptap-editor.tsx      # Modified: delegate to canvas-editor
│   │   └── editor-toolbar.tsx     # Existing text formatting toolbar
│   ├── dashboard/                 # EXISTING: Unchanged
│   └── ui/                        # EXISTING: Unchanged
├── hooks/
│   ├── use-drawing.ts             # NEW: Pen stroke capture + rendering
│   ├── use-canvas-zoom.ts         # NEW: Pinch-to-zoom + trackpad zoom
│   ├── use-selection.ts           # NEW: Selection tool logic
│   ├── use-eraser.ts              # NEW: Eraser hit detection + removal
│   ├── use-canvas-pages.ts        # NEW: Page management + auto-creation
│   ├── use-document-sync.ts       # MODIFIED: Handle `pages` field
│   ├── use-auto-save.ts           # MODIFIED: Save `pages` alongside content
│   └── use-realtime-sync.ts       # MODIFIED: Sync `pages` via Realtime
├── lib/
│   ├── canvas/                    # NEW: Canvas utilities
│   │   ├── stroke-utils.ts        # Stroke rendering, bbox, path conversion
│   │   ├── coordinate-utils.ts    # Screen ↔ page coordinate transforms
│   │   └── text-split.ts          # ProseMirror document splitting
│   ├── actions/
│   │   └── documents.ts           # MODIFIED: Accept `pages` in save actions
│   └── ...
├── types/
│   ├── canvas.ts                  # NEW: Stroke, Page, TextBox, CanvasDocument
│   └── database.ts                # MODIFIED: Add `pages` to Document type
└── ...

supabase/
└── migrations/
    └── 00003_add_pages_column.sql # NEW: Add `pages` JSONB column

tests/
├── unit/
│   ├── stroke-utils.test.ts       # NEW: bbox, point-in-polygon, rendering
│   ├── coordinate-utils.test.ts   # NEW: coordinate transforms
│   └── text-split.test.ts         # NEW: ProseMirror splitting
├── integration/
│   └── canvas-save-load.test.ts   # NEW: Save/load canvas documents
└── e2e/
    └── canvas-editor.spec.ts      # NEW: Tool switching, typing, page creation
```

**Structure Decision**: Follows the existing Next.js project structure. New canvas components go in `src/components/canvas/`, new hooks in `src/hooks/`, new utilities in `src/lib/canvas/`. No new top-level directories needed.
