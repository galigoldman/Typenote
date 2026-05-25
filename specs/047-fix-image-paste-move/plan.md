# Implementation Plan: Fix Image Paste Target & Cross-Page Object Movement

**Branch**: `047-fix-image-paste-move` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/047-fix-image-paste-move/spec.md`

## Summary

Fix the bug where pasted images always land on page 1 instead of the currently visible page. Then add the ability to move objects (images, strokes, text boxes) between pages via drag and cut/paste. The paste fix improves the viewport page detection fallback. Cross-page drag detects when objects are dragged past page boundaries at commit time and transfers them. A new compound undo action ensures cross-page moves are fully reversible.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), Canvas 2D API, Pointer Events API
**Storage**: N/A — no database changes, client-side only; objects stored in existing `documents.pages` JSONB column via Supabase
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop browsers, iPad)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Drag interactions must remain 60fps; no perceivable lag on cross-page commit
**Constraints**: Page coordinates are relative (0,0 top-left per page); PAGE_WIDTH=794, PAGE_HEIGHT=1123 (A4 @ 96 DPI)
**Scale/Scope**: 4 files modified, ~200 lines changed, 0 new dependencies

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Incremental Development | PASS | Builds on existing canvas infrastructure. P1 (paste fix) is a standalone increment. P2/P3 build on top. |
| II. Test-Driven Quality | PASS | Plan includes unit tests for page detection logic, E2E tests for paste and cross-page drag. Bug fix starts with a failing test. |
| III. Protected Branches | PASS | Working on feature branch `047-fix-image-paste-move` off `dev`. |
| IV. Migrations as Code | N/A | No database changes. |
| V. Interview-Ready Architecture | PASS | Cross-page move uses a compound undo action — demonstrates the Command pattern (common interview topic). |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies, no schema changes, no architectural violations.

## Project Structure

### Documentation (this feature)

```text
specs/047-fix-image-paste-move/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technical research and decisions
├── data-model.md        # Phase 1: data model (no DB changes)
├── quickstart.md        # Phase 1: setup and verify instructions
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
src/
├── components/canvas/
│   ├── canvas-editor.tsx        # Paste handler fix, cross-page move handler, undo action type
│   └── __tests__/
│       └── cross-page-move.test.ts  # Unit tests for page detection and coordinate transform
├── hooks/
│   └── use-selection.ts         # Drag commit: detect page boundary crossing
└── types/
    └── canvas.ts                # (no changes needed — existing types sufficient)

