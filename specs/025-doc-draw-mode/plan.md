# Implementation Plan: Enable Draw Mode in Text Documents

**Branch**: `025-doc-draw-mode` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-doc-draw-mode/spec.md`

## Summary

Text-only documents (imported .docx, documents without canvas pages) currently render with the TipTap editor and have no drawing tools. This feature adds a drawing canvas overlay on top of the TipTap editor, reusing the existing drawing hooks (`use-drawing`, `use-eraser`) and stroke infrastructure from the canvas editor. Strokes are persisted in the existing `pages` JSONB column with a `mode: "text-overlay"` marker to keep text documents routing through the TipTap editor path.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3, `perfect-freehand`, Canvas 2D API
**Storage**: PostgreSQL via Supabase — existing `documents.pages` JSONB column (no migration)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web (mobile + desktop, touch + stylus + mouse)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: 60fps drawing, <500ms mode switch, <1s draw mode activation
**Constraints**: Must not break existing text editing UX; must coexist with TipTap editor
**Scale/Scope**: Client-side only, ~4-5 files modified, 1 new component

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                           |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Feature builds on existing drawing infrastructure (hooks, types, utilities). No new foundational layers needed. |
| II. Test-Driven Quality         | PASS   | Will add unit tests for routing logic change, drawing overlay rendering, and stroke persistence.                |
| III. Protected Main Branch      | PASS   | Work on `025-doc-draw-mode` branch, PR to main after CI passes.                                                 |
| IV. Migrations as Code          | PASS   | No migration needed — uses existing `pages` JSONB column.                                                       |
| V. Interview-Ready Architecture | PASS   | Overlay pattern (compositing layers over rich text editor) is a common architecture topic.                      |

**Post-Phase 1 Re-check**: All gates still pass. No new dependencies, no migration, no database changes. The `mode: "text-overlay"` marker in the JSON structure is a lightweight discriminator — no schema change required.

## Project Structure

### Documentation (this feature)

```text
specs/025-doc-draw-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/(dashboard)/dashboard/documents/[docId]/
│   └── page.tsx                    # MODIFY: Fix isTextDocument routing
├── components/editor/
│   ├── tiptap-editor.tsx           # MODIFY: Add drawing state + overlay integration
│   ├── editor-toolbar.tsx          # MODIFY: Add draw mode toggle + sub-tools
│   └── drawing-overlay.tsx         # NEW: Canvas overlay for drawing on text docs
├── hooks/
│   ├── use-drawing.ts              # REUSE: Drawing pointer handlers
│   └── use-eraser.ts               # REUSE: Eraser pointer handlers
├── lib/canvas/
│   ├── stroke-utils.ts             # REUSE: Stroke rendering + hit detection
│   ├── coordinate-utils.ts         # REUSE: High-DPI canvas setup
│   └── scroll-lock.ts              # REUSE: Scroll prevention during drawing
└── types/
    └── canvas.ts                   # REUSE: Stroke, CanvasPage, CanvasTool types
```

**Structure Decision**: No new directories. One new component file (`drawing-overlay.tsx`) in the existing `editor/` directory. All other changes are modifications to existing files.
