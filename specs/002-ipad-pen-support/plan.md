# Implementation Plan: iPad Optimization & Apple Pencil Support

## Technical Context

| Aspect        | Current State                                 | Target State                                        |
| ------------- | --------------------------------------------- | --------------------------------------------------- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript | Same — no framework changes                         |
| **Editor**    | Tiptap 3.20 with StarterKit + extensions      | Add custom `drawingBlock` node extension            |
| **Sync**      | Supabase Realtime on `documents` table        | Same — drawings flow through existing JSONB content |
| **Styling**   | Tailwind 4, shadcn/ui, 24px toolbar buttons   | Add touch-responsive sizing, 44pt targets           |
| **PWA**       | None                                          | Serwist + manifest + service worker                 |
| **Offline**   | None (network-status hook exists)             | Cache API for shell + IndexedDB for documents       |
| **Drawing**   | None                                          | perfect-freehand + Canvas 2D + custom Tiptap node   |

## Dependencies (New Packages)

| Package            | Size  | Purpose                                               |
| ------------------ | ----- | ----------------------------------------------------- |
| `perfect-freehand` | ~2KB  | Pressure-sensitive stroke path generation             |
| `@serwist/next`    | ~15KB | Next.js PWA integration (service worker + precaching) |
| `serwist`          | ~30KB | Service worker runtime (caching strategies)           |
| `idb-keyval`       | ~600B | Simple IndexedDB wrapper for offline document cache   |
| `uuid`             | ~2KB  | Generate unique IDs for drawing blocks and strokes    |

---

## Phase 1: PWA Foundation

**Goal**: Make Typenote installable on iPad with proper standalone experience.

### Task 1.1: Add PWA Manifest and Icons

**Files to create**:

- `public/manifest.json`
- `public/icons/icon-192x192.png`
- `public/icons/icon-512x512.png`
- `public/icons/apple-touch-icon.png`

**Changes**:

- Create web app manifest with name, icons, standalone display, theme color
- Generate placeholder app icons (can be refined later with real design)
- See [PWA Manifest Contract](contracts/pwa-manifest.md) for full schema

### Task 1.2: Configure PWA Meta Tags

**File to modify**: `src/app/layout.tsx`

**Changes**:

