# Implementation Plan: Paste Images as Canvas Objects

**Branch**: `040-image-paste-select` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/040-image-paste-select/spec.md`

## Summary

Add image paste support to the canvas editor. Users paste images from the system clipboard (Ctrl/Cmd+V), which appear as positioned objects on the page. The editor auto-switches to select mode with the image pre-selected. Images can be moved, resized (aspect ratio locked), and deleted. Images are stored as compressed base64 data URLs inside the existing `pages` JSONB column — no new database tables or storage buckets needed. PDF export includes images via `<img>` tags in the HTML template.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), Canvas 2D API (image processing), Pointer Events API (interaction)
**Storage**: PostgreSQL via Supabase — existing `pages` JSONB column on `documents` table (no migration)
**Testing**: Vitest (unit tests for image processing/hit testing), Playwright (E2E for paste/select/resize flows)
**Target Platform**: Web browser (desktop, primarily Chrome/Firefox/Safari)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Image paste and render < 1 second, smooth 60fps drag/resize
**Constraints**: Images resized to max 1200px longest dimension, JPEG 80% quality to keep JSONB payload reasonable
**Scale/Scope**: Client-side only change, ~5 files modified, no new dependencies

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status     | Notes                                                                                                                                              |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS       | Extends existing canvas infrastructure. Data model (ImageObject type) defined before interaction logic. Each user story is independently testable. |
| II. Test-Driven Quality         | PASS       | Unit tests for image processing utility + hit testing. E2E tests for paste → select → move → resize → delete flow.                                 |
| III. Protected Branches         | PASS       | Feature branch `040-image-paste-select` off `dev`. PR to `dev` when complete.                                                                      |
| IV. Migrations as Code          | PASS (N/A) | No database migration needed. Images stored in existing JSONB column. Backward compatible — `images` defaults to `[]`.                             |
| V. Interview-Ready Architecture | PASS       | Key concepts: Clipboard API, base64 encoding, aspect ratio locking, JSONB schema flexibility, undo/redo stack patterns, hit testing algorithms.    |

**Post-Phase 1 re-check**: All gates still pass. No new storage, no new dependencies, no schema changes.

## Project Structure

### Documentation (this feature)

```text
specs/040-image-paste-select/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: storage strategy, clipboard API, resize behavior
├── data-model.md        # Phase 1: ImageObject type, CanvasPage extension
├── quickstart.md        # Phase 1: key files and testing approach
├── contracts/
│   └── canvas-types.md  # Phase 1: TypeScript type contracts
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── canvas.ts                    # ImageObject type, CanvasPage.images, ClipboardData.images
├── hooks/
│   └── use-selection.ts             # Image hit testing, selection, resize (aspect-locked), drag
├── components/
│   └── canvas/
│       ├── canvas-editor.tsx        # System clipboard paste handler, image CRUD, undo/redo
│       └── canvas-page.tsx          # Render <img> elements per page
├── lib/
│   ├── canvas/
│   │   └── image-utils.ts           # NEW: processClipboardImage (resize, compress, base64)
│   └── pdf/
│       └── html-template.ts         # Add <img> tags for images in PDF export
```

**Structure Decision**: Single web application. All changes are client-side within the existing `src/` tree. One new utility file (`image-utils.ts`) for image processing. No backend changes.
