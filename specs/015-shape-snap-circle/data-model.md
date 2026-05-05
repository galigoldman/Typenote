# Data Model: Shape Snap on Hold

No new database entities or schema changes required. This feature operates entirely on the existing in-memory stroke data during drawing.

## Runtime Types (TypeScript only, no persistence changes)

### ShapeType

Discriminated union for detected shapes:

- `'circle'` — center (x, y) + radius
- `'rectangle'` — 4 corner points (top-left, top-right, bottom-right, bottom-left)
- `'triangle'` — 3 corner points
- `'line'` — start point + end point (existing behavior)

### ShapeDetectionResult

Returned by the shape classifier:

- **type**: ShapeType or null (no shape detected)
- **confidence**: number 0–1 (how well the stroke matches)
- **params**: shape-specific parameters (center/radius for circle, corners for rect/triangle)

### SnapState (replaces existing isSnappedRef + snapStartPointRef)

- **shape**: ShapeDetectionResult | null
- **originalPoints**: StrokePoint[] (the raw stroke before snap, for undo)

## Existing Entities (unchanged)

- **Stroke**: `{ id, points: StrokePoint[], color, width, opacity, bbox, createdAt }` — snapped shapes are converted to StrokePoint arrays before committing, so they're stored identically to freehand strokes.
- **StrokePoint**: `[x, y, pressure]` — no changes.