- Add viewport meta tag: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`
- Add `apple-mobile-web-app-capable` meta tag
- Add `apple-mobile-web-app-status-bar-style` meta tag
- Add manifest link and apple-touch-icon link
- Add theme-color meta tag

**Why viewport-fit=cover**: On iPads with rounded corners and home indicator, this ensures the app uses the full screen area. Combined with `env(safe-area-inset-*)` CSS, content stays clear of physical obstructions.

### Task 1.3: Set Up Service Worker with Serwist

**Files to create**:

- `src/app/sw.ts` (service worker entry point)

**Files to modify**:

- `next.config.ts` (wrap with Serwist config)
- `package.json` (add `@serwist/next`, `serwist`)

**Changes**:

- Install `@serwist/next` and `serwist`
- Wrap `next.config.ts` with `withSerwist()` for automatic service worker generation
- Create `sw.ts` with precache manifest injection and cache-first strategy for static assets
- Network-first strategy for API routes and Supabase calls

### Task 1.4: Tests for PWA Setup

**Files to create**:

- `src/__tests__/pwa-manifest.test.ts`
- `e2e/pwa-install.spec.ts`

**Tests**:

- Unit: Validate manifest.json structure (required fields, icon sizes, display mode)
- E2E: Verify service worker registers successfully
- E2E: Verify manifest is linked in HTML head
- E2E: Verify viewport meta tag is present

---

## Phase 2: Touch Optimization

**Goal**: Make the existing UI comfortable for iPad touch interaction.

### Task 2.1: Add Touch-Responsive Button Sizes

**File to modify**: `src/components/ui/button.tsx`

**Changes**:

- Add a CSS layer or Tailwind custom utility for `@media (pointer: coarse)` that increases `icon-xs` to 44px and `icon-sm` to 44px
- This affects all buttons app-wide without modifying individual components
- Alternative: Add `touch:` variant to `globals.css` using Tailwind's `@custom-variant`

**Why `pointer: coarse`**: An iPad in landscape mode has a 1024px+ viewport, same as desktop. Width-based breakpoints would give it desktop-sized 24px buttons. `pointer: coarse` accurately targets touch input devices regardless of screen size.

### Task 2.2: Optimize Editor Toolbar for Touch

**File to modify**: `src/components/editor/editor-toolbar.tsx`

**Changes**:

- Increase gap between toolbar button groups for touch (using `pointer: coarse` media query)
- Ensure heading dropdown has adequate touch target size
- Make separator elements wider for visual breathing room on touch
- Consider: On narrow tablet portrait, toolbar could scroll horizontally instead of wrapping to multiple lines

### Task 2.3: Fix Hover-Dependent UI for Touch

**Files to modify**:

- `src/components/dashboard/folder-card.tsx`
- `src/components/dashboard/document-card.tsx`

**Changes**:

- Action menu buttons (delete, rename, move) are currently `opacity-0 group-hover:opacity-100`
- On touch devices, make these always visible (or show on tap/long-press)
- Strategy: `@media (pointer: coarse) { opacity: 1 }` override

### Task 2.4: Make Sidebar Collapsible on Tablet

**File to modify**: `src/app/(dashboard)/layout.tsx`

**Changes**:

- Add a toggle button (hamburger icon) visible on tablet widths
- Sidebar starts collapsed on `md` (768px) breakpoint, expanded on `lg` (1024px+)
- Collapsed state: sidebar hidden, toggle button shows in main area header
- Expanded state: sidebar overlays or pushes content (overlay preferred to maximize editor space)
- Add safe-area-inset padding for iPad notch/home indicator

### Task 2.5: Tests for Touch Optimization

**Files to create**:

- `e2e/touch-optimization.spec.ts`

**Tests**:

- E2E: Verify toolbar buttons have minimum 44px dimensions on touch viewport
- E2E: Verify card action menus are visible without hover
- E2E: Verify sidebar can be toggled on tablet viewport
- E2E: Verify no horizontal scrolling occurs on 768px viewport

---

## Phase 3: Apple Pencil Drawing

**Goal**: Add inline drawing blocks to the editor with pressure-sensitive Apple Pencil support.

### Task 3.1: Create Drawing Canvas Component

**Files to create**:

- `src/components/drawing/drawing-canvas.tsx`
- `src/components/drawing/drawing-toolbar.tsx`
- `src/lib/drawing/stroke-renderer.ts`
- `src/lib/drawing/types.ts`

**Changes**:

- `types.ts`: TypeScript interfaces for Stroke, Point, DrawingBlockAttrs, DrawingTool
- `stroke-renderer.ts`: Uses `perfect-freehand` to convert stroke points into Path2D outlines, renders them on Canvas 2D context
- `drawing-canvas.tsx`: React component that:
  - Renders an HTML5 Canvas element
  - Listens for pointer events (pointerdown, pointermove, pointerup)
  - Detects `pointerType === "pen"` for Apple Pencil (also supports mouse/touch)
  - Captures pressure from `event.pressure`
  - Renders strokes in real-time using `requestAnimationFrame`
  - Calls `onStrokesChange(strokes)` callback when a stroke completes
  - Sets `touch-action: none` to prevent browser scroll/zoom during drawing
- `drawing-toolbar.tsx`: Minimal toolbar with:
  - Pen tool (active by default)
  - Eraser tool
  - Color picker: black, blue, red (three button toggles)
  - Stroke width: thin (1px), medium (2px), thick (4px)
  - Clear all button (with confirmation)

### Task 3.2: Create Tiptap Drawing Block Extension

**Files to create**:

- `src/lib/editor/drawing-block-extension.ts`
- `src/components/editor/drawing-block-view.tsx`

**Changes**:

- `drawing-block-extension.ts`: Tiptap Node extension definition
  - Name: `drawingBlock`, group: `block`, atom: true
  - Attrs: id, width, height, background, strokes (with defaults)
  - `addCommands()`: `insertDrawingBlock`, `updateDrawingStrokes`
  - `addNodeView()`: Returns `ReactNodeViewRenderer(DrawingBlockView)`
- `drawing-block-view.tsx`: React NodeView wrapper
  - Renders `<NodeViewWrapper>` with `<DrawingCanvas>` inside
  - Passes `node.attrs.strokes` to canvas for rendering
  - On stroke change: calls `updateAttributes({ strokes: newStrokes })`
  - Shows delete button (X) when node is selected
  - Shows resize handles or fixed-size canvas
  - See [Tiptap Drawing Node Contract](contracts/tiptap-drawing-node.md)

### Task 3.3: Integrate Drawing Block into Editor

**Files to modify**:

- `src/components/editor/tiptap-editor.tsx` (add extension to Tiptap config)
- `src/components/editor/editor-toolbar.tsx` (add "Insert Drawing" button)

**Changes**:

- Register `DrawingBlockExtension` in the `useEditor` extensions array
- Add a "Drawing" button (pencil icon) to the editor toolbar's insert section
- Button click: `editor.chain().focus().insertDrawingBlock({}).run()`
- Install `perfect-freehand` and `uuid` packages

### Task 3.4: Add Mode Toggle (Text/Draw)

**File to modify**: `src/components/editor/tiptap-editor.tsx`

**Changes**:

- Add `editorMode` state: `"text" | "draw"` (default: "text")
- Toggle button in editor header area (pen icon with label)
- In Draw Mode:
  - Drawing blocks become editable (pointer events enabled on canvas)
  - Text blocks are still visible but not focused
  - Global pen events on document could auto-insert drawing blocks (stretch goal)
- In Text Mode:
  - Drawing blocks render as static images (pointer events disabled on canvas)
  - Text editing works normally
- Pass `editorMode` as prop/context to drawing block views

### Task 3.5: Tests for Drawing

**Files to create**:

- `src/__tests__/stroke-renderer.test.ts`
- `src/__tests__/drawing-block-extension.test.ts`
- `e2e/drawing.spec.ts`

**Tests**:

- Unit: `stroke-renderer` correctly converts points + pressure into Path2D paths
- Unit: Drawing block extension serializes/deserializes correctly (JSON round-trip)
- Unit: Undo/redo restores previous stroke state
- E2E: Insert drawing block via toolbar button
- E2E: Draw a stroke on canvas (simulate pointer events with pressure)
- E2E: Verify drawing persists after page reload
- E2E: Verify drawing block appears between text blocks
- E2E: Delete drawing block via selection + backspace

---

## Phase 4: Drawing Sync & Persistence

**Goal**: Ensure drawings sync across devices and persist correctly.

### Task 4.1: Verify Drawing Data in Auto-Save Flow

**Files to verify/modify**:

- `src/hooks/use-auto-save.ts` (no changes expected — already saves `editor.getJSON()`)
- `src/hooks/use-realtime-sync.ts` (verify drawings in payload)
- `src/lib/actions/documents.ts` (verify JSONB handles drawing data)

**Changes**:

- Primarily verification: drawing block attrs (including strokes) are included in `editor.getJSON()` output
- The existing auto-save and realtime sync should work without modification because:
  - Auto-save calls `editor.getJSON()` which includes all node attrs
  - Realtime sync calls `editor.commands.setContent()` which restores all node attrs
  - JSONB column has no schema restrictions
- May need to adjust `skipNextUpdateRef` logic if drawing updates fire too frequently

### Task 4.2: Optimize Drawing Payload for Sync

**Files to create**:

- `src/lib/drawing/stroke-compressor.ts`

**Changes**:

- Implement point reduction: for completed strokes, reduce point count using Ramer-Douglas-Peucker algorithm while preserving visual fidelity
- Round coordinate values to 1 decimal place (sub-pixel precision is unnecessary)
- Run compression on stroke completion (pointerup), not during drawing
- Goal: reduce average stroke JSON size by ~30-50%

### Task 4.3: Tests for Drawing Sync

**Files to create**:

- `src/__tests__/stroke-compressor.test.ts`
- `e2e/drawing-sync.spec.ts`

**Tests**:

- Unit: Point reduction preserves stroke shape within tolerance
- Unit: Compressed strokes are smaller than originals
- E2E: Draw on one tab, verify drawing appears on second tab
- E2E: Drawing data persists after auto-save + page reload
- E2E: Editing lock triggers when drawing is modified remotely

---

## Phase 5: Offline Support

**Goal**: Enable offline document access and editing with sync-on-reconnect.

### Task 5.1: Implement Document Cache with IndexedDB

**Files to create**:

- `src/lib/offline/document-cache.ts`
- `src/lib/offline/sync-queue.ts`

**Changes**:

- `document-cache.ts`:
  - Uses `idb-keyval` for simple key-value storage in IndexedDB
  - `cacheDocument(doc)`: Store document content, title, updated_at
  - `getCachedDocument(id)`: Retrieve cached document
  - `listCachedDocuments()`: List all cached documents for offline dashboard
  - `removeCachedDocument(id)`: Clean up stale cache entries
  - Cache on every successful save (piggyback on auto-save)
  - Limit: Keep most recent 50 documents (LRU eviction)

- `sync-queue.ts`:
  - Queue offline edits as `{ documentId, field, value, timestamp }`
  - On reconnect: process queue in order, call existing server actions
  - Handle conflicts: if remote `updated_at` > queued edit timestamp, warn user
  - Clear queue entries after successful sync

### Task 5.2: Integrate Offline Cache with Editor

**Files to modify**:

- `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`
- `src/hooks/use-document-sync.ts`
- `src/hooks/use-auto-save.ts`

**Changes**:

- Document page: Try server fetch first, fall back to cached version if offline
- Auto-save: On successful save, update the document cache. On save failure (offline), queue the edit
- Document sync: On reconnect event, flush the sync queue before re-subscribing to realtime

### Task 5.3: Add Online/Offline Status Indicator

**Files to modify**:

- `src/hooks/use-network-status.ts` (already exists — enhance if needed)
- `src/components/editor/tiptap-editor.tsx`
- `src/app/(dashboard)/layout.tsx`

**Changes**:

- Show a banner or badge when offline: "You're offline — changes will sync when reconnected"
- Show in editor header alongside existing save/connection status
- Show in dashboard layout for global awareness
- Use the existing `useNetworkStatus` hook (already tracks online/offline)

### Task 5.4: Tests for Offline Support

**Files to create**:

- `src/__tests__/document-cache.test.ts`
- `src/__tests__/sync-queue.test.ts`
- `e2e/offline.spec.ts`

**Tests**:

- Unit: Document cache stores and retrieves correctly
- Unit: Sync queue orders edits by timestamp
- Unit: Cache evicts LRU documents when over 50
- E2E: Document loads from cache when network is disconnected
- E2E: Edits made offline sync when network returns
- E2E: Offline indicator appears when network drops

---

## Implementation Order & Dependencies

```
Phase 1: PWA Foundation
  ├── 1.1: Manifest + Icons (no deps)
  ├── 1.2: Meta Tags (no deps)
  ├── 1.3: Service Worker (depends on 1.1)
  └── 1.4: Tests (depends on 1.1-1.3)