e2e/
├── image-paste-page.spec.ts     # E2E: paste image lands on correct page
└── cross-page-move.spec.ts      # E2E: drag objects between pages
```

**Structure Decision**: All changes are in the existing `src/components/canvas/` and `src/hooks/` directories. No new modules, no new dependencies. Two new test files.

## Implementation Phases

### Phase 1: Fix Paste Page Detection (P1 — Bug Fix)

**Goal**: Images pasted from the system clipboard appear on the currently visible page.

**Files**:
- `src/components/canvas/canvas-editor.tsx` (~lines 2339-2343)

**Changes**:
1. Replace the first-page fallback with a "closest page to viewport center" algorithm:
   - After the existing intersection loop fails, iterate all page elements
   - For each page, compute distance from page center to viewport center
   - Pick the page with the smallest distance
   - Compute paste coordinates relative to that page
2. Apply the same fix to the internal keyboard paste handler (~lines 2223-2267) which currently silently fails when no page intersects the center

**Unit Test** (`cross-page-move.test.ts`):
- Extract the page detection logic into a pure function `findClosestPage(pageRects, viewportCenter)` that can be tested without DOM
- Test cases: viewport center on page 3, viewport center between pages, viewport center past last page, single page document

**Why this approach**: The existing viewport intersection logic is correct 90% of the time. We only need a better fallback for the 10% edge case. Extracting a pure function makes it testable without Playwright.

---

### Phase 2: Cross-Page Drag (P2 — New Feature)

**Goal**: Users can drag selected objects past a page boundary to move them to the adjacent page.

**Files**:
- `src/hooks/use-selection.ts` (~lines 962-1043, drag commit)
- `src/components/canvas/canvas-editor.tsx` (new `handleCrossPageMove` callback, new undo action type)

**Changes to `use-selection.ts`**:
1. At drag commit, after computing final positions, check each object's new Y:
   - If `newY > PAGE_HEIGHT`: object crossed bottom boundary → target is next page
   - If `newY < 0`: object crossed top boundary → target is previous page
2. If boundary crossed, call a new `onCrossPageMove` callback instead of the per-type move callbacks
3. Pass: `sourcePageId`, `targetPageId`, all moved objects (strokes, textBoxes, images), and the displacement
4. Update `activePageIdRef` and `selectionPageId` to the new target page
5. If target is past the last page, the canvas-editor callback creates a new page first

**Changes to `canvas-editor.tsx`**:
1. Add `cross-page-move` to the `CanvasAction` union type:
   ```
   { type: 'cross-page-move', fromPageId, toPageId, strokes, textBoxes, images, dx, dy }
   ```
2. Add `handleCrossPageMove` callback:
   - Remove objects from source page's arrays
   - Add objects to target page's arrays with adjusted Y coordinates
   - If target page doesn't exist (past last page), create it first
   - Push single `cross-page-move` undo action
   - Trigger save
3. Add undo handler case for `cross-page-move`:
   - Remove objects from `toPageId`
   - Add objects back to `fromPageId` with original coordinates
   - If the target page was auto-created and is now empty, optionally strip it

**Coordinate Adjustment**:
- Moving down: `newY = objectY + dy - PAGE_HEIGHT` (object Y relative to next page)
- Moving up: `newY = objectY + dy + PAGE_HEIGHT` (object Y relative to previous page)
- X coordinates stay unchanged
- Clamp final positions to `[0, PAGE_WIDTH]` × `[0, PAGE_HEIGHT]`

**Unit Tests**:
- Coordinate transformation: given object at Y=1100 dragged dy=50, verify newY=27 on next page
- Boundary detection: given object at Y=1100 with dy=30 → crosses; dy=20 → doesn't cross
- Multiple objects: all objects in selection cross together

---

### Phase 3: Cross-Page Cut/Paste (P3 — Enhancement)

**Goal**: Users can cut objects on one page, scroll to another, and paste them there.

**Files**:
- `src/components/canvas/canvas-editor.tsx` (paste handler, ~lines 2223-2267)
- `src/hooks/use-selection.ts` (cut handler, paste handler)

**Changes**:
1. The internal paste handler already uses viewport detection to find the target page. Once Phase 1 fixes the detection, paste will naturally target the correct page.
2. Verify that cut (which already removes objects and stores them in `clipboardRef`) works correctly when the paste target is a different page than the source.
3. The paste offset should be computed relative to the target page center, not the source page center, when `sourcePageId !== targetPageId`.

**This phase is mostly verification** — the existing cut/paste infrastructure plus the Phase 1 fix should handle this. The main code change is adjusting the offset calculation when pasting on a different page.

---

### Phase 4: E2E Tests

**Goal**: Comprehensive browser tests for all three user stories.

**Files**:
- `e2e/image-paste-page.spec.ts` (new)
- `e2e/cross-page-move.spec.ts` (new)
- `e2e/TEST_REGISTRY.md` (update)

**Test Scenarios**:

`image-paste-page.spec.ts`:
1. Paste image on page 1 of single-page document → image on page 1
2. Scroll to page 3, paste image → image on page 3
3. Paste image when scrolled between pages → image on nearest page

`cross-page-move.spec.ts`:
1. Drag image from page 2 past bottom boundary → image on page 3
2. Drag image from page 3 past top boundary → image on page 2
3. Drag image past last page → new page created, image on new page
4. Undo cross-page move → image back on original page
5. Cut image on page 1, scroll to page 3, paste → image on page 3

**Test Registry Update**:
- Add "Image Paste Targeting" section with 3 tests
- Add "Cross-Page Object Movement" section with 5 tests

## Risk Assessment

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Drag performance regression from boundary checks | Medium | Boundary check is O(1) math at commit time only, not during drag |
| Undo stack corruption from compound action | High | Unit test the undo/redo cycle thoroughly; test undo after cross-page move + additional edits |
| Coordinate rounding errors during page transfer | Low | Round to 1 decimal place (matching existing `screenToPageCoords`) |
| Selection state stale after cross-page move | Medium | Explicitly update `selectionPageId` and `activePageIdRef` after move |
| Auto-created pages not cleaned up on undo | Low | Reuse `stripTrailingEmptyPages` logic in undo handler |
