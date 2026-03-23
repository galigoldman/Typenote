# Research: Fix Pen Touch Triggering Zoom

**Feature**: 021-fix-pen-zoom | **Date**: 2026-03-23

## Root Cause

The `handleTouchEnd` function in `src/hooks/use-pinch-zoom.ts` detects double-taps for zoom toggling (100% ↔ 200%) but does not check whether the touch was from a stylus. On iPadOS, Apple Pencil touches have `touchType === "stylus"` on the Touch object. The existing `hasStylus()` utility is used in all other touch handlers (pinch start, pinch move, pan start) but was omitted from the double-tap detection path.

### Affected Code Path

```
handleTouchEnd (line 379)
  → touchend fires when any touch lifts
  → line 408: if (e.touches.length === 0 && e.changedTouches.length === 1)
    → This is true for BOTH finger lifts AND pen lifts
    → tapCount incremented, timer set
    → On tapCount === 2: zoom animation triggered
```

### Existing Stylus Guards (verified correct)

| Handler                     | Location | Guard                               | Status  |
| --------------------------- | -------- | ----------------------------------- | ------- |
| handleTouchStart (pinch)    | Line 290 | `!hasStylus(e.touches)`             | Correct |
| handleTouchMove (pinch)     | Line 313 | `hasStylus(e.touches)` early return | Correct |
| handleSingleTouchStart      | Line 518 | `hasStylus(e.touches)` early return | Correct |
| handleTouchEnd (double-tap) | Line 408 | **MISSING** — no stylus check       | **BUG** |

## Decision Log

### D1: Use `hasStylus(e.changedTouches)` for detection

- **Decision**: Check `changedTouches` (not `touches`) in `handleTouchEnd`
- **Rationale**: At touchend, the lifted finger/pen is in `changedTouches`, not `touches` (which only has active touches). The `hasStylus()` function iterates a TouchList, so passing `changedTouches` correctly identifies the lifted input.
- **Alternatives rejected**: Checking `e.touches` would always be empty at this point (no remaining touches), making it useless for detection.

### D2: Reset tapCount on stylus lift

- **Decision**: When a stylus lift is detected, reset `tapCount = 0` and clear the tap timer
- **Rationale**: Prevents cross-input false positives (pen tap → finger tap within 300ms would otherwise register as double-tap)
- **Alternatives rejected**: Tracking input type per tap (more complex, same result)

### D3: No changes to hasStylus() utility

- **Decision**: Reuse the existing `hasStylus()` function as-is
- **Rationale**: It correctly iterates TouchList and checks `touchType === "stylus"`. Works for both `touches` and `changedTouches` since both are TouchList objects.

## No Unresolved Items

All NEEDS CLARIFICATION items from the technical context have been resolved through codebase analysis. No external research was needed — this is a straightforward omission of an existing guard pattern.
