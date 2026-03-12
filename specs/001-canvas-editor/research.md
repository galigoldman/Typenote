# Research: Freeform Canvas Editor

**Branch**: `001-canvas-editor` | **Date**: 2026-03-08

## 1. Stroke Rendering Library

**Decision**: Use `perfect-freehand` (~3KB) for stroke geometry generation.

**Rationale**: It takes raw `[x, y, pressure]` points and outputs outline points forming a smooth, pressure-sensitive closed polygon. It does not render anything itself — it's a geometry engine. Used in production by tldraw.

**Pipeline**: `getStroke(points, opts)` → `getSvgPathFromStroke(outline)` → `new Path2D(pathData)` → `ctx.fill(path)`

**Key config for stylus**: Set `simulatePressure: false` when using real pen pressure data. Otherwise the library ignores pressure values and simulates from velocity.

**Alternatives rejected**:

- Rough.js — wrong aesthetic (sketchy, not smooth)
- Konva.js — heavy framework, conflicts with direct pointer event usage
- Custom Bezier smoothing — `perfect-freehand` already solves pressure-to-width, tapering, smoothing

## 2. Input Detection (Stylus-Only Drawing)

**Decision**: Use Pointer Events API with `event.pointerType === "pen"`.

**Rationale**: Native browser API, widely supported since July 2020. Provides `pressure` (0–1), `tiltX`, `tiltY`. Works with Apple Pencil, Surface Pen, S Pen.

**Critical CSS**: Must set `touch-action: none` on drawing canvas to prevent browser gesture interception.

**Safari caveat**: Does not support `getCoalescedEvents()`, but Apple Pencil delivers 120–240Hz natively via regular `pointermove` events, so raw stream is already smooth.

**Alternatives rejected**:

- Touch Events API — no pen/finger distinction, no pressure
- Pressure.js polyfill — unnecessary now that Pointer Events is baseline

## 3. Rendering Technology

**Decision**: HTML Canvas (not SVG) for stroke rendering.

**Rationale**: Canvas performance is constant regardless of stroke count (immediate mode — draws pixels, forgets commands). SVG degrades as each stroke becomes a DOM node — at 500+ `<path>` elements, significant overhead. Benchmarks confirm SVG performance degrades exponentially on Safari.

**High-DPI handling**: Scale canvas by `devicePixelRatio`:

```
canvas.width = clientWidth * dpr
canvas.height = clientHeight * dpr
ctx.scale(dpr, dpr)
```

Without this, strokes look blurry on Retina/iPad displays.

**Rendering strategy**: Two-layer approach:

1. "Committed" canvas — holds all finalized strokes as rasterized bitmap
2. "Working" canvas — renders current in-progress stroke on every `pointermove`
   On `pointerup`, render stroke onto committed canvas and clear working layer. Avoids re-rendering all previous strokes per frame.

**Alternatives rejected**:

- SVG — DOM overhead with 500+ paths, especially on iPad Safari
- WebGL/PixiJS — overkill for note-taking; Canvas 2D is fast enough
- OffscreenCanvas — limited Safari support, premature optimization

## 4. Canvas + Text Layer Architecture

**Decision**: Canvas behind, HTML text boxes in front, transparent interaction layer on top.

**Layer stack (bottom to top)**:

1. Page background (white, shadow, grid/lines CSS)
2. Canvas (pen strokes)
3. Text boxes (positioned HTML divs with TipTap editors)
4. Interaction layer (transparent div capturing all pointer events)

**Event routing**: The interaction layer captures all pointer/touch events and routes them based on active tool:

- Pen/eraser active → forward coordinates to canvas logic, set `pointer-events: none` on text boxes
- Text input → let events pass through to text boxes

**Coordinate system**: Single "page coordinate" space (794 × 1123 points = A4 at 96 DPI). A `viewTransform { scale, offsetX, offsetY }` applied to both canvas (`ctx.setTransform()`) and HTML layer (CSS `transform`). All stroke points and text box positions stored in page coordinates — zoom/pan is purely a view concern.

**Per-page canvases**: Each A4 page has its own canvas element. Avoids browser canvas size limits (~16384px). Enables React memoization per page and viewport-based virtualization.

## 5. Pinch-to-Zoom

**Decision**: Native Pointer Events with manual gesture detection. CSS `transform: scale()` on container.

**Rationale**: Hammer.js is unmaintained (last update 2016). The pinch detection logic is straightforward with Pointer Events: track active pointers in a Map, calculate distance/midpoint when exactly 2 are active.

**Zoom application**: CSS transform on the document viewport container scales both canvas and HTML text boxes in one operation. GPU-composited for smooth performance.

