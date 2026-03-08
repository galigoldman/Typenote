# Tasks: iPad Optimization & Apple Pencil Support

**Feature**: Transform Typenote into an iPad-optimized PWA with Apple Pencil drawing support
**Branch**: `002-ipad-pen-support`
**Total Tasks**: 38
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Phase 1: Setup

**Goal**: Install dependencies and create shared foundation files.

- [x] T001 Install PWA dependencies (`@serwist/next`, `serwist`) in `package.json`
- [x] T002 [P] Install drawing dependencies (`perfect-freehand`, `uuid`, `@types/uuid`) in `package.json`
- [x] T003 [P] Install offline dependencies (`idb-keyval`) in `package.json`
- [x] T004 Create drawing type definitions (Stroke, Point, DrawingBlockAttrs, DrawingTool) in `src/lib/drawing/types.ts`

---

## Phase 2: Foundational

**Goal**: Add touch-responsive CSS infrastructure used by multiple user stories.

- [x] T005 Add `@custom-variant` for `pointer: coarse` touch detection in `src/app/globals.css` — enables `touch:` Tailwind variant for conditional touch-device styling
- [x] T006 Add safe-area-inset CSS custom properties and utility classes for iPad notch/home indicator in `src/app/globals.css`

---

## Phase 3: US1 — PWA Installation

**Goal**: Make Typenote installable on iPad home screen as a standalone app.

**Story**: As a student, I want to install Typenote on my iPad home screen, so that it feels like a native app.

**Independent Test Criteria**: App can be added to home screen, launches in standalone mode, shows correct icon and name.

- [x] T007 [US1] Create PWA web app manifest with app name, icons, standalone display, and theme color at `public/manifest.json` (per contract in `contracts/pwa-manifest.md`)
- [x] T008 [P] [US1] Generate placeholder app icons (192x192, 512x512, apple-touch-icon) at `public/icons/`
- [x] T009 [US1] Add PWA meta tags (viewport, apple-mobile-web-app-capable, apple-mobile-web-app-status-bar-style, theme-color, manifest link, apple-touch-icon) to `src/app/layout.tsx` via Next.js Metadata API
- [x] T010 [US1] Create Serwist service worker entry point with precache manifest and cache-first strategy for static assets at `src/app/sw.ts`
- [x] T011 [US1] Wrap Next.js config with `withSerwist()` for automatic service worker generation in `next.config.ts`
- [x] T012 [US1] Write unit test validating manifest.json structure (required fields, icon sizes, display mode) in `src/__tests__/pwa-manifest.test.ts`
- [x] T013 [US1] Write E2E test verifying service worker registration, manifest link in HTML head, and viewport meta tag in `e2e/pwa-install.spec.ts`

---

## Phase 4: US2 — Touch-Optimized Interface

**Goal**: Make all UI elements comfortable for iPad touch interaction with 44pt minimum targets.

**Story**: As a student using an iPad, I want the interface comfortable for touch interaction, so I can navigate without a keyboard or mouse.

**Independent Test Criteria**: All interactive elements meet 44x44pt minimum on touch devices, toolbar is usable via touch, sidebar is collapsible, card actions visible without hover.

- [x] T014 [US2] Add touch-responsive size overrides to button variants — increase `icon-xs` (24px) and `icon-sm` (32px) to 44px on `pointer: coarse` devices in `src/components/ui/button.tsx`
- [x] T015 [US2] Optimize editor toolbar for touch — increase gap between button groups, ensure heading dropdown has 44pt target, make toolbar horizontally scrollable on narrow widths in `src/components/editor/editor-toolbar.tsx`
- [x] T016 [P] [US2] Fix hover-dependent action menus on folder cards — make action buttons always visible on touch devices via `pointer: coarse` override in `src/components/dashboard/folder-card.tsx`
- [x] T017 [P] [US2] Fix hover-dependent action menus on document cards — same `pointer: coarse` override for always-visible actions in `src/components/dashboard/document-card.tsx`
- [x] T018 [US2] Make sidebar collapsible — add toggle button visible on tablet widths, sidebar starts collapsed on `md` breakpoint (768px), overlay mode on expand in `src/app/(dashboard)/layout.tsx`
- [x] T019 [US2] Write E2E tests verifying 44px minimum button dimensions on touch viewport, card action visibility without hover, sidebar toggle, and no horizontal scrolling at 768px in `e2e/touch-optimization.spec.ts`

---

## Phase 5: US3 — Drawing with Apple Pencil

**Goal**: Add inline drawing blocks to the editor with pressure-sensitive Apple Pencil strokes.

**Story**: As a student with an Apple Pencil, I want to draw diagrams and annotations directly in my notes.

**Independent Test Criteria**: Drawing blocks can be inserted inline, Apple Pencil strokes render with pressure sensitivity, pen/eraser/color tools work, drawings persist on save and reload.

