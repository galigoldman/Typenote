# Research: Improve Document Zoom UX

**Feature**: 019-improve-document-zoom
**Date**: 2026-03-23

## Decision 1: CSS Transform + Native Scroll vs. Custom Camera Model

**Decision**: Migrate to a **hybrid custom camera model** — a `{x, y, zoom}` state object drives a single CSS `transform: scale(zoom) translate(x, y)` on the content wrapper. Remove native scroll for pan; manage viewport offset entirely in JS.

**Rationale**:

- The current approach (CSS `scale()` + `container.scrollLeft/scrollTop`) cannot zoom below 100% because when content is smaller than the container, `scrollLeft` collapses to 0 — there's nothing to scroll.
- A custom camera gives full control over zoom range (25%-400%), focal-point anchoring, animated transitions, and rubber-band physics.
- CSS `transform` still provides GPU-accelerated compositing — we just stop relying on native scroll for positioning.
- This is the approach used by tldraw, Excalidraw, and other professional canvas apps.

**Alternatives considered**:

- **Keep native scroll, add CSS centering for sub-100%**: Would work for static sub-100% zoom but breaks focal-point math during pinch gestures crossing the 100% boundary. The `transformOrigin` switch between `top center` and `top left` causes visual jumps.
- **Full Canvas2D rendering with camera matrix**: Overkill — the app already uses DOM for text editing (TipTap) and HTML canvas only for strokes. A DOM-based transform is the right abstraction.

**Interview talking point**: This is a classic "viewport transform" pattern. The camera model is essentially a 2D affine transformation: `screenPoint = cameraZoom * contentPoint + cameraOffset`. Understanding how to map between coordinate spaces (screen, content, page) is a fundamental graphics/UI concept.

## Decision 2: Focal-Point Zoom Algorithm

**Decision**: Use the standard "convert to content space, re-project" algorithm that the codebase already partially implements.

**Formula**:

```
// On each pinch frame:
contentPoint = (screenPoint - camera.offset) / camera.zoom
// After updating camera.zoom:
camera.offset = screenPoint - contentPoint * camera.zoom
```

This ensures the content point under the pinch midpoint remains stationary in screen space.

**Rationale**: This is mathematically equivalent to "translate to origin, scale, translate back" — the standard approach used by tldraw, Konva, and native iOS UIScrollView.

**Current issue**: The existing `use-pinch-zoom.ts` computes this correctly (lines 158-167) but applies it via `container.scrollLeft/scrollTop` which lags one frame behind the CSS transform update (the `requestAnimationFrame` wrapper on line 176). With a custom camera, both zoom and offset update atomically in a single `setState`.

## Decision 3: Spring Physics for Rubber-Band and Snap-Back

**Decision**: Use a **critically-damped spring** (damping ratio = 1.0) for all snap-back animations (rubber-band overscroll, zoom boundary resistance, double-tap transitions).