**Post-zoom**: Re-render canvas at new resolution on gesture end (CSS scaling looks slightly blurry during pinch but performs well).

**Desktop trackpad zoom**: Handle `wheel` events with `ctrlKey` (how browsers report trackpad pinch).

**Alternatives rejected**:

- Hammer.js — unmaintained, uses older Touch Events API
- Canvas-only transform — would require manually repositioning every text box div per frame

## 6. A4 Page Layout

**Decision**: Stacked fixed-ratio divs (794 × 1123px) in a scrollable container with per-page canvases.

**Auto-creation**: IntersectionObserver on the last page — when it becomes visible, append a new blank page. Also create new pages when stroke Y coordinate exceeds page height.

**Virtualization**: Only mount full canvas rendering for pages intersecting the viewport. Off-screen pages rendered as placeholder divs. Can use IntersectionObserver-based manual virtualization.

**Alternatives rejected**:

- Single giant canvas — browser canvas size limits, no per-page memory optimization
- `aspect-ratio` CSS only — need explicit dimensions for coordinate precision

## 7. Eraser Hit Detection

**Decision**: AABB broad phase + point-to-segment distance narrow phase.

**Broad phase**: Each stroke has a precomputed bounding box. Filter to strokes whose bbox (expanded by eraser radius) contains the eraser point. O(n) with trivial per-stroke cost.

**Narrow phase**: For candidates, compute minimum distance from eraser point to each line segment of the stroke polyline. If distance ≤ eraser radius + stroke half-width → hit. Return true on first hit (whole stroke removal).

**Performance**: With bbox filter, typically narrows 500 strokes to 5–20 candidates. Fast enough for 60fps.

**Alternatives rejected**:

- Pixel-based (offscreen canvas) — requires GPU-to-CPU readback (`getImageData()`), resolution-dependent, harder to adjust eraser size
- R-tree spatial index (rbush) — premature optimization for <1000 strokes per page

## 8. Selection Tool

**Lasso selection**: Ray casting point-in-polygon algorithm. O(n) per point where n = polygon vertices. A stroke is selected if ANY of its points fall inside the polygon.

**Rectangle selection**: AABB intersection test. Simple range check.

**Text boxes**: Check if any corner falls inside the selection polygon, or if any polygon edge crosses any AABB edge.

**Visual feedback**: SVG overlay for lasso path and selection indicators. Bounding box with handles around selected objects.

**Drag to move**: Delta-based with CSS `transform: translate()` during drag (no React re-renders). Commit actual positions on `pointerup`. Use `setPointerCapture()` for reliable tracking.

## 9. Text Splitting

**Decision**: Prefer block-level (paragraph boundary) splitting. Use `posAtCoords()` to find ProseMirror position, walk up to nearest block boundary.

**Block-level split**: Clean array slice on TipTap document JSON content array. Straightforward.

**Arbitrary-position split**: Use ProseMirror `content.cut()` which handles inline marks correctly (preserves bold/italic across the cut boundary). Math expressions are atomic inline nodes — `content.cut()` keeps them whole.

**Architecture**: Each text box is its own React component with its own `useEditor()` instance. Split creates a new text box component with the second half of the content.

## 10. Data Persistence

**Decision**: New `pages` JSONB column on the `documents` table.

**Rationale**: Keeps the single-table, single-subscription model. `updateDocumentContent` does one `.update({ pages })`, triggers one Realtime event, echo-guard logic remains intact.

**Stroke format**: JSON arrays of `[x, y, pressure]` triples, coordinates rounded to 1 decimal, pressure to 2 decimals. ~1.1 KB per stroke (50 points average).

**Size budget**: Keep under ~800 KB total to stay within Supabase Realtime payload limits (~1 MB). At 50 strokes/page, supports ~14 pages comfortably.

**Migration**: Three-phase additive:

1. `ALTER TABLE ADD COLUMN pages jsonb DEFAULT '{"pages":[]}'`
2. Dual-write in application code (content + pages)
3. Backfill existing documents (wrap content as flowContent of page 0)

**Alternatives rejected**:

- Same `content` column — mixing TipTap tree with stroke arrays creates coupling
- Separate `strokes` table — breaks single-subscription model, premature at this scale
- Base64-encoded binary — loses queryability and debuggability

## 11. Key Dependencies

| Package            | Purpose                               | Size  |
| ------------------ | ------------------------------------- | ----- |
| `perfect-freehand` | Stroke geometry from raw input points | ~3 KB |

No other new dependencies needed. Pointer Events, Canvas, IntersectionObserver, and pinch detection all use native browser APIs.
