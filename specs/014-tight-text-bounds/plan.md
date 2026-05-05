# Implementation Plan: Tight Text Selection Bounds

**Branch**: `014-tight-text-bounds` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-tight-text-bounds/spec.md`

## Summary

Text box selection currently uses the full container width (the wrapping boundary) for hit-testing and visual feedback. This means selecting near a text box's empty whitespace area incorrectly selects it. This feature changes `getSelectableBBox()` to use measured content bounds — the actual rendered text dimensions — for both rectangle-selection hit-testing, single-tap hit-testing, and the selection highlight. Resize handles remain at container bounds (per clarification). The implementation extends the existing ResizeObserver-based measurement pattern (already used for height) to also measure content width and horizontal offset, then propagates these via the established callback chain to the selection system.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16, TipTap 3 (ProseMirror), perfect-freehand, Canvas 2D API
**Storage**: N/A — text boxes stored in `pages` JSONB column via Supabase (no schema change)
**Testing**: Vitest (unit tests)
**Target Platform**: Web (desktop + tablet browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Content bounds measurement must not cause visible jank; recalculate only on content change, not per frame
**Constraints**: Must work with RTL text (Hebrew), mixed LTR/RTL content, KaTeX math inline blocks, and empty text boxes
**Scale/Scope**: Client-side only change — affects 5-6 source files in the canvas editor

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                                                          |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Pure UI refinement on existing canvas infrastructure. No new data model or advanced features.                  |
| II. Test-Driven Quality         | PASS   | Unit tests for bounds calculation. Visual testing for selection overlay.                                       |
| III. Protected Main Branch      | PASS   | Working on feature branch `014-tight-text-bounds`. Will open PR.                                               |
| IV. Migrations as Code          | N/A    | No database changes. TextBox stored in existing JSONB column.                                                  |
| V. Interview-Ready Architecture | PASS   | DOM measurement patterns, observer pattern, separation of measurement vs. rendering are good interview topics. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/014-tight-text-bounds/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── canvas.ts                        # TextBox interface (add contentBounds)
├── components/canvas/
│   ├── text-box.tsx                     # Add content bounds measurement
│   ├── canvas-page.tsx                  # Propagate contentBounds callback
│   ├── canvas-editor.tsx                # Handle contentBounds state updates
│   └── selection-overlay.tsx            # Use tight bounds for highlight
├── hooks/
│   └── use-selection.ts                 # Update getSelectableBBox(), hit-testing
└── lib/canvas/
    └── stroke-utils.ts                  # Existing aabbIntersectsRect (unchanged)
```

**Structure Decision**: All changes are within the existing `src/` directory. No new directories needed. The change touches the canvas editor subsystem: types, component, hook, and overlay layers.

## Technical Approach

### Content Bounds Measurement Strategy

The core challenge is measuring actual rendered text width within a fixed-width container where block elements (`<p>`, `<h1>`) span the full container width by CSS default.

**Chosen approach: Range API content measurement**

1. In the TextBox component, after TipTap renders content, access the ProseMirror DOM (`editor.view.dom`)
2. For each block-level child element, create a `Range` that selects all inline content within that block
3. Use `range.getBoundingClientRect()` to get the pixel-accurate bounds of the rendered text
4. Compute the union rectangle across all blocks — this gives the tight content bounds
5. Convert viewport-relative coordinates to text-box-relative coordinates using the container's `getBoundingClientRect()`

**Why Range API over alternatives:**

- `scrollWidth` doesn't help because the container has fixed width and text wraps within it
- Setting `width: max-content` temporarily would cause layout thrash and visual flicker
- Off-screen clone is expensive and doesn't handle KaTeX/math rendering correctly
- The Range API measures actual painted pixels with no layout side effects

**RTL handling:**

- `getBoundingClientRect()` returns correct positions for RTL text
- Short RTL text renders to the right of the container — the Range API captures this naturally
- The content bounds `offsetX` will be positive (offset from left edge) for RTL content

### Data Flow

```
TextBox component (measure DOM)
  → onContentBoundsMeasured(pageId, textBoxId, {offsetX, width})
    → CanvasEditor state update (pages[].textBoxes[].contentBounds)
      → useSelection hook reads contentBounds
        → getSelectableBBox() returns tight bbox
          → Selection overlay renders tight highlight
```

This mirrors the existing height measurement flow:

```
TextBox component (ResizeObserver scrollHeight)
  → onTextBoxHeightMeasured(pageId, textBoxId, height)
    → CanvasEditor state update (pages[].textBoxes[].height)
```

### Key Implementation Details

1. **Measurement timing**: Run content bounds measurement inside the same ResizeObserver callback that measures height. This avoids adding a second observer and ensures bounds update whenever content changes.

2. **Debounce threshold**: Similar to the existing height measurement (skip if change < 2px), skip content width updates if change < 2px to avoid excessive re-renders.

3. **Empty text box fallback**: When ProseMirror has no content nodes, use a minimum selectable area (e.g., 24x24px clickable region) at the text box origin.

4. **Padding**: Add ~4px padding around measured content bounds for comfortable selection targeting.

5. **Selective application**: Only use tight bounds in Select mode for hit-testing. Type mode, resize handles, and the text-box DOM container remain unchanged.
