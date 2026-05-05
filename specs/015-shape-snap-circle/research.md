# Research: Shape Snap on Hold

## Shape Classification Algorithms

### Decision: Geometric scoring with heuristics

**Rationale**: Simple, fast (<1ms), deterministic, no dependencies. Each shape type gets a score based on how well the stroke matches its geometric properties. The highest score above a threshold wins.

**Alternatives considered**:

- Machine learning (rejected: overkill for 3 shapes, adds latency, requires training data)
- Template matching (rejected: rotation/scale invariance adds complexity)
- Hough transform (rejected: heavy for real-time, designed for image processing not stroke data)

## Circle Detection

### Decision: Radius variance from centroid + angular coverage

**Rationale**: Compute centroid of all points. For each point, compute distance to centroid. If the coefficient of variation (stddev/mean) of distances is below a threshold (~0.25), the stroke is circular. Also check angular coverage ≥ 270° to handle open arcs.

**Algorithm**:

1. Centroid = mean of all (x, y) points
2. Distances = [dist(point, centroid) for each point]
3. meanRadius = mean(distances)
4. If stddev(distances) / meanRadius < 0.25 → circle candidate
5. Check angular span: compute angle of each point relative to centroid, check total arc coverage ≥ 270°
6. Score = 1 - (stddev / meanRadius), penalized if angular coverage < 360°

## Rectangle Detection

### Decision: Corner detection via angle changes + edge straightness

**Rationale**: Walk along the stroke points and detect sharp angle changes (>60°). If exactly 4 corners are found and the angles are roughly 90°, it's a rectangle.

**Algorithm**:

1. Smooth the stroke points (moving average, window=5)
2. Compute direction changes between consecutive segments
3. Detect corners: points where cumulative angle change exceeds 60° threshold
4. If 4 corners detected:
   - Check each corner angle is within 90° ± 30°
   - Check edge straightness (points between corners deviate < 15% of edge length)
   - Score based on angle accuracy and edge straightness
5. If aspect ratio is within 0.8–1.2, prefer square snap

## Triangle Detection

### Decision: Same corner detection, expect 3 corners

**Rationale**: Reuse the corner detection from rectangle, but expect exactly 3 prominent corners. The triangle is formed by connecting these 3 points.

**Algorithm**:

1. Same smoothing + angle change detection as rectangle
2. If 3 corners detected:
   - Check edge straightness between corners
   - Score based on edge straightness and how distinct the corners are
3. Fit triangle = connect the 3 corner points with straight edges

## Shape Priority / Disambiguation

### Decision: Circle > Rectangle > Triangle > Line

**Rationale**: More constrained shapes get priority. A circle requires uniform radius (very specific); a rectangle requires 4 right angles; a triangle requires 3 corners. If a stroke scores well for multiple shapes, the most constrained match is preferred — it's more likely the user intended that specific shape.

**Tie-breaking**: If top two scores are within 10% of each other, prefer the more constrained shape (circle > rect > triangle).

## Rendering Snapped Shapes as StrokePoints

### Decision: Generate evenly-spaced points along shape perimeter

**Rationale**: The existing rendering pipeline uses `perfect-freehand` which expects `[x, y, pressure]` arrays. By generating points along the shape perimeter with consistent pressure, we get the same hand-drawn stroke appearance for snapped shapes.

**Point counts**:

- Circle: 64 points evenly spaced around circumference
- Rectangle: 8 points per edge (32 total) + corner points
- Triangle: 8 points per edge (24 total) + corner points
- All points use the average pressure from the original stroke

## Minimum Size Threshold

### Decision: Bounding box diagonal must be ≥ 30px

**Rationale**: Very small strokes (a few pixels) are likely dots or taps, not intentional shapes. A 30px diagonal threshold filters these out while still allowing reasonably small shapes.