Phase 2: Touch Optimization
  ├── 2.1: Button Sizes (no deps)
  ├── 2.2: Toolbar (depends on 2.1)
  ├── 2.3: Hover Fix (no deps)
  ├── 2.4: Sidebar (no deps)
  └── 2.5: Tests (depends on 2.1-2.4)

Phase 3: Apple Pencil Drawing
  ├── 3.1: Canvas Component (no deps)
  ├── 3.2: Tiptap Extension (depends on 3.1)
  ├── 3.3: Editor Integration (depends on 3.2)
  ├── 3.4: Mode Toggle (depends on 3.3)
  └── 3.5: Tests (depends on 3.1-3.4)

Phase 4: Drawing Sync
  ├── 4.1: Verify Auto-Save (depends on Phase 3)
  ├── 4.2: Payload Optimization (depends on 4.1)
  └── 4.3: Sync Tests (depends on 4.1-4.2)

Phase 5: Offline Support
  ├── 5.1: Document Cache (depends on Phase 1.3)
  ├── 5.2: Editor Integration (depends on 5.1)
  ├── 5.3: Status Indicator (no deps)
  └── 5.4: Tests (depends on 5.1-5.3)
```

**Recommended build order**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phases 1 and 2 are independent and could be parallelized, but sequentially they build a testable PWA foundation before adding drawing complexity.

---

## Key Architectural Decisions

1. **No database schema changes**: Drawing data lives in the existing `documents.content` JSONB column as Tiptap node attributes. This means zero migration overhead and drawing sync works automatically through the existing realtime pipeline.

2. **Tiptap custom node (not overlay)**: Drawing blocks are document nodes, not floating overlays. This means they participate in document flow, undo/redo history, and JSON serialization — all free from Tiptap/ProseMirror.

3. **Canvas 2D over SVG**: For real-time drawing with hundreds of strokes, Canvas 2D outperforms SVG (no DOM nodes per stroke). `perfect-freehand` gives us the pressure-to-path math in 2KB.

4. **`pointer: coarse` over breakpoints**: Touch devices get larger buttons regardless of screen width. An iPad in landscape mode (1024px+) still gets 44pt targets.

5. **IndexedDB for offline (not Cache API)**: Document content is structured data — IndexedDB handles it naturally. Cache API is used only for static assets via service worker.

---

## Files Created/Modified Summary

### New Files (~15)

- `public/manifest.json`
- `public/icons/icon-192x192.png`, `icon-512x512.png`, `apple-touch-icon.png`
- `src/app/sw.ts`
- `src/lib/drawing/types.ts`
- `src/lib/drawing/stroke-renderer.ts`
- `src/lib/drawing/stroke-compressor.ts`
- `src/lib/editor/drawing-block-extension.ts`
- `src/components/drawing/drawing-canvas.tsx`
- `src/components/drawing/drawing-toolbar.tsx`
- `src/components/editor/drawing-block-view.tsx`
- `src/lib/offline/document-cache.ts`
- `src/lib/offline/sync-queue.ts`
- Test files (6+)

### Modified Files (~10)

- `package.json` (new dependencies)
- `next.config.ts` (Serwist wrapper)
- `src/app/layout.tsx` (PWA meta tags)
- `src/app/globals.css` (touch utilities, safe area insets)
- `src/app/(dashboard)/layout.tsx` (collapsible sidebar)
- `src/components/ui/button.tsx` (touch-responsive sizes)
- `src/components/editor/tiptap-editor.tsx` (drawing extension, mode toggle)
- `src/components/editor/editor-toolbar.tsx` (touch sizes, drawing button)
- `src/components/dashboard/folder-card.tsx` (hover fix)
- `src/components/dashboard/document-card.tsx` (hover fix)
- `src/hooks/use-auto-save.ts` (offline cache integration)
- `src/hooks/use-document-sync.ts` (offline queue integration)