- [x] T020 [US3] Create stroke renderer that uses `perfect-freehand` to convert pressure-sensitive points into Canvas 2D Path2D outlines in `src/lib/drawing/stroke-renderer.ts`
- [x] T021 [US3] Create drawing canvas React component — captures pointer events (pen/touch/mouse), reads pressure, renders strokes in real-time via requestAnimationFrame, sets `touch-action: none` in `src/components/drawing/drawing-canvas.tsx`
- [x] T022 [US3] Create drawing toolbar component — pen tool, eraser tool, 3 color buttons (black/blue/red), 3 stroke widths (thin/medium/thick), clear all with confirmation in `src/components/drawing/drawing-toolbar.tsx`
- [x] T023 [US3] Create Tiptap `drawingBlock` Node extension — block group, atom, attrs (id/width/height/background/strokes), commands (insertDrawingBlock, updateDrawingStrokes) in `src/lib/editor/drawing-block-extension.ts` (per contract in `contracts/tiptap-drawing-node.md`)
- [x] T024 [US3] Create drawing block NodeView React wrapper — renders DrawingCanvas inside NodeViewWrapper, passes strokes from node attrs, calls updateAttributes on stroke change, shows delete button when selected in `src/components/editor/drawing-block-view.tsx`
- [x] T025 [US3] Register DrawingBlockExtension in editor's useEditor extensions array in `src/components/editor/tiptap-editor.tsx`
- [x] T026 [US3] Add "Insert Drawing" button (pencil icon) to the editor toolbar insert section that calls `insertDrawingBlock` command in `src/components/editor/editor-toolbar.tsx`
- [x] T027 [US3] Write unit tests for stroke renderer — verify points + pressure convert to valid Path2D paths in `src/__tests__/stroke-renderer.test.ts`
- [x] T028 [US3] Write unit test for drawing block extension — verify JSON serialization round-trip (getJSON/setContent) preserves all stroke data in `src/__tests__/drawing-block-extension.test.ts`
- [x] T029 [US3] Write E2E tests — insert drawing block via toolbar, simulate pointer events with pressure on canvas, verify drawing persists after reload, delete drawing block in `e2e/drawing.spec.ts`

---

## Phase 6: US4 — Switching Between Typing and Drawing

**Goal**: Add a text/draw mode toggle so users can seamlessly switch between typing and drawing.

**Story**: As a student, I want to seamlessly switch between typing text and drawing, so I can mix typed notes with hand-drawn content.

**Independent Test Criteria**: Toggle switches between text and draw modes, drawing blocks respond to mode (editable in draw, static in text), mode indicator always visible, switching doesn't corrupt content.

- [x] T030 [US4] Add `editorMode` state ("text" | "draw") and a toggle button in the editor header area — pen icon that visually indicates the active mode in `src/components/editor/tiptap-editor.tsx`
- [x] T031 [US4] Connect editor mode to drawing block views — in Draw Mode pointer events are enabled on canvas, in Text Mode canvas renders as static (pointer-events: none) in `src/components/editor/drawing-block-view.tsx`
- [x] T032 [US4] Write E2E tests — verify mode toggle switches states, drawing works only in draw mode, text editing works only in text mode, content preserved across mode switches in `e2e/drawing.spec.ts` (extend existing)

---

## Phase 7: US5 — Cross-Device Real-Time Sync with Drawings

**Goal**: Ensure drawing data syncs between devices through existing realtime infrastructure.

**Story**: As a student, I want my drawings to sync in real-time between iPad and desktop.

**Independent Test Criteria**: Drawing created on one device appears on another within 3 seconds, editing lock works for drawing changes, no data loss on device switch.

- [x] T033 [US5] Verify and adjust auto-save flow to handle drawing data — confirm `editor.getJSON()` includes drawingBlock attrs, confirm `setContent()` restores drawings, tune `skipNextUpdateRef` if drawing updates fire too frequently in `src/hooks/use-realtime-sync.ts`
- [x] T034 [US5] Create stroke compressor — Ramer-Douglas-Peucker point reduction + coordinate rounding (1 decimal place) on stroke completion for 30-50% payload size reduction in `src/lib/drawing/stroke-compressor.ts`
- [x] T035 [US5] Write unit tests for stroke compressor — verify point reduction preserves shape, compressed strokes are smaller, round-trip fidelity in `src/__tests__/stroke-compressor.test.ts`
- [x] T036 [US5] Write E2E tests — draw on one tab and verify drawing appears on second tab, verify editing lock triggers on remote drawing change in `e2e/drawing-sync.spec.ts`

---

## Phase 8: US6 — Offline Access on iPad

**Goal**: Enable offline document access, editing, and sync-on-reconnect.

**Story**: As a student, I want Typenote to work when my iPad loses internet connection.

**Independent Test Criteria**: Previously opened documents available offline, edits possible without connection, changes sync on reconnect, clear online/offline indicator visible.

