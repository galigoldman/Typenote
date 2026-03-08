# Implementation Plan: Infinite Canvas with Moveable Elements & iPad Drawing

**Branch**: `002-ipad-pen-support` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ipad-pen-support/spec.md`

## Summary

Transform Typenote from a linear TipTap editor into a freeform infinite canvas where text blocks (each containing a TipTap rich-text editor) and drawing layers can be freely positioned and moved. Uses a custom hybrid architecture: CSS transforms for DOM-based text blocks + HTML5 Canvas overlay for Apple Pencil drawing. All canvas content syncs across devices via a notification-then-fetch pattern over Supabase Realtime. Global undo/redo via a unified Command Pattern history manager.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 20+
**Primary Dependencies**: Next.js 16.1.6, React 19.2.3, TipTap 3.20.1, Supabase SSR 0.9.0, perfect-freehand, @use-gesture/react (new), Serwist 9.5.6
**Storage**: PostgreSQL via Supabase — `documents.content` JSONB column (extended with canvas format)
**Testing**: Vitest (unit/integration), Playwright (e2e)
**Target Platform**: Web — iPad Safari 16+ (primary), Desktop Chrome/Firefox/Safari (secondary)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: 60fps canvas rendering, <16ms stroke latency, sync within 3 seconds
**Constraints**: No hard cap on elements per document, offline-capable, $0 licensing cost
**Scale/Scope**: 100+ elements, 1,000+ strokes per viewport as performance floor target

## Constitution Check

*GATE: The constitution file contains only placeholder templates — no project-specific gates defined. Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/002-ipad-pen-support/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: canvas document format
├── quickstart.md        # Phase 1: setup and key files
├── contracts/
│   ├── canvas-document-format.md  # Canvas JSONB schema
│   ├── canvas-sync-protocol.md    # Notification-then-fetch sync
│   ├── pwa-manifest.md            # PWA configuration (existing)
│   └── tiptap-drawing-node.md     # Drawing block node (existing, superseded by canvas)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (dashboard)/documents/[id]/page.tsx  # Modified: route to canvas or linear editor
│   └── sw.ts                                # Existing: service worker (unchanged)
├── components/
│   ├── canvas/                              # NEW: canvas UI components
│   │   ├── canvas-viewport.tsx              # Pan/zoom container with CSS transforms
│   │   ├── canvas-element.tsx               # Positioned, draggable element wrapper
│   │   ├── text-block.tsx                   # TipTap editor inside canvas element
│   │   ├── drawing-layer.tsx                # Canvas 2D drawing surface
│   │   ├── canvas-toolbar.tsx               # Drawing tools, background, mode toggle
│   │   ├── selection-manager.tsx            # Multi-select, lasso, shift-click
│   │   └── background-renderer.tsx          # CSS gradient backgrounds
│   ├── dashboard/
│   │   └── create-document-dialog.tsx       # Modified: add canvas document option
│   ├── drawing/                             # Existing: adapted for canvas coords
│   │   ├── drawing-canvas.tsx               # Modified: work with canvas layer
│   │   └── drawing-toolbar.tsx              # Modified: expanded colors/widths
│   └── editor/                              # Existing: linear editor (unchanged)
├── hooks/
│   ├── use-document-sync.ts                 # Modified: notification-then-fetch
│   ├── use-realtime-sync.ts                 # Modified: signal-based sync
│   └── use-canvas-state.ts                  # NEW: canvas state management hook
├── lib/
│   ├── canvas/                              # NEW: canvas core logic
│   │   ├── types.ts                         # CanvasDocument, CanvasElement, etc.
│   │   ├── viewport-store.ts               # Zustand or context for pan/zoom
│   │   ├── history-manager.ts              # Global undo/redo command stack
│   │   ├── editor-manager.ts              # Registry of active TipTap instances
│   │   ├── element-operations.ts          # Create, delete, move, resize, copy/paste
│   │   ├── input-router.ts                # Pointer event routing (pen/touch/mouse)
│   │   └── viewport-culling.ts            # Only render visible elements
│   ├── drawing/                             # Existing
│   │   ├── types.ts                         # Modified: extend for canvas model
│   │   ├── stroke-renderer.ts              # Modified: canvas coordinate transforms
│   │   └── stroke-compressor.ts            # Existing (unchanged)
│   └── actions/
│       └── documents.ts                     # Modified: canvas-aware save/load
├── types/
│   └── database.ts                          # Modified: canvas format types
└── test/
    └── setup.ts                             # Existing (unchanged)

supabase/migrations/
├── 00001_initial_schema.sql                 # Existing
├── 00002_enable_realtime_documents.sql      # Existing
└── 00003_add_folder_default_background.sql  # NEW: folders.default_background column

e2e/
├── canvas.spec.ts                           # NEW: canvas interaction tests
├── canvas-drawing.spec.ts                   # NEW: Apple Pencil drawing on canvas
├── canvas-sync.spec.ts                      # NEW: canvas realtime sync
└── ... (existing e2e tests unchanged)
```

**Structure Decision**: The canvas system lives in `src/components/canvas/` and `src/lib/canvas/` as new directories. The existing `editor/` and `drawing/` directories are modified but not restructured. The linear editor continues to work for existing documents — the canvas is an alternative document renderer selected based on `content.format`.

## Complexity Tracking

| Aspect | Decision | Why Not Simpler |
|--------|----------|-----------------|
| Custom canvas (not tldraw) | CSS transforms + Canvas 2D overlay | tldraw costs $6K/year; custom gives full control at $0 |
| Command pattern undo | Global history manager with transaction interception | Hybrid approach has known edge cases with delete/recreate and redo desync |
| Notification-then-fetch sync | Fetch document after realtime signal | Direct payload truncated by Supabase for fields > 64 bytes — current sync is likely broken for real content |
| Multiple TipTap editors | EditorManager registry, lazy init/destroy | Single TipTap doc can't support spatially positioned elements via CSS transforms |
