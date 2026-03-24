# Quickstart: Shape Snap on Hold

## Files to modify

1. **`src/lib/canvas/shape-detection.ts`** (NEW) — All shape detection and rendering logic
2. **`src/hooks/use-drawing.ts`** (MODIFY) — Integrate shape classifier into hold timer

## Implementation order

1. Create `shape-detection.ts` with `classifyShape()` and shape-specific fit/render functions
2. Write unit tests for each shape detector
3. Integrate into `use-drawing.ts` hold timer (replace line-only snap with classifier)
4. Test manually on desktop and iPad

## Key integration point

In `use-drawing.ts`, the hold timer callback (currently at ~line 210) does:

```
isSnappedRef.current = true;
snapStartPointRef.current = start;
renderStraightLine(workingCanvasRef.current, start, end);
```

Replace with:

```
const result = classifyShape(currentPointsRef.current);
if (result) {
  snapShapeRef.current = result;
  isSnappedRef.current = true;
  renderSnappedShape(workingCanvasRef.current, result, strokeOptions);
} else {
  // Fall through to existing straight line snap
  isSnappedRef.current = true;
  snapStartPointRef.current = start;
  renderStraightLine(workingCanvasRef.current, start, end);
}
```

## Testing

```bash
pnpm test src/lib/canvas/shape-detection.test.ts
```