- [x] T037 [US6] Create document cache module — uses `idb-keyval` for IndexedDB storage, cacheDocument/getCachedDocument/listCachedDocuments/removeCachedDocument functions, 50-document LRU eviction in `src/lib/offline/document-cache.ts`
- [x] T038 [US6] Create offline sync queue — queues edits as {documentId, field, value, timestamp}, processes queue on reconnect via existing server actions, handles timestamp conflicts in `src/lib/offline/sync-queue.ts`
- [x] T039 [US6] Integrate document cache with editor — cache on successful save in `src/hooks/use-auto-save.ts`, queue edits on save failure in `src/hooks/use-document-sync.ts`, fall back to cached document when offline in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`
- [x] T040 [US6] Add online/offline status indicator — show banner when offline in editor header (alongside save/connection status) and dashboard layout, use existing `useNetworkStatus` hook in `src/components/editor/tiptap-editor.tsx` and `src/app/(dashboard)/layout.tsx`
- [x] T041 [US6] Write unit tests for document cache (store/retrieve/LRU eviction) and sync queue (ordering/conflict detection) in `src/__tests__/document-cache.test.ts` and `src/__tests__/sync-queue.test.ts`
- [x] T042 [US6] Write E2E tests — document loads from cache when offline, edits sync on reconnect, offline indicator appears on network drop in `e2e/offline.spec.ts`

---

## Phase 9: Polish & Cross-Cutting Concerns

**Goal**: Final quality checks and cross-cutting optimizations.

- [x] T043 Add safe-area-inset padding to dashboard layout and editor for iPad home indicator and rounded corners in `src/app/(dashboard)/layout.tsx` and `src/components/editor/tiptap-editor.tsx`
- [x] T044 Run Lighthouse PWA audit and fix any issues to achieve 90+ score — verify manifest, service worker, HTTPS, viewport, icons all pass

---

## Dependencies

```
Phase 1: Setup (T001-T004)
  └── No external dependencies

Phase 2: Foundational (T005-T006)
  └── No dependencies on Phase 1

Phase 3: US1 - PWA Install (T007-T013)
  ├── T007 → T010 (manifest before service worker)
  ├── T010 → T011 (sw.ts before next.config.ts wrapping)
  └── T012-T013 depend on T007-T011

Phase 4: US2 - Touch (T014-T019)
  ├── Depends on T005 (touch CSS variant)
  ├── T015 depends on T014 (button sizes before toolbar)
  └── T016, T017 are parallel (different files)

Phase 5: US3 - Drawing (T020-T029)
  ├── Depends on T004 (drawing types)
  ├── T020 → T021 (renderer before canvas)
  ├── T022 parallel with T020-T021 (toolbar is independent)
  ├── T023 → T024 (extension before node view)
  ├── T024 depends on T021 (canvas component)
  ├── T025-T026 depend on T023-T024
  └── T027-T029 depend on T020-T026

Phase 6: US4 - Mode Toggle (T030-T032)
  └── Depends on Phase 5 (US3 complete)

Phase 7: US5 - Drawing Sync (T033-T036)
  └── Depends on Phase 5 (US3 complete)

Phase 8: US6 - Offline (T037-T042)
  ├── T037-T038 depend on T003 (idb-keyval installed)
  ├── T039 depends on T037-T038
  ├── T040 is parallel (status indicator is independent)
  └── T041-T042 depend on T037-T040

Phase 9: Polish (T043-T044)
  └── Depends on all previous phases
```

## Parallel Execution Opportunities

### Within Phase 1 (Setup):

- T001, T002, T003 can all run in parallel (independent package installs)

### Within Phase 3 (US1):

- T007 and T008 can run in parallel (manifest + icons are independent files)

### Within Phase 4 (US2):

- T016 and T017 can run in parallel (folder-card.tsx and document-card.tsx are different files)
- T018 is independent of T016-T017

### Within Phase 5 (US3):

- T020 and T022 can run in parallel (stroke renderer and drawing toolbar are independent)
- T027 and T028 can run in parallel (different test files)

### Within Phase 7 (US5):

- T033 and T034 can run in parallel (sync verification and compressor are independent)

### Within Phase 8 (US6):

- T037 and T038 can run in parallel (document cache and sync queue are independent files)
- T040 is independent of T037-T039

### Cross-Phase:

- Phase 3 (US1) and Phase 4 (US2) can run in parallel (no dependencies between them)
- Phase 6 (US4) and Phase 7 (US5) can run in parallel after Phase 5 (US3) completes

## Implementation Strategy

### MVP Scope (Suggested)

**US1 (PWA Installation) + US3 (Drawing)** — This gives the core value proposition: install on iPad and draw with Apple Pencil. Touch optimization (US2) and offline (US6) are quality-of-life improvements that can follow.

### Incremental Delivery

1. **Increment 1**: Phases 1-3 (Setup + Foundation + PWA) — installable app
2. **Increment 2**: Phase 4 (Touch) — comfortable to use on iPad
3. **Increment 3**: Phases 5-6 (Drawing + Mode Toggle) — core drawing feature
4. **Increment 4**: Phase 7 (Drawing Sync) — drawings sync across devices
5. **Increment 5**: Phases 8-9 (Offline + Polish) — full offline experience

Each increment is independently deployable and testable.
