/**
 * Input Router — routes pointer events to the appropriate handler
 * based on input type (pen / touch / mouse) and current mode.
 *
 * Pure functions, no React or side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** User-selected input mode that determines routing behaviour. */
export type InputMode = 'auto' | 'draw' | 'select';

/** The resolved action the canvas should perform for a given pointer event. */
export type InputAction = 'draw' | 'pan' | 'interact' | 'none';

// ---------------------------------------------------------------------------
// Core routing
// ---------------------------------------------------------------------------

/**
 * Determine the action the canvas should perform for a pointer event.
 *
 * @param event       - The browser PointerEvent.
 * @param mode        - The currently active InputMode.
 * @param hitElement  - Whether the pointer landed on an existing canvas element.
 * @returns The resolved InputAction.
 *
 * Routing rules:
 *
 * **auto mode** (the default — adapts to the input device)
 *   pen   + no hit  → draw
 *   pen   + hit     → interact
 *   touch + no hit  → pan
 *   touch + hit     → interact
 *   mouse           → interact (default; could be extended with tool selection)
 *
 * **draw mode** — always draw regardless of pointer type.
 *
 * **select mode** — never draw; interact with elements, pan on empty space.
 */
export function resolveInputAction(
  event: PointerEvent,
  mode: InputMode,
  hitElement: boolean,
): InputAction {
  switch (mode) {
    case 'draw':
      return 'draw';

    case 'select':
      return hitElement ? 'interact' : 'pan';

    case 'auto':
      return resolveAutoMode(event, hitElement);

    default: {
      // Exhaustive check — if a new mode is added this will cause a
      // compile-time error until it is handled.
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Internal helper for `auto` mode routing based on pointer type.
 */
function resolveAutoMode(
  event: PointerEvent,
  hitElement: boolean,
): InputAction {
  switch (event.pointerType) {
    case 'pen':
      return hitElement ? 'interact' : 'draw';

    case 'touch':
      return hitElement ? 'interact' : 'pan';

    case 'mouse':
      // Mouse defaults to interact. A future tool-selection system could
      // override this to return 'draw' when a drawing tool is active.
      return 'interact';

    default:
      // Unknown pointer type — fall back to interact so the user can at
      // least select / move things.
      return 'interact';
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the pointer event originated from a stylus
 * (Apple Pencil or any other pen digitiser).
 */
export function isApplePencil(event: PointerEvent): boolean {
  return event.pointerType === 'pen';
}

/**
 * Extract a normalised pressure value from a pointer event.
 *
 * - For pen / touch events the browser-reported pressure (0–1) is returned
 *   after clamping.
 * - Mouse events typically report 0 or 0.5 depending on the browser;
 *   we normalise them to a constant 0.5 so downstream stroke-width
 *   calculations behave predictably.
 *
 * @returns A number in the range [0, 1].
 */
export function getPressure(event: PointerEvent): number {
  if (event.pointerType === 'mouse') {
    return 0.5;
  }

  return clamp(event.pressure, 0, 1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp `value` between `min` and `max` inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
