# Implementation Plan: Fix Pen Double-Tap Triggering Zoom

**Branch**: `023-fix-pen-double-tap-zoom` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-fix-pen-double-tap-zoom/spec.md`

## Summary

Pen/stylus double-taps trigger the app's custom zoom toggle (100% ↔ 200%) on the production site despite existing `hasStylus(e.changedTouches)` guards. The fix adds a redundant PointerEvent-based pen detection that tracks the last pointer type, ensuring pen input is excluded from the double-tap code path even when `TouchEvent.touchType` is unreliable.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router)
**Storage**: N/A — client-side only, no data changes
**Testing**: Vitest (unit tests)
**Target Platform**: iPadOS Safari with Apple Pencil (primary), touch devices generally
**Project Type**: Web application (Next.js)
**Performance Goals**: No perceptible delay to pen stroke initiation
**Constraints**: Must not regress finger double-tap zoom or any pen drawing/erasing interactions
**Scale/Scope**: Single file change (`use-pinch-zoom.ts`) + test updates

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                   |
| ------------------------------- | ------ | ------------------------------------------------------- |
| I. Incremental Development      | PASS   | Bug fix on existing feature, no new infrastructure      |
| II. Test-Driven Quality         | PASS   | Will add test for double-tap pen exclusion              |
| III. Protected Main Branch      | PASS   | Working on feature branch `023-fix-pen-double-tap-zoom` |
| IV. Migrations as Code          | N/A    | No database changes                                     |
| V. Interview-Ready Architecture | PASS   | Simple, well-documented fix                             |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/023-fix-pen-double-tap-zoom/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify)

```text
src/hooks/
├── use-pinch-zoom.ts              # Main fix: add PointerEvent pen tracking to double-tap guard
└── __tests__/
    └── use-pinch-zoom-stylus.test.ts  # Add double-tap pen exclusion tests
```

## Root Cause Analysis

The existing guard at line 410 of `use-pinch-zoom.ts` uses `!hasStylus(e.changedTouches)` to skip pen taps:

```typescript
if (
  e.touches.length === 0 &&
  e.changedTouches.length === 1 &&
  !hasStylus(e.changedTouches)  // <-- guard
)
```

`hasStylus()` relies on `TouchEvent.touchType === 'stylus'`, which is iPadOS-specific and may not be reliably present on `changedTouches` in the `touchend` event across all iOS Safari versions and deployment contexts. This explains the localhost vs production discrepancy — the property availability may differ based on browser optimizations triggered by HTTPS, viewport settings, or iOS version.

## Fix Approach

**Track the last pointer type via PointerEvent** as a redundant detection mechanism:

1. Add a `lastPointerType` variable (scoped inside the `useEffect`) that records `e.pointerType` on every `pointerdown` event
2. In the double-tap detection block, check BOTH `!hasStylus(e.changedTouches)` AND `lastPointerType !== 'pen'`
3. In the stylus-lift reset block, also trigger reset when `lastPointerType === 'pen'`
4. Register `pointerdown` listener to capture `pointerType` — this fires before `touchstart`/`touchend` on iOS

**Why PointerEvent?** `PointerEvent.pointerType` is a W3C standard (`"mouse" | "touch" | "pen"`) supported across all modern browsers and platforms. It's more reliable than the iPadOS-specific `Touch.touchType`. Using both provides defense in depth.

**Why this differs from the reverted approach**: The previous `penIsDown` flag (commit 7ffd156) tracked ongoing pen contact state with both `pointerdown` and `pointerup`, which created complex state management. This approach is simpler — it only records the _last_ pointer type on `pointerdown` and uses it as a one-shot check. No `pointerup` tracking needed.

## Implementation Steps

### Step 1: Add PointerEvent listener and `lastPointerType` tracking

In `use-pinch-zoom.ts`, inside the main `useEffect`:

1. Declare `let lastPointerType: string = ''` alongside existing local variables
2. Add `handlePointerDown` that sets `lastPointerType = e.pointerType`
3. Register the listener on the container: `container.addEventListener('pointerdown', handlePointerDown)`
4. Clean up in the return function

### Step 2: Update double-tap guard

Modify the double-tap detection condition (line 407-411) to also check `lastPointerType`:

```typescript
if (
  e.touches.length === 0 &&
  e.changedTouches.length === 1 &&
  !hasStylus(e.changedTouches) &&
  lastPointerType !== 'pen'
)
```

### Step 3: Update stylus-lift reset

Modify the stylus-lift reset condition (line 459-466) to also trigger on `lastPointerType === 'pen'`:

```typescript
if (
  e.touches.length === 0 &&
  e.changedTouches.length === 1 &&
  (hasStylus(e.changedTouches) || lastPointerType === 'pen')
) {
  tapCount = 0;
  if (tapTimer) clearTimeout(tapTimer);
}
```

### Step 4: Add tests

In `use-pinch-zoom-stylus.test.ts`, add test cases for the double-tap exclusion logic. Since the double-tap detection is internal to the hook's `useEffect`, the tests will validate:

- `hasStylus` continues to work correctly (existing tests)
- Document the expected behavior in test descriptions for the PointerEvent-based guard (integration-level behavior that requires a real browser)

### Step 5: Verify

1. Run `pnpm test` to confirm no regressions
2. Run `pnpm lint` and `pnpm format:check`
3. Deploy to Vercel preview and test on iPad with Apple Pencil
