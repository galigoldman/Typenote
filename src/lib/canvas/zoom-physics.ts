/**
 * Pure math functions for zoom, pan, and animation physics.
 *
 * All functions are stateless and side-effect-free, making them
 * easy to unit test and reason about independently of React state.
 */

// ── Constants ────────────────────────────────────────────────────────

export const MIN_ZOOM = 0.25; // 25% — overview mode
export const MAX_ZOOM = 4.0; // 400% — max zoom in
export const DOUBLE_TAP_DELAY = 300; // ms

// Spring physics (critically-damped — no bounce, ~300ms settle)
export const SPRING_STIFFNESS = 170;
export const SPRING_DAMPING = 26;
export const SPRING_MASS = 1;
export const SPRING_THRESHOLD = 0.5; // convergence threshold (px or zoom units)

// Momentum scrolling (exponential decay matching iOS feel)
export const MOMENTUM_DECAY = 0.95; // per-frame multiplier at 60fps
export const MOMENTUM_STOP = 0.5; // min velocity before stopping (px/frame)

// Rubber-band coefficient. Apple's reverse-engineered constant is 0.55, but
// that produces a fairly subtle overscroll. Bumped to 0.8 for more visible
// iOS-like bounce — makes draw mode feel closer to native scroll.
export const RUBBER_BAND_C = 0.8;

// Animation safety
export const MAX_DT = 0.032; // 32ms cap to prevent physics explosion

// ── Interfaces ───────────────────────────────────────────────────────

export interface Camera {
  x: number; // horizontal offset (px) — content position relative to viewport
  y: number; // vertical offset (px)
  zoom: number; // user zoom multiplier (1.0 = page fills width)
  fitScale: number; // CSS scale at which pageWidth fills container
}

export interface SpringState {
  position: number;
  velocity: number;
  target: number;
}

export interface GestureState {
  startDistance: number;
  startZoom: number;
  startX: number; // camera.x at gesture start
  startY: number; // camera.y at gesture start
  midX: number; // pinch midpoint in screen space
  midY: number; // pinch midpoint in screen space
}

// ── Spring Solver ────────────────────────────────────────────────────

/**
 * Advance a critically-damped spring by one time step (Euler integration).
 *
 * The spring equation: acceleration = (-stiffness * displacement - damping * velocity) / mass
 *
 * Returns updated position and velocity. The caller should check convergence
 * via `isSpringSettled()`.
 */
export function springStep(
  state: SpringState,
  dt: number,
  stiffness = SPRING_STIFFNESS,
  damping = SPRING_DAMPING,
  mass = SPRING_MASS,
): SpringState {
  const clampedDt = Math.min(dt, MAX_DT);
  const displacement = state.position - state.target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * state.velocity;
  const acceleration = (springForce + dampingForce) / mass;
  const newVelocity = state.velocity + acceleration * clampedDt;
  const newPosition = state.position + newVelocity * clampedDt;

  return {
    position: newPosition,
    velocity: newVelocity,
    target: state.target,
  };
}

/**
 * Check if a spring has settled (close enough to target with negligible velocity).
 */
export function isSpringSettled(
  state: SpringState,
  threshold = SPRING_THRESHOLD,
): boolean {
  return (
    Math.abs(state.velocity) < threshold &&
    Math.abs(state.position - state.target) < threshold
  );
}

// ── Momentum Decay ───────────────────────────────────────────────────

/**
 * Apply one frame of exponential momentum decay.
 *
 * Returns the new velocity after friction. Position update should be
 * applied by the caller: `position += velocity`.
 */
export function momentumStep(velocity: number, decay = MOMENTUM_DECAY): number {
  return velocity * decay;
}

/**
 * Check if momentum has effectively stopped.
 */
export function isMomentumStopped(
  velocity: number,
  threshold = MOMENTUM_STOP,
): boolean {
  return Math.abs(velocity) < threshold;
}

// ── Rubber Band ──────────────────────────────────────────────────────

/**
 * Apple's rubber-band formula for overscroll resistance.
 *
 * As offset → ∞, result → dimension (never exceeds viewport size).
 * At small offsets, shows ~55% of the drag distance.
 *
 * @param offset - distance past the boundary (always positive)
 * @param dimension - viewport dimension (width or height)
 * @param c - resistance coefficient (0.55 = Apple's default)
 */
export function rubberBand(
  offset: number,
  dimension: number,
  c = RUBBER_BAND_C,
): number {
  if (dimension === 0) return 0;
  return (offset * dimension * c) / (dimension + c * offset);
}

// ── Zoom Utilities ───────────────────────────────────────────────────

/**
 * Clamp zoom to valid range [MIN_ZOOM, MAX_ZOOM].
 */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Apply rubber-band resistance to zoom outside boundaries.
 * Returns the displayed zoom level during an active gesture.
 */
export function rubberBandZoom(rawZoom: number): number {
  if (rawZoom > MAX_ZOOM) {
    const excess = rawZoom - MAX_ZOOM;
    return MAX_ZOOM + rubberBand(excess, 1.0);
  }
  if (rawZoom < MIN_ZOOM) {
    const excess = MIN_ZOOM - rawZoom;
    return MIN_ZOOM - rubberBand(excess, 1.0);
  }
  return rawZoom;
}

/**
 * Compute camera offset to center content in viewport when zoomed out.
 * Returns the centered x (or y) offset.
 */
export function centerOffset(
  contentSize: number,
  viewportSize: number,
): number {
  if (contentSize >= viewportSize) return 0;
  return (viewportSize - contentSize) / 2;
}

/**
 * Compute the camera offset that keeps a focal point stationary during zoom.
 *
 * Given a screen-space point and the content-space point under it,
 * returns the new camera offset after zoom changes.
 *
 * Formula: newOffset = screenPoint - contentPoint * newScale
 */
export function focalPointOffset(
  screenPoint: number,
  contentPoint: number,
  newScale: number,
): number {
  return screenPoint - contentPoint * newScale;
}

/**
 * Clamp camera offset to valid pan bounds.
 *
 * When zoomed in (content > viewport): allows panning 0..-(content-viewport)
 * When zoomed out (content < viewport): centers content
 */
export function clampOffset(
  offset: number,
  contentSize: number,
  viewportSize: number,
): number {
  if (contentSize <= viewportSize) {
    // Content fits — center it
    return (viewportSize - contentSize) / 2;
  }
  // Content overflows — allow panning within bounds
  const minOffset = viewportSize - contentSize;
  return Math.min(0, Math.max(minOffset, offset));
}