**Parameters** (based on Apple's UIKit dynamics and Framer Motion defaults):

- Stiffness: 170
- Damping: 26
- Mass: 1
- These yield a critically-damped response (~300ms settle time, no overshoot)

**Implementation**: A pure function `springStep(current, target, velocity, dt)` → `{position, velocity}` using Euler integration. The `dt` is capped at 32ms to prevent physics explosion after tab backgrounding.

**Convergence criteria**: Stop when `|velocity| < 0.01` AND `|position - target| < 0.01`.

**Rationale**: Critically-damped springs feel professional — they reach the target quickly without bouncing. This matches iOS behavior. A simpler `ease-out` cubic bezier would also work for double-tap, but springs compose better (rubber-band → snap-back is a seamless continuation of the same physics).

**Alternatives considered**:

- **CSS transitions**: Cannot be interrupted mid-flight by gesture input without visual glitches. Spring animations via rAF are interruptible by design.
- **Web Animations API**: Same interruption problem. Also poor Safari support for custom timing.
- **Underdamped spring (bouncy)**: Feels playful but wrong for a productivity/note-taking app. Bouncing zoom is disorienting.

## Decision 4: Rubber-Band Formula

**Decision**: Use Apple's reverse-engineered rubber-band formula.

**Formula**:

```
rubberBand(offset, dimension, constant = 0.55) =
  (offset * dimension * constant) / (dimension + constant * offset)
```

Where:

- `offset` = distance past the boundary (always positive)
- `dimension` = viewport dimension (width or height)
- `constant` = 0.55 (Apple's coefficient)

**Properties**: As offset → ∞, result → dimension (never exceeds viewport size). At small values, shows ~55% of the drag distance. This creates the familiar "stretchy" resistance feel.

**Applied to zoom boundaries**: When zoom exceeds MAX_ZOOM or drops below MIN_ZOOM, apply the formula to the zoom delta: `displayedZoom = boundary + sign * rubberBand(|zoom - boundary|, 1.0, 0.55)`.

## Decision 5: Momentum Scrolling Model

**Decision**: Use **exponential decay** matching iOS UIScrollView behavior.

**Model**:

```
velocity(t) = v0 * decelerationRate^(t * 1000)
```

- `decelerationRate` = 0.998 (UIScrollView.DecelerationRate.normal)
- Stop when `|velocity| < 0.5` px/frame

**Per-frame implementation** (simpler, equivalent at 60fps):

```
velocity *= 0.95    // per frame at ~16.7ms
position += velocity
if (|velocity| < 0.5) stop
```

The relationship: `0.998^16.7 ≈ 0.967`, `0.95` per frame at 60fps gives similar feel. The exact coefficient can be tuned.

**Rationale**: Exponential decay is the standard for touch momentum. It feels natural because it models friction — fast flicks travel far, slow drags stop quickly. The 0.95/frame value produces ~1s of visible motion, matching user expectations.

**Alternatives considered**:

- **Linear deceleration**: Feels robotic — constant slowdown doesn't match physical intuition.
- **Cubic bezier animation**: Fixed duration doesn't scale with flick velocity. A fast flick and slow flick would take the same time to stop.

## Decision 6: Animated Double-Tap Zoom

**Decision**: Use a critically-damped spring (same system as rubber-band snap-back) to animate from current zoom/position to target zoom/position.

**Duration**: ~300ms (the spring's natural settling time with stiffness=170, damping=26).

**Behavior**:

- Double-tap at 100% → zoom to 200%, centered on tap point
- Double-tap at any other zoom → zoom to 100% (fit-to-width), centered
- 300ms double-tap detection window (matches current implementation)

**Interruption**: Any touch gesture (pinch start or single-finger pan start) immediately cancels the animation. The camera state at the moment of interruption becomes the new gesture starting state.

## Decision 7: Coordinate Transform Updates

**Decision**: Centralize all screen↔content coordinate conversion through the camera model. Update all consumers (drawing, erasing, selection, text editing) to use a shared `screenToContent(screenPoint, camera)` function.

**Current state**: Each tool does its own scaling inline:

- `use-drawing.ts`: `x / scale`, `y / scale`
- `use-eraser.ts`: Similar inline conversion
- `use-selection.ts`: Similar inline conversion

**New approach**: A single `screenToContent(point, camera)` in `coordinate-utils.ts`:

```
screenToContent(point, camera) = {
  x: (point.x - camera.x) / camera.zoom,
  y: (point.y - camera.y) / camera.zoom
}
```

All tool hooks call this instead of inline division by `scale`. The `camera` object is passed via the existing props chain from `canvas-editor.tsx`.

**Rationale**: Single source of truth prevents coordinate bugs across tools. When the camera model changes, only one function needs updating.

## Sources

- Steve Ruiz (tldraw): "Creating a Zoom UI" — camera model architecture
- tldraw Camera System Documentation — `screenToPage`/`pageToScreen` patterns
- Apple UIScrollView rubber-band formula — reverse-engineered by Christian Schwinne
- Arek Holko: "UIScrollView Inertia, Bouncing and Rubber-Banding" — UIKit Dynamics values
- Ariya Hidayat: "Flick List with Momentum Scrolling" — exponential decay model
- Dan Burzo: "Pinch Me, I'm Zooming" — DOM gesture handling patterns
- Grant Sander: "The Math of Zooming In" — linear algebra derivation
- Maxime Heckel: "The Physics Behind Spring Animations" — spring solver implementation
