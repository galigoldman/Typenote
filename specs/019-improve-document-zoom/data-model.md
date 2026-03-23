# Data Model: Improve Document Zoom UX

**Feature**: 019-improve-document-zoom
**Date**: 2026-03-23

## Overview

This feature has no database changes. The "data model" is the **camera state** — a client-side object that replaces the current `{zoom, fitScale}` state with a unified viewport representation.

## Camera State

The camera represents the viewport's relationship to the content coordinate space.

### Fields

| Field      | Type   | Description                                                | Range                         |
| ---------- | ------ | ---------------------------------------------------------- | ----------------------------- |
| `x`        | number | Horizontal offset of content relative to viewport (pixels) | Computed from zoom/content    |
| `y`        | number | Vertical offset of content relative to viewport (pixels)   | Computed from zoom/content    |
| `zoom`     | number | User zoom multiplier (1.0 = page fills width)              | 0.25 – 4.0                    |
| `fitScale` | number | CSS scale at which `pageWidth` fills the container         | Computed from container width |

### Derived Values

| Value            | Formula                  | Description                         |
| ---------------- | ------------------------ | ----------------------------------- |
| `scale`          | `fitScale * zoom`        | Actual CSS scale applied to content |
| `displayPercent` | `Math.round(zoom * 100)` | UI display string (e.g., "150%")    |

### Coordinate Conversion

```
screenToContent(screenPoint, camera):
  x = (screenPoint.x - camera.x) / (camera.fitScale * camera.zoom)
  y = (screenPoint.y - camera.y) / (camera.fitScale * camera.zoom)

contentToScreen(contentPoint, camera):
  x = contentPoint.x * (camera.fitScale * camera.zoom) + camera.x
  y = contentPoint.y * (camera.fitScale * camera.zoom) + camera.y
```

## Animation State

Active during programmatic transitions (double-tap, snap-back).

| Field        | Type           | Description                                       |
| ------------ | -------------- | ------------------------------------------------- |
| `active`     | boolean        | Whether an animation is running                   |
| `rafId`      | number \| null | `requestAnimationFrame` handle (for cancellation) |
| `springX`    | SpringState    | Spring state for x offset                         |
| `springY`    | SpringState    | Spring state for y offset                         |
| `springZoom` | SpringState    | Spring state for zoom level                       |

### SpringState

| Field      | Type   | Description                     |
| ---------- | ------ | ------------------------------- |
| `current`  | number | Current interpolated value      |
| `target`   | number | Destination value               |
| `velocity` | number | Current velocity (units/second) |

## Gesture State

Active during two-finger pinch gestures.

| Field           | Type   | Description                                 |
| --------------- | ------ | ------------------------------------------- |
| `startDistance` | number | Initial distance between two touch points   |
| `startZoom`     | number | Zoom level at gesture start                 |
| `startX`        | number | Camera x at gesture start                   |
| `startY`        | number | Camera y at gesture start                   |
| `midX`          | number | Midpoint x in screen space at gesture start |
| `midY`          | number | Midpoint y in screen space at gesture start |

## Momentum State

Active after a pan gesture ends with velocity.

| Field       | Type           | Description                               |
| ----------- | -------------- | ----------------------------------------- |
| `velocityX` | number         | Horizontal velocity at release (px/frame) |
| `velocityY` | number         | Vertical velocity at release (px/frame)   |
| `decayRate` | number         | Per-frame multiplier (0.95)               |
| `rafId`     | number \| null | Animation frame handle                    |

## Constants

| Constant           | Value | Description                                 |
| ------------------ | ----- | ------------------------------------------- |
| `MIN_ZOOM`         | 0.25  | Minimum zoom (25%)                          |
| `MAX_ZOOM`         | 4.0   | Maximum zoom (400%)                         |
| `DOUBLE_TAP_DELAY` | 300   | Double-tap detection window (ms)            |
| `SPRING_STIFFNESS` | 170   | Spring stiffness for snap-back              |
| `SPRING_DAMPING`   | 26    | Spring damping (critically damped)          |
| `SPRING_MASS`      | 1     | Spring mass                                 |
| `MOMENTUM_DECAY`   | 0.95  | Per-frame velocity multiplier               |
| `MOMENTUM_STOP`    | 0.5   | Minimum velocity before stopping (px/frame) |
| `RUBBER_BAND_C`    | 0.55  | Apple rubber-band resistance coefficient    |
| `SPRING_THRESHOLD` | 0.01  | Convergence threshold for spring animations |
| `MAX_DT`           | 0.032 | Maximum delta-time cap (seconds)            |

## State Transitions

```
IDLE → PINCHING (two-finger touch start)
IDLE → ANIMATING (double-tap detected)
IDLE → MOMENTUM (single-finger pan release with velocity)

PINCHING → IDLE (all fingers lifted, no velocity)
PINCHING → MOMENTUM (all fingers lifted, with velocity)
PINCHING → RUBBER_BAND_SNAP (fingers lifted while past boundary)

ANIMATING → IDLE (animation completes)
ANIMATING → PINCHING (new touch gesture interrupts)

MOMENTUM → IDLE (velocity below threshold)
MOMENTUM → PINCHING (new touch gesture interrupts)
MOMENTUM → RUBBER_BAND_SNAP (momentum carries past boundary)

RUBBER_BAND_SNAP → IDLE (spring settles)
RUBBER_BAND_SNAP → PINCHING (new touch gesture interrupts)
```
