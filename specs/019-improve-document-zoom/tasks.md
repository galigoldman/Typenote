# Tasks: Improve Document Zoom UX

**Input**: Design documents from `/specs/019-improve-document-zoom/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Unit tests included for pure math functions in `zoom-physics.ts` and coordinate conversion (easily testable, high value). Manual iPad testing for gesture feel.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create the pure-math utility module and its tests. No behavioral changes yet.

- [x] T001 Create zoom physics utility with spring solver, momentum decay, rubber-band formula, and constants in `src/lib/canvas/zoom-physics.ts`
- [x] T002 Write unit tests for all zoom-physics pure functions (springStep, momentumStep, rubberBand, clampZoom) in `src/lib/canvas/__tests__/zoom-physics.test.ts`

---

## Phase 2: Foundational (Camera Model Migration)

**Purpose**: Replace native-scroll-based zoom/pan with a custom camera model. This is the blocking prerequisite for all user stories — it changes how the viewport transform is applied.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Define Camera, GestureState, AnimationState, and MomentumState TypeScript interfaces in `src/lib/canvas/zoom-physics.ts` (append to existing file)
- [x] T004 Add `screenToContent()` and `contentToScreen()` functions using camera model to `src/lib/canvas/coordinate-utils.ts`
- [x] T005 Write unit tests for screenToContent and contentToScreen at various zoom levels and offsets in `src/lib/canvas/__tests__/coordinate-utils.test.ts`
- [x] T006 Rewrite `src/hooks/use-pinch-zoom.ts` to use camera state `{x, y, zoom, fitScale}` instead of separate `zoom` + native scroll. Return `camera` object instead of `{scale, zoom, fitScale}`. Keep existing pinch, double-tap, and wheel handlers functional but operating on camera state.
- [x] T007 Update `src/components/canvas/canvas-editor.tsx` scroll container: replace `overflowX/Y: auto` + native scroll with `overflow: hidden`, apply `transform: translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` on the content wrapper, remove `scrollLeft`/`scrollTop` usage, set `transformOrigin: 'top left'` always
- [x] T008 Update all coordinate consumers (`src/hooks/use-drawing.ts`, `src/hooks/use-eraser.ts`, `src/hooks/use-selection.ts`) — NOT NEEDED: these hooks use `PAGE_WIDTH / getBoundingClientRect().width` which automatically reflects CSS transforms. No code changes required.
- [x] T009 Verify all tools (draw, erase, select, text edit) work correctly at 100% and 200% zoom after camera migration — run existing tests and manual spot-check on iPad

**Checkpoint**: App works identically to before at zoom >= 100%, but now using camera model internally. No visible behavior change yet.

---

## Phase 3: User Story 1 - Focal-Point Pinch Zoom (Priority: P1)

**Goal**: Content under the pinch midpoint stays visually stationary throughout the gesture. Pan-while-zoom works smoothly.

**Independent Test**: Pinch on a specific word — it stays under your fingers. Pinch and drag simultaneously — both zoom and pan update without jumps.

### Implementation for User Story 1

- [x] T010 [US1] Implement focal-point zoom math in pinch handler in `src/hooks/use-pinch-zoom.ts`: on touchmove, convert midpoint to content space using old camera, compute new zoom from pinch ratio, recompute camera.x/y so the content point stays at the screen midpoint. Apply two-finger pan offset from midpoint delta.
- [x] T011 [US1] Remove the `requestAnimationFrame` wrapper around scroll position updates in `src/hooks/use-pinch-zoom.ts` — camera state updates are now synchronous via setState, eliminating the one-frame lag
- [x] T012 [US1] Test focal-point accuracy: write a unit test in `src/lib/canvas/__tests__/coordinate-utils.test.ts` that verifies a content point maps to the same screen point before and after a zoom change when the focal-point formula is applied

**Checkpoint**: Pinch zoom anchors to the touch midpoint. Pan-while-zoom is smooth. Drawing/erasing still works at all zoom levels.

---

## Phase 4: User Story 2 - Zoom Below 100% (Priority: P1)

**Goal**: Users can zoom out past fit-to-width (down to 25%) to see the page with margins. Document stays centered when smaller than viewport.

**Independent Test**: Pinch inward past 100% — page shrinks with padding around it. Double-tap returns to 100%.

### Implementation for User Story 2

- [x] T013 [US2] Lower `MIN_ZOOM` from 1.0 to 0.25 in `src/lib/canvas/zoom-physics.ts` and update the zoom clamp in pinch/wheel handlers in `src/hooks/use-pinch-zoom.ts`
- [x] T014 [US2] Implement viewport centering logic in `src/hooks/use-pinch-zoom.ts`: when `pageWidth * scale < containerWidth`, compute `camera.x = (containerWidth - pageWidth * scale) / 2`. Same for vertical axis. Apply this centering after every zoom change and on resize.
- [x] T015 [US2] Update `src/components/canvas/canvas-editor.tsx` content wrapper: ensure the explicit `width` style accommodates sub-100% zoom (content wrapper should not collapse when zoomed out). Remove the conditional `width: zoom > 1 ? ... : undefined` — always set width based on camera.
- [x] T016 [US2] Handle `fitScale` recalculation on container resize (ResizeObserver) in `src/hooks/use-pinch-zoom.ts`: preserve the current zoom level and re-center the camera when the container size changes (device rotation, sidebar toggle)

**Checkpoint**: Zoom range is 25%-400%. Document is centered at sub-100%. Orientation changes preserve zoom level.

---

## Phase 5: User Story 3 - Smooth Horizontal Panning (Priority: P2)

**Goal**: When zoomed in, one-finger pan (in non-drawing modes) moves the viewport with momentum. Flick to scroll with natural deceleration.

**Independent Test**: Zoom to 200%, flick horizontally — content scrolls and decelerates to a stop. At 100% or below, horizontal pan is disabled.

### Implementation for User Story 3

- [x] T017 [US3] Add single-finger pan gesture detection in `src/hooks/use-pinch-zoom.ts`: track touch start/move/end for single-finger drag when not in draw/erase mode. Update camera.x/y on touchmove. Calculate release velocity from last few touchmove events.
- [x] T018 [US3] Implement momentum loop in `src/hooks/use-pinch-zoom.ts`: on touchend with velocity, start a rAF loop that applies `momentumStep()` from zoom-physics.ts to camera.x/y each frame. Stop when velocity drops below MOMENTUM_STOP threshold.
- [x] T019 [US3] Add pan boundary clamping in `src/hooks/use-pinch-zoom.ts`: compute max pan extents from `(pageWidth * scale - containerWidth)` and `(totalHeight * scale - containerHeight)`. Clamp camera.x/y to these bounds during pan and momentum. At zoom <= 1, lock horizontal pan (camera.x = centered value).
- [x] T020 [US3] Ensure momentum animation is cancelled when a new touch gesture starts — check in touchstart handler of `src/hooks/use-pinch-zoom.ts` and cancel any active rAF via stored rafId

**Checkpoint**: Smooth momentum panning when zoomed in. Horizontal pan locked at/below 100%. Momentum interrupted by new touches.

---

## Phase 6: User Story 4 - Smooth Animated Transitions (Priority: P2)

**Goal**: Double-tap zoom animates smoothly via spring physics. Animations are interruptible by gestures.

**Independent Test**: Double-tap at 100% — smooth ~300ms animation to 200%. Double-tap again — smooth back to 100%. Start pinching during an animation — it cancels immediately.

### Implementation for User Story 4

- [x] T021 [US4] Implement `animateCamera()` function in `src/hooks/use-pinch-zoom.ts`: takes target `{x, y, zoom}`, creates spring states for each axis, runs a rAF loop calling `springStep()` from zoom-physics.ts each frame, updates camera state. Stops when all springs converge.
- [x] T022 [US4] Rewrite double-tap handler in `src/hooks/use-pinch-zoom.ts`: instead of instant `setZoom(target)`, call `animateCamera()` with target zoom and focal-point-adjusted camera.x/y. Zoom to 200% centered on tap point when at ~100%, zoom to 100% centered when at other zoom levels.
- [x] T023 [US4] Add animation interruption: in touchstart handler of `src/hooks/use-pinch-zoom.ts`, if an animation rAF is active, cancel it via `cancelAnimationFrame(rafId)`. The current interpolated camera state becomes the starting state for the new gesture.
- [x] T024 [US4] Wire `resetZoom()` through `animateCamera()` in `src/hooks/use-pinch-zoom.ts` — any programmatic zoom reset should animate, not snap

**Checkpoint**: Double-tap animates smoothly. Pinch during animation interrupts cleanly. Reset zoom animates.

---

## Phase 7: User Story 5 - Rubber-Band Overscroll Feedback (Priority: P3)

**Goal**: Elastic resistance at zoom min/max and pan boundaries. Springs back on release.

**Independent Test**: At max zoom, keep pinching outward — zoom stretches slightly past 400% then springs back. Pan past the left edge — elastic overscroll then bounce-back.

### Implementation for User Story 5

- [x] T025 [US5] Allow zoom to exceed MIN_ZOOM/MAX_ZOOM during active pinch gesture in `src/hooks/use-pinch-zoom.ts`: remove hard clamp in touchmove handler. Instead, apply `rubberBand()` from zoom-physics.ts to the excess: `displayZoom = boundary ± rubberBand(|zoom - boundary|, 1.0, 0.55)`. Only apply rubber-band during active gesture (gestureRef is set).
- [x] T026 [US5] On pinch gesture end in `src/hooks/use-pinch-zoom.ts`: if zoom is outside [MIN_ZOOM, MAX_ZOOM], use `animateCamera()` (from US4) to spring back to the nearest boundary. Camera.x/y adjust accordingly.
- [x] T027 [US5] Allow pan to exceed boundaries during active touch in `src/hooks/use-pinch-zoom.ts`: apply `rubberBand()` to pan overshoot using viewport dimension. On touchend, spring back to clamped bounds via `animateCamera()`.
- [x] T028 [US5] Handle momentum-into-boundary transition in `src/hooks/use-pinch-zoom.ts`: when momentum carries camera past pan boundary, stop momentum loop and start spring snap-back via `animateCamera()` targeting the clamped position

**Checkpoint**: Rubber-band feel at all boundaries. Smooth spring-back on release. Momentum transitions into bounce cleanly.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, regression verification, and cleanup.

- [x] T029 Handle device orientation changes in `src/hooks/use-pinch-zoom.ts`: in ResizeObserver callback, recompute fitScale, preserve zoom level, re-derive camera.x/y to keep the previously-centered content area visible
- [x] T030 Ensure `touchAction` styles in `src/components/canvas/canvas-editor.tsx` are correct for the new pan system: set `touchAction: 'none'` on the scroll container in all modes (since we handle all gestures manually now), except text mode where native text selection needs `touchAction: 'pan-y'`
- [x] T031 Verify existing touch-scroll fallback in `src/components/canvas/canvas-page.tsx` (lines 285-322) still works with camera model — REPLACED: removed scroll fallback, camera-based panning handles this at container level
- [x] T032 Update `src/components/canvas/zoom-indicator.tsx` to read displayPercent from camera state if the interface changed — NOT NEEDED: component receives percent/visible as props, no interface change
- [x] T033 Run full test suite (`pnpm test`) and fix any regressions from camera model migration
- [ ] T034 Manual iPad testing: verify all acceptance scenarios from spec.md across all five user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (zoom-physics.ts must exist) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — focal-point fix builds on camera model
- **US2 (Phase 4)**: Depends on Phase 2 — sub-100% zoom needs camera model. Can run in parallel with US1.
- **US3 (Phase 5)**: Depends on Phase 2 — momentum needs camera-based pan
- **US4 (Phase 6)**: Depends on Phase 2 + T001 (spring solver from zoom-physics.ts)
- **US5 (Phase 7)**: Depends on Phase 6 (US4) — uses `animateCamera()` for spring-back
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No dependency on other stories.
- **US2 (P1)**: After Phase 2. No dependency on other stories. Can run in parallel with US1.
- **US3 (P2)**: After Phase 2. No dependency on other stories.
- **US4 (P2)**: After Phase 2. No dependency on other stories.
- **US5 (P3)**: After US4 (reuses `animateCamera()` for spring-back). This is the only cross-story dependency.

### Within Each User Story

- Core zoom/pan math before UI integration
- Camera state before consumers
- Implementation before manual verification

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T004 and T005 can run in parallel with T003
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Phase 2
- US3 (Phase 5) and US4 (Phase 6) can run in parallel after Phase 2
- T029, T030, T031, T032 in Polish phase can all run in parallel (different files)

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (zoom-physics.ts + tests)
2. Complete Phase 2: Foundational (camera model migration)
3. Complete Phase 3: US1 — Focal-point pinch zoom
4. Complete Phase 4: US2 — Sub-100% zoom
5. **STOP and VALIDATE**: Test pinch zoom accuracy and sub-100% centering on iPad
6. This delivers the two P1 requirements — the core value of the feature

### Incremental Delivery

1. Setup + Foundational → Camera model works (no visible change)
2. Add US1 → Pinch anchors correctly (major UX improvement)
3. Add US2 → Zoom out to overview (major capability)
4. Add US3 → Momentum pan (polish)
5. Add US4 → Animated transitions (polish)
6. Add US5 → Rubber-band (final polish)
7. Each story adds perceived quality without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Most tasks modify `src/hooks/use-pinch-zoom.ts` — sequential execution within each story is safer than parallel
- Spring physics and momentum are pure functions — easily unit tested
- Manual iPad testing is essential for gesture feel — unit tests verify math, not UX
- Commit after each phase checkpoint
