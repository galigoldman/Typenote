# Implementation Plan: Improve Document Zoom UX

**Branch**: `019-improve-document-zoom` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-improve-document-zoom/spec.md`

## Summary

Overhaul the iPad pinch-to-zoom and pan system to achieve GoodNotes/Notability-quality feel. The core change is migrating from browser-native scroll + CSS scale to a **custom camera model** (`{x, y, zoom}`) that controls both zoom and pan via a single CSS `transform: scale() translate()`. This unlocks sub-100% zoom (down to 25%), true focal-point pinch zoom, animated transitions with spring physics, rubber-band overscroll, and momentum-based panning — all within the existing `use-pinch-zoom.ts` hook.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+ / React 19
**Primary Dependencies**: Next.js 16, TipTap 3, perfect-freehand, Canvas 2D API
**Storage**: N/A — no schema changes, client-side only
**Testing**: Vitest (unit tests for zoom math, spring physics, coordinate transforms)
**Target Platform**: iPadOS (Safari, touch + Apple Pencil)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: 60 fps during pinch zoom and animated transitions; < 5px focal-point drift
**Constraints**: Must not break existing drawing, erasing, text editing, or selection coordinate transforms
**Scale/Scope**: ~4 files modified, 1 new utility file

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                     |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | No new infrastructure needed — enhances existing zoom hook. No AI or advanced features.                   |
| II. Test-Driven Quality         | PASS   | Unit tests for zoom math, spring physics, coordinate conversion. Manual testing on iPad for gesture feel. |
| III. Protected Main Branch      | PASS   | Work on `019-improve-document-zoom` branch, PR to main.                                                   |
| IV. Migrations as Code          | N/A    | No database changes.                                                                                      |
| V. Interview-Ready Architecture | PASS   | Custom camera model, spring physics, and coordinate transforms are excellent interview talking points.    |

## Project Structure

### Documentation (this feature)

```text
specs/019-improve-document-zoom/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (camera model)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── hooks/
│   └── use-pinch-zoom.ts           # MODIFY: rewrite to camera model
├── lib/
│   └── canvas/
│       ├── coordinate-utils.ts      # MODIFY: update screen↔canvas conversion
│       └── zoom-physics.ts          # NEW: spring, momentum, rubber-band math
├── components/
│   └── canvas/
│       ├── canvas-editor.tsx        # MODIFY: new transform style, remove scroll-based pan
│       └── canvas-page.tsx          # VERIFY: coordinate transforms still work
```

**Structure Decision**: This feature modifies the existing hooks/canvas architecture. One new utility file (`zoom-physics.ts`) isolates the pure-math functions (spring solver, momentum decay, rubber-band) for testability.
