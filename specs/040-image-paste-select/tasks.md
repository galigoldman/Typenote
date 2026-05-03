# Tasks: Paste Images as Canvas Objects

**Input**: Design documents from `/specs/040-image-paste-select/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/canvas-types.md

**Tests**: Included per CLAUDE.md testing requirements (unit tests + E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions and image processing utility — everything downstream depends on these.

- [x] T001 [P] Add `ImageObject` interface, extend `CanvasPage` with `images: ImageObject[]` (default `[]`), extend `ClipboardData` with `images: ImageObject[]`, and add new undo action types (`add-image`, `delete-images`, `move-images`, `resize-image`) to `CanvasAction` union in `src/types/canvas.ts`
- [x] T002 [P] Create `processClipboardImage(blob: Blob)` utility in `src/lib/canvas/image-utils.ts` — reads blob as HTMLImageElement, resizes to max 1200px longest dimension, converts to JPEG 80% (or PNG if transparent) via offscreen canvas, returns `{ src, width, height, aspectRatio }`
- [x] T003 [P] Write unit tests for `processClipboardImage` in `src/lib/canvas/__tests__/image-utils.test.ts` — test resize downscaling, aspect ratio calculation, output format selection, passthrough for small images

**Checkpoint**: Types and image processing utility ready. All downstream tasks can reference `ImageObject`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Image rendering on canvas pages — MUST be done before any user story, since all stories need to see images on screen.

- [x] T004 Render images on canvas pages in `src/components/canvas/canvas-page.tsx` — for each image in `page.images ?? []`, render an `<img>` element with absolute positioning (`x`, `y`, `width`, `height`), `src` from data URL, `pointer-events: none` (selection handled separately), layered above strokes SVG but below text boxes (z-order via render order or z-index)
- [x] T005 Update `pageHasContent()` helper in `src/components/canvas/canvas-editor.tsx` to include `page.images?.length > 0` as content (so auto-page-creation works when images are added)
- [x] T006 Ensure `images` defaults to `[]` when loading documents — add fallback `images: page.images ?? []` wherever pages are parsed/loaded in `src/components/canvas/canvas-editor.tsx`

**Checkpoint**: Images stored in page data will render visually. No way to add them yet (that's US1).

---

## Phase 3: User Story 1 — Paste an Image onto the Canvas (Priority: P1) MVP

**Goal**: User copies an image, presses Ctrl/Cmd+V, image appears on the page, editor switches to select mode with image pre-selected.

**Independent Test**: Copy any image → Ctrl/Cmd+V → image visible on page with selection handles.

### Implementation for User Story 1

- [x] T007 [US1] Add system clipboard `paste` event listener in `src/components/canvas/canvas-editor.tsx` — listen on `window` via `useEffect`, check `e.clipboardData.items` for `image/*` type, if found: prevent default, read as Blob, call `processClipboardImage()`, determine target page (viewport center), compute page coordinates, create `ImageObject` with UUID, position, dimensions (scaled to fit page if needed), and `src`
- [x] T008 [US1] Implement `handleImageAdd(pageId, image)` in `src/components/canvas/canvas-editor.tsx` — add image to `page.images` array via `setPages`, push `{ type: 'add-image', pageId, image }` to undo stack, clear redo stack, trigger save
- [x] T009 [US1] After image is added, auto-switch to select mode (`setActiveTool('select')`) and notify selection hook to pre-select the new image — pass the image ID to `use-selection.ts` via a callback or ref so it sets the image as the current selection with bounding box and handles visible
- [x] T010 [US1] Add undo/redo handling for `add-image` action in the undo/redo logic in `src/components/canvas/canvas-editor.tsx` — undo removes the image from `page.images`, redo re-adds it
- [x] T011 [US1] Ensure paste only fires for image clipboard data — when clipboard contains text (not image), fall through to existing internal paste logic (Ctrl+V for copied strokes). Non-image paste must not be broken.

**Checkpoint**: Users can paste images from clipboard. Images appear on page, auto-selected, with undo support.

---

## Phase 4: User Story 2 — Move and Resize a Pasted Image (Priority: P1)

**Goal**: Selected images can be dragged to reposition and resized via handles with locked aspect ratio.

**Independent Test**: Paste image → drag to new position → verify moved. Pull corner handle → verify resized proportionally.

**Dependencies**: Requires US1 (paste) to have images on canvas. Uses auto-select from paste as the selection mechanism.

### Implementation for User Story 2

- [x] T012 [US2] Add image drag (move) support in `src/hooks/use-selection.ts` — when selection includes images, during drag state compute `dx`/`dy` offset, update image positions, clamp to page boundaries (`x >= 0`, `x + width <= PAGE_WIDTH`, same for y). Include images in the existing drag offset calculation alongside strokes.
- [x] T013 [US2] Add `onImagesMove` callback from `use-selection.ts` to `canvas-editor.tsx` — on drag end, update `page.images` with new positions, push `move-images` undo action with previous positions
- [x] T014 [US2] Add aspect-ratio-locked resize for images in `src/hooks/use-selection.ts` — when resizing and selection contains images, compute scale factor from handle drag, apply uniformly to both width and height using `image.aspectRatio`, enforce minimum size (20x20px), clamp to page bounds. All 8 handles (corners + midpoints) produce proportional resize for images.
- [x] T015 [US2] Add `onImageResize` callback from `use-selection.ts` to `canvas-editor.tsx` — on resize end, update image in `page.images` with new `x`, `y`, `width`, `height`, push `resize-image` undo action with previous dimensions
- [x] T016 [US2] Add undo/redo handling for `move-images` and `resize-image` actions in `src/components/canvas/canvas-editor.tsx`

**Checkpoint**: Images can be moved and resized. Resize always preserves aspect ratio. All operations undoable.

---

## Phase 5: User Story 3 — Select an Existing Image (Priority: P2)

**Goal**: Users can tap/click on an existing image to select it. Images participate in rectangle selection alongside strokes.

**Independent Test**: Paste image → switch to draw mode → draw stroke → switch to select mode → tap image → verify selected with handles.

**Dependencies**: Requires US1 (images exist on page) and US2 (move/resize work once selected).

### Implementation for User Story 3

- [x] T017 [US3] Add single-image tap/click hit testing in `src/hooks/use-selection.ts` — during `handlePointerDown` in select mode, after checking for resize handle hits, check if pointer is within any image's bounding rect (`x <= px <= x+width`, `y <= py <= y+height`). If hit, select that image (set as selected with bounding box). Check images before strokes so images (higher z-layer) take precedence.
- [x] T018 [US3] Include images in rectangle selection in `src/hooks/use-selection.ts` — during selection rectangle completion, test each `page.images` against the selection rect (AABB overlap: image bbox intersects selection rect). Add matching images to `selectedImages` alongside `selectedStrokes`.
- [x] T019 [US3] Update selection bounding box calculation in `src/hooks/use-selection.ts` to include image bounds — when computing the combined bbox of all selected objects (for handles and highlight), union image rects with stroke bboxes

**Checkpoint**: Images can be re-selected after deselection. Rectangle selection captures images + strokes together.

---

## Phase 6: User Story 4 — Delete a Pasted Image (Priority: P2)

**Goal**: Selected images can be deleted via Delete/Backspace. Undo restores them.

**Independent Test**: Paste image → select → Delete key → image gone → Ctrl+Z → image restored.

**Dependencies**: Requires US3 (ability to select images) or US1 (auto-select after paste).

### Implementation for User Story 4

- [x] T020 [US4] Extend `deleteSelected` in `src/hooks/use-selection.ts` to include selected images — collect selected image IDs, call `onDeleteImages` callback
- [x] T021 [US4] Implement `handleDeleteImages(pageId, imageIds)` in `src/components/canvas/canvas-editor.tsx` — remove images from `page.images`, push `delete-images` undo action with the removed image objects, trigger save
- [x] T022 [US4] Add undo/redo handling for `delete-images` action in `src/components/canvas/canvas-editor.tsx` — undo re-adds deleted images to `page.images`, redo removes them again

**Checkpoint**: Full create-select-delete lifecycle works. All operations reversible via undo/redo.

---

## Phase 7: User Story 5 — Persistence & PDF Export (Priority: P2)

**Goal**: Images survive page reloads and appear in PDF exports.

**Independent Test**: Paste image → refresh browser → image still visible. Export to PDF → image appears in PDF.

**Dependencies**: Requires US1 (images exist in page data).

### Implementation for User Story 5

- [x] T023 [US5] Verify image persistence through save/load cycle — the existing `useDocumentSync` saves `pages` as JSONB which already includes `images`. Ensure the `images` array round-trips correctly: add → save → reload → render. Fix any serialization issues if `images` is stripped during save. Add `images` to any page sanitization/normalization logic that exists.
- [x] T024 [US5] Add image rendering to PDF export HTML in `src/lib/pdf/html-template.ts` — in the canvas page builder function, for each image in `page.images ?? []`, emit an absolutely-positioned `<img>` tag with `src` (base64 data URL), `left`, `top`, `width`, `height` in the same coordinate system as text boxes. Layer above strokes SVG, below text box divs.

**Checkpoint**: Images are fully persistent and export-ready.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Internal copy/paste for images, edge case handling, E2E tests.

- [x] T025 Extend internal copy/paste to include images in `src/hooks/use-selection.ts` — when `copySelection()` is called with selected images, deep-clone them into `clipboardRef.images[]`. When `pasteAtPosition()` is called, clone images with new UUIDs and offset positions (same pattern as strokes). Update `handlePaste` in `canvas-editor.tsx` to add pasted images to page state.
- [x] T026 Handle edge case: extremely large images — ensure `processClipboardImage` in `src/lib/canvas/image-utils.ts` handles images > 4000px gracefully (progressive resize if canvas memory is a concern), and test with large image blobs
- [x] T027 Write E2E Playwright tests in `e2e/` — test scenarios: (1) paste image from clipboard → verify visible on page, (2) paste image → drag to move → verify new position, (3) paste image → resize via handle → verify proportional, (4) paste image → delete → undo → verify restored, (5) paste image → reload page → verify persisted. Update `e2e/TEST_REGISTRY.md` with these scenarios.
- [x] T028 Run full test suite: `pnpm test && pnpm test:integration && pnpm test:e2e` — fix any failures before completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001, T002, T003 all parallel.
- **Foundational (Phase 2)**: Depends on T001 (types). T004, T005, T006 can be parallelized after T001.
- **US1 (Phase 3)**: Depends on Phase 2 + T002 (image-utils). T007–T011 are sequential (same file).
- **US2 (Phase 4)**: Depends on US1 (images must exist on page). T012–T016 are sequential (same files).
- **US3 (Phase 5)**: Depends on US1. Can run in parallel with US2 if desired. T017–T019 sequential (same file).
- **US4 (Phase 6)**: Depends on US1. Can run in parallel with US2/US3. T020–T022 sequential.
- **US5 (Phase 7)**: Depends on US1. Can run in parallel with US2/US3/US4. T023–T024 parallel (different files).
- **Polish (Phase 8)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (Paste)**: Foundation only — no other story dependencies. **MVP target.**
- **US2 (Move/Resize)**: Depends on US1 for auto-selected images to manipulate.
- **US3 (Select Existing)**: Depends on US1 for images to exist. Independent of US2.
- **US4 (Delete)**: Depends on US1. Independent of US2/US3 (can use auto-select from paste).
- **US5 (Persistence/PDF)**: Depends on US1. Independent of US2/US3/US4.

### Within Each User Story

- Implementation tasks within a story are sequential (same files: `use-selection.ts`, `canvas-editor.tsx`)
- Undo/redo tasks follow the operation they support

### Parallel Opportunities

```
Phase 1: T001 ║ T002 ║ T003   (3 parallel — different files)
Phase 2: T004 ║ T005 ║ T006   (3 parallel after T001 — different files/functions)
Phase 3: T007 → T008 → T009 → T010 → T011  (sequential — same files)
Phase 4: T012 → T013 → T014 → T015 → T016  (sequential — same files)
Phase 5: T017 → T018 → T019   (sequential — same file)
Phase 6: T020 → T021 → T022   (sequential — same files)
Phase 7: T023 ║ T024           (2 parallel — different files)
Phase 8: T025 → T026 → T027 → T028  (sequential)
```

After Phase 2 completes, US3/US4/US5 can run in parallel with US2 (if staffed).

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all 3 setup tasks together (different files):
Task T001: "Add ImageObject type and extend CanvasPage/ClipboardData/CanvasAction in src/types/canvas.ts"
Task T002: "Create processClipboardImage utility in src/lib/canvas/image-utils.ts"
Task T003: "Write unit tests for processClipboardImage in src/lib/canvas/__tests__/image-utils.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (types + image-utils)
2. Complete Phase 2: Foundational (rendering + page content detection)
3. Complete Phase 3: US1 — Paste an Image
4. Complete Phase 4: US2 — Move and Resize
5. **STOP and VALIDATE**: Paste image → move → resize → undo. Core flow works.

### Incremental Delivery

1. Setup + Foundational → Types and rendering ready
2. US1 (Paste) → Users can paste images → **MVP!**
3. US2 (Move/Resize) → Images are fully manipulable
4. US3 (Select) → Re-select after deselection
5. US4 (Delete) → Full lifecycle
6. US5 (Persistence/PDF) → Production-ready
7. Polish → Copy/paste images, edge cases, E2E tests

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Most tasks in Phases 3–6 are sequential because they modify the same 2 files (`use-selection.ts` and `canvas-editor.tsx`)
- No new npm dependencies needed — all browser-native APIs
- No database migration — JSONB schema is flexible
- Commit after each phase checkpoint
