# Research: Fix Pen Double-Tap Triggering Zoom

## R1: Why `TouchEvent.touchType` may be unreliable on production

**Decision**: Use `PointerEvent.pointerType` as a redundant pen detection alongside `TouchEvent.touchType`.

**Rationale**: `TouchEvent.touchType` is an Apple-specific extension, not part of the W3C TouchEvent spec. Its availability on `changedTouches` in `touchend` events may vary across iOS Safari versions and deployment contexts. `PointerEvent.pointerType` is W3C-standardized and reliably reports `"pen"` for stylus input across all modern platforms.

**Alternatives considered**:

- **CSS `touch-action: manipulation` only** (reverted in commit f464918): Too broad — blocks ALL native double-tap zoom including for fingers. Also doesn't address the app's custom zoom handler.
- **Full `penIsDown` state tracking** (reverted in commit 7ffd156): Complex state management with both `pointerdown` and `pointerup` listeners. Introduced potential race conditions.
- **`lastPointerType` one-shot approach** (chosen): Records only the pointer type of the most recent `pointerdown`. No ongoing state tracking. Simpler and more reliable.

## R2: PointerEvent firing order relative to TouchEvent on iOS

**Decision**: Use `pointerdown` to capture `pointerType` — it fires before `touchstart` on iOS Safari.

**Rationale**: The W3C Pointer Events spec defines that `pointerdown` fires before the corresponding `touchstart` compatibility event. This means `lastPointerType` will already be set by the time the `touchend` handler runs for double-tap detection.

**Alternatives considered**:

- Capturing from `touchstart` instead: `TouchEvent` doesn't have a `pointerType` equivalent on non-Apple devices.
- Using `pointerup` for detection: Fires after `touchend`, so it's too late for the double-tap guard.

## R3: Why the bug manifests differently between localhost and production

**Decision**: Treat as an environmental quirk — the redundant detection approach fixes it regardless of root cause.

**Rationale**: The exact reason `touchType` might behave differently on localhost (HTTP, `localhost`) vs production (HTTPS, custom domain) is not fully determined. Possible causes include: iOS Safari feature policies that differ by security context, different browser gesture heuristics on HTTPS, or iOS version-specific behavior. The redundant PointerEvent guard fixes the bug regardless.

**Alternatives considered**:

- Deep-diving into the iOS Safari source to find the exact environmental trigger: Not feasible or necessary. The fix works regardless.
