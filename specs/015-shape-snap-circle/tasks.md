# Tasks: Shape Snap on Hold

**Input**: Design documents from `/specs/015-shape-snap-circle/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the new shape detection module and TypeScript types

- [ ] T001 Create shape detection module with types and exports in src/lib/canvas/shape-detection.ts
- [ ] T002 Add unit test file for shape detection in src/lib/canvas/shape-detection.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core geometry utilities shared by all shape detectors

**CRITICAL**: No shape-specific work can begin until this phase is complete

- [ ] T003 Implement geometric helpers in src/lib/canvas/shape-detection.ts: computeCentroid, smoothPoints (moving average), detectCorners (angle change detection), computeAngularCoverage
- [ ] T004 Implement classifyShape orchestrator in src/lib/canvas/shape-detection.ts: takes StrokePoint[], runs all detectors, returns highest-scoring ShapeDetectionResult or null (minimum size threshold: bbox diagonal ≥ 30px)
- [ ] T005 Implement generateShapePoints in src/lib/canvas/shape-detection.ts: converts ShapeDetectionResult into StrokePoint[] for perfect-freehand rendering (circle: 64 points, rect: 32+corners, triangle: 24+corners)
- [ ] T006 Write unit tests for geometric helpers in src/lib/canvas/shape-detection.test.ts: centroid calculation, point smoothing, corner detection accuracy

**Checkpoint**: Foundation ready — shape-specific detectors can now be built in parallel

---

## Phase 3: User Story 1 — Circle Snap (Priority: P1) MVP

**Goal**: Draw a rough circle, hold pen, stroke snaps to a perfect circle

**Independent Test**: Draw a roughly circular shape with pen tool, hold still ~400ms, observe snap to perfect circle

- [ ] T007 [P] [US1] Implement detectCircle scorer in src/lib/canvas/shape-detection.ts: compute radius variance from centroid (CV < 0.25), check angular coverage ≥ 270°, return confidence score
- [ ] T008 [P] [US1] Implement renderCirclePoints in src/lib/canvas/shape-detection.ts: generate 64 evenly-spaced StrokePoint[] along circumference given center + radius + average pressure
- [ ] T009 [US1] Write unit tests for circle detection in src/lib/canvas/shape-detection.test.ts: test with perfect circle points, rough circle, open arc (270°+), non-circle (line, random), small shape below threshold
- [ ] T010 [US1] Integrate circle snap into hold timer in src/hooks/use-drawing.ts: replace line-only snap with classifyShape call, add snapShapeRef to track detected shape type and params, render circle on working canvas when detected
- [ ] T011 [US1] Handle circle commit on pointer up in src/hooks/use-drawing.ts: when isSnapped and shape is circle, generate circle StrokePoint[] via generateShapePoints, create Stroke with computed BBox, call onStrokeComplete

**Checkpoint**: Circle snap fully functional — draw rough circle, hold, snaps to perfect circle

---

## Phase 4: User Story 2 — Rectangle Snap (Priority: P1)

**Goal**: Draw a rough rectangle/square, hold pen, stroke snaps to a perfect rectangle

**Independent Test**: Draw a roughly rectangular shape, hold still ~400ms, observe snap to perfect rectangle

- [ ] T012 [P] [US2] Implement detectRectangle scorer in src/lib/canvas/shape-detection.ts: detect 4 corners via angle changes, check corner angles ~90° (±30°), check edge straightness, return confidence score. Near-square (aspect 0.8–1.2) preference
- [ ] T013 [P] [US2] Implement renderRectanglePoints in src/lib/canvas/shape-detection.ts: generate StrokePoint[] along 4 edges (8 per edge + corners) given 4 corner positions + average pressure
- [ ] T014 [US2] Write unit tests for rectangle detection in src/lib/canvas/shape-detection.test.ts: test with rough rectangle points, rough square, non-rectangle (circle, line), elongated shape near line threshold
- [ ] T015 [US2] Wire rectangle into classifyShape orchestrator in src/lib/canvas/shape-detection.ts and verify disambiguation with circle (circle > rect priority)

**Checkpoint**: Both circle and rectangle snap work independently

---

## Phase 5: User Story 3 — Triangle Snap (Priority: P2)

**Goal**: Draw a rough triangle, hold pen, stroke snaps to a perfect triangle

**Independent Test**: Draw a roughly triangular shape, hold still ~400ms, observe snap to perfect triangle

- [ ] T016 [P] [US3] Implement detectTriangle scorer in src/lib/canvas/shape-detection.ts: detect 3 corners via angle changes, check edge straightness between corners, return confidence score
- [ ] T017 [P] [US3] Implement renderTrianglePoints in src/lib/canvas/shape-detection.ts: generate StrokePoint[] along 3 edges (8 per edge + corners) given 3 corner positions + average pressure
- [ ] T018 [US3] Write unit tests for triangle detection in src/lib/canvas/shape-detection.test.ts: test with rough triangle, non-triangle (rect, circle), ambiguous shapes
- [ ] T019 [US3] Wire triangle into classifyShape orchestrator in src/lib/canvas/shape-detection.ts and verify disambiguation (circle > rect > triangle > line)

**Checkpoint**: All three shapes snap correctly and are disambiguated

---

## Phase 6: User Story 4 — Adjust Shape Size After Snap (Priority: P2)

**Goal**: After snap, moving the pen adjusts the shape size before committing

**Independent Test**: Draw shape, wait for snap, drag pen to resize, lift to commit

- [ ] T020 [US4] Implement shape resize on pointer move after snap in src/hooks/use-drawing.ts: circle — radius = distance from center to pen; rectangle — dragged corner follows pen, opposite corner fixed; triangle — uniform scale from centroid
- [ ] T021 [US4] Re-render shape on working canvas during resize in src/hooks/use-drawing.ts: call renderStroke with updated generateShapePoints output on each pointer move while snapped

**Checkpoint**: Full GoodNotes-like experience — draw, snap, adjust, commit

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, regression testing, cleanup

- [ ] T022 Verify straight-line snap still works correctly (no regression) — manual test with various line strokes in src/hooks/use-drawing.ts
- [ ] T023 Verify shape snap works in both pen and highlighter modes with all colors/sizes
- [ ] T024 Handle edge case: tiny strokes (< 30px diagonal) stay freehand — verify minimum size threshold in classifyShape
- [ ] T025 Run full test suite (pnpm test) and fix any failures in src/lib/canvas/shape-detection.test.ts
- [ ] T026 Format check (pnpm format:check) and lint (pnpm lint) — fix any issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 Circle (Phase 3)**: Depends on Phase 2 — this is the MVP
- **US2 Rectangle (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 Triangle (Phase 5)**: Depends on Phase 2 — can run in parallel with US1/US2
- **US4 Adjust Size (Phase 6)**: Depends on at least one of US1/US2/US3 being complete
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Circle)**: Independent after Phase 2 — no dependencies on other stories
- **US2 (Rectangle)**: Independent after Phase 2 — no dependencies on other stories
- **US3 (Triangle)**: Independent after Phase 2 — no dependencies on other stories
- **US4 (Adjust Size)**: Depends on the snap mechanism from US1/US2/US3 being in place

### Parallel Opportunities

- T007 + T008 can run in parallel (different functions, same file but no dependencies)
- T012 + T013 can run in parallel
- T016 + T017 can run in parallel
- US1, US2, US3 can all run in parallel after Phase 2 (different detectors, same module)

---

## Parallel Example: User Story 1 (Circle)

```bash
# Launch circle detection tasks in parallel:
Task: "Implement detectCircle scorer in src/lib/canvas/shape-detection.ts"
Task: "Implement renderCirclePoints in src/lib/canvas/shape-detection.ts"

# Then sequentially:
Task: "Write unit tests for circle detection"
Task: "Integrate circle snap into hold timer in use-drawing.ts"
Task: "Handle circle commit on pointer up"
```

---

## Implementation Strategy

### MVP First (Circle Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational geometry helpers
3. Complete Phase 3: Circle snap (US1)
4. **STOP and VALIDATE**: Test circle snap on desktop + iPad
5. Deploy if ready — circle snap alone delivers significant value

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add Circle (US1) → Test → Deploy (MVP!)
3. Add Rectangle (US2) → Test → Deploy
4. Add Triangle (US3) → Test → Deploy
5. Add Adjust Size (US4) → Test → Deploy (full GoodNotes-like experience)

---

## Notes

- All shape detection logic is isolated in `shape-detection.ts` for testability
- The only existing file modified is `use-drawing.ts` (hold timer + pointer up)
- Shapes are stored as regular `Stroke` objects (StrokePoint arrays) — no schema changes
- Commit after each completed user story phase
