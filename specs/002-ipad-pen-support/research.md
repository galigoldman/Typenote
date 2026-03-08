# Research: Infinite Canvas with Moveable Elements & iPad Drawing

**Feature Branch**: `002-ipad-pen-support`
**Date**: 2026-03-08

## Decision 1: Canvas Rendering Architecture

**Decision**: Custom Hybrid — CSS transforms for DOM layer + HTML5 Canvas overlay for drawing

**Rationale**:
- Text blocks MUST be real DOM elements (they contain full TipTap rich-text editors). This rules out canvas-rendering libraries (Konva, Fabric.js, PixiJS, Excalidraw) since they render text as canvas pixels, making TipTap embedding impossible without fragile DOM overlay hacks.
- tldraw SDK is the only library that natively supports both DOM elements (via `HTMLContainer`) and freeform drawing. However, tldraw SDK 4.0 requires a **$6,000/year commercial license**, which is not justified for this project.
- The Custom Hybrid approach provides full control, zero licensing cost, and cleanly separates concerns:
  - **DOM layer**: `<div>` with `transform: translate3d(x, y, 0) scale(zoom)` containing absolutely-positioned TipTap editor blocks
  - **Canvas layer**: `<canvas>` at full viewport size, strokes drawn with `ctx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY)` to match the DOM transform
  - **Event routing**: Pointer events check `pointerType` — `'pen'` routes to drawing, `'touch'` routes to gesture handler, `'mouse'` routes based on selected tool

**Alternatives considered**:
- **tldraw**: Best DX, built by the author of perfect-freehand, but $6K/year license is prohibitive
- **Canvas libraries (Konva/Fabric/PixiJS)**: Cannot host real DOM elements natively
- **Excalidraw**: Canvas-rendered text — incompatible with persistent TipTap editors
- **React Flow**: Designed for node-graph UIs, not freeform drawing canvases

---

## Decision 2: Global Undo/Redo Architecture

**Decision**: Command Pattern with unified history manager

**Rationale**:
- In the canvas model, each text block is an independent TipTap editor instance. A single global undo stack must cover text edits, strokes, and canvas operations (move, resize, create, delete).
- Disable TipTap's built-in history: `StarterKit.configure({ undoRedo: false })`
- Intercept ProseMirror transactions via `dispatchTransaction` hook, wrap as `TextEditCommand` objects
- Drawing strokes → `StrokeCommand`, canvas operations → `CanvasCommand`
- Single `HistoryManager` class with undo/redo stacks
- Grouping: time-based (500ms) + adjacency-based, mimicking prosemirror-history

**Alternatives considered**:
- **Hybrid (per-editor history + global stack)**: Breaks on delete/recreate and redo desynchronization
- **Snapshot pattern**: Expensive in memory, causes DOM flicker, loses cursor position
- **prosemirror-history as-is**: Only covers text within a single editor

---

## Decision 3: Data Storage & Sync Strategy

**Decision**: Extend `content` JSONB with canvas format + notification-then-fetch realtime sync

**Critical finding**: Supabase Realtime `postgres_changes` has ~8KB payload limit (PostgreSQL NOTIFY). Fields exceeding 64 bytes are silently truncated. The current sync likely already drops the `content` field for non-trivial documents. Must fix regardless of canvas.

**Storage**:
- Use existing `content` JSONB with new top-level structure: `{ format: "canvas", version: 1, ... }`
- Element-keyed map (not array) for O(1) lookup and targeted `jsonb_set` updates
- Old documents without `format` field continue to work as linear TipTap docs
- No schema migration needed for content

**Sync**:
- Switch to notification + fetch pattern:
  1. Listen for `postgres_changes` — use `updated_at` as change signal (always < 64 bytes)
  2. Fetch full document via Supabase REST
  3. Diff and apply changes locally

**Alternatives considered**:
- Separate `canvas_elements` table — granular sync but requires migration, new RLS policies
- Supabase Broadcast for live sync — most performant but most complex, overkill for now

---

## Decision 4: Canvas Background Implementation

**Decision**: Per-document `background` field in canvas JSONB + `default_background` column on `folders` table

**Rationale**:
- Four backgrounds (blank, grid, dotted, lined) — extend existing `canvas_type` to include `'dotted'`
- Backgrounds rendered via CSS repeating gradients on the canvas container
- Folder default requires new column: `folders.default_background TEXT DEFAULT 'blank'`

---

## Decision 5: Multi-TipTap Editor Management

**Decision**: Each text block contains an independent TipTap editor, managed by an EditorManager

**Rationale**:
- An `EditorManager` maintains a registry of active editors keyed by element ID
- Editors created lazily when a text block enters the viewport, destroyed when offscreen (culling)
- The formatting toolbar connects to whichever editor is currently focused
- Text content extracted via `editor.getJSON()` and stored in the element's `content` field

---

## Decision 6: Gesture & Input Handling

**Decision**: Use `@use-gesture/react` for pan/zoom gestures + raw Pointer Events for drawing

**Rationale**:
- `@use-gesture/react` handles pinch-zoom, drag-to-pan, and wheel-to-zoom with good touch support
- Raw Pointer Events for drawing: `pointerdown/move/up` with `pointerType === 'pen'` for Apple Pencil detection
- iPad Safari: `PointerEvent.pressure` works (0-1), `pointerType === 'pen'` correctly identifies Apple Pencil
- Safari lacks `getCoalescedEvents()` — mitigate with interpolation (~60Hz instead of ~240Hz)

---

## Key Libraries

| Library | Purpose | Installed? |
|---------|---------|-----------|
| `perfect-freehand` | Stroke smoothing for Apple Pencil | Yes |
| `@use-gesture/react` | Touch gesture handling (pan, pinch-zoom) | **Install** |
| `uuid` | Element IDs | Yes |
| `serwist` / `@serwist/next` | PWA service worker | Yes |
| `@tiptap/*` | Rich-text editing in text blocks | Yes |
| `idb-keyval` | IndexedDB for offline cache | Yes |
