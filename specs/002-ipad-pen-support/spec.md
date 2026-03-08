# Feature Specification: Infinite Canvas with Moveable Elements & iPad Drawing

**Feature Branch**: `002-ipad-pen-support`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "We want it to be kind of like GoodNotes. It should be a canvas, everything can move. The texts should be like Google Docs, but everything can be moveable. It saves and syncs iPad drawings."

## Clarifications

### Session 2026-03-08

- Q: Can users multi-select elements and move/delete them as a group? → A: Yes, free selection (lasso/shift-click) to move/delete together, but no persistent grouping.
- Q: Is undo/redo global or per-element? → A: Global — one undo/redo history stack for all canvas actions. Must feel reliable and responsive.
- Q: What canvas background options, and how are they configured? → A: Four options (blank, grid, dotted, lined), set per-document, with an inheritable default per folder.
- Q: Can users copy/paste/duplicate canvas elements? → A: Yes, full copy/paste/duplicate within the same document and across documents.
- Q: Should there be a hard cap on elements per document? → A: No hard cap. Performance floor target instead: canvas must render smoothly (60fps) with at least 100 elements and 1,000 strokes visible in the viewport.

## Overview

Transform Typenote from a linear text editor into a freeform infinite canvas where every element — text blocks, drawings, images — can be freely positioned and moved. Text blocks behave like rich-text Google Docs editors (full formatting, inline math, etc.) but live as moveable objects on the canvas. Users can draw freely on the canvas with Apple Pencil on iPad, and all content (positions, text, drawings) saves and syncs across devices in real-time.

## Problem Statement

STEM students need a flexible workspace that combines the rich text editing of Google Docs with the freeform spatial organization of GoodNotes. The current linear document editor forces content into a single vertical flow, making it impossible to spatially arrange related concepts, draw diagrams next to formulas, or annotate freely. Students need a canvas where they can place text blocks anywhere, draw alongside them, and have everything sync between iPad and desktop.

## User Scenarios & Testing

### User Story 1 — Freeform Canvas Navigation (Priority: P1)

A student opens a document and sees an infinite canvas. They can pan around by dragging with touch/mouse and zoom in/out with pinch gestures or scroll wheel. The canvas feels smooth and responsive, like navigating a whiteboard.

**Why this priority**: The canvas is the foundation — nothing else works without it.

**Independent Test**: Open a document, verify the canvas renders, pan in all directions, zoom in/out. Delivers the core spatial workspace.

**Acceptance Scenarios**:

1. **Given** a user opens a document, **When** the document loads, **Then** an infinite canvas is displayed instead of a linear page
2. **Given** a user is on the canvas, **When** they drag with two fingers (touch) or middle-click-drag (mouse), **Then** the viewport pans smoothly across the canvas
3. **Given** a user is on the canvas, **When** they pinch (touch) or scroll wheel (mouse), **Then** the canvas zooms in/out centered on the gesture point
4. **Given** a user zooms or pans, **When** they close and reopen the document, **Then** the viewport restores to the last position and zoom level

---

### User Story 2 — Moveable Rich-Text Blocks (Priority: P1)

A student creates a text block anywhere on the canvas by double-clicking/tapping an empty area. The text block is a full rich-text editor (like Google Docs — bold, italic, headings, lists, inline math). The student can drag the text block to reposition it, resize it, and its position persists.

**Why this priority**: Text blocks are the primary content type — the app must support rich text editing in moveable containers.

**Independent Test**: Create a text block, type formatted text, drag it to a new position, reload — verify content and position persist.

**Acceptance Scenarios**:

1. **Given** a user is on the canvas, **When** they double-click/tap an empty area, **Then** a new text block is created at that position with a cursor ready for typing
2. **Given** a text block exists, **When** the user clicks/taps inside it, **Then** the block enters edit mode with full rich-text editing (bold, italic, headings, lists, inline math)
3. **Given** a text block exists, **When** the user drags it by its border/handle, **Then** it moves freely on the canvas and snaps position on release
4. **Given** a text block exists, **When** the user resizes it by dragging an edge/corner, **Then** the block resizes and text reflows within the new dimensions
5. **Given** a text block has been moved/resized, **When** the document is saved and reopened, **Then** the text block appears at its saved position and size with all content intact

---

### User Story 3 — Apple Pencil Drawing on Canvas (Priority: P1)

A student picks up their Apple Pencil and draws directly on the canvas — diagrams, arrows, annotations, sketches. The strokes appear in real-time with pressure sensitivity. Drawings are freeform on the canvas, not confined to a box.

**Why this priority**: Freeform drawing is the core differentiator that makes this a GoodNotes-like experience rather than just a text editor.

**Independent Test**: On iPad, draw strokes with Apple Pencil on the canvas, verify they render with pressure sensitivity and persist after save.

**Acceptance Scenarios**:

1. **Given** a user has an Apple Pencil, **When** they touch the canvas with the pencil, **Then** ink strokes appear in real-time with minimal latency
2. **Given** a user is drawing, **When** they vary pencil pressure, **Then** stroke width changes proportionally for natural-feeling handwriting
3. **Given** a user is drawing, **When** they select a different pen color or width from the drawing toolbar, **Then** subsequent strokes use the new settings
4. **Given** a user has drawn strokes, **When** they use the eraser tool and touch a stroke, **Then** the stroke (or stroke segment) is removed
5. **Given** a user has drawn on the canvas, **When** the document is saved and reopened, **Then** all drawings appear at their exact positions

---

### User Story 4 — Seamless Mode Switching (Priority: P2)

A student uses Apple Pencil to draw, then taps a text block to type, then picks up the pencil again to annotate. The transition is seamless — pencil draws, finger/mouse interacts with UI and text. No manual mode toggle needed (though one is available as a fallback).

**Why this priority**: Smooth input handling is what makes the canvas feel natural rather than clunky.

**Independent Test**: Use Apple Pencil to draw near a text block, then tap the text block with a finger to edit — verify no accidental drawing or editing conflicts.

**Acceptance Scenarios**:

1. **Given** a user is on the canvas, **When** Apple Pencil touches the canvas outside any element, **Then** it draws strokes (pen input = draw)
2. **Given** a user is on the canvas, **When** they tap a text block with their finger, **Then** the text block enters edit mode (finger/touch = interact)
3. **Given** a user is drawing with Apple Pencil, **When** they tap a text block with Apple Pencil, **Then** the text block enters edit mode (pencil on elements = interact)
4. **Given** the user prefers manual control, **When** they toggle the mode switch, **Then** all input behaves according to the selected mode (draw or select/edit)

---

### User Story 5 — Save & Real-Time Sync (Priority: P1)

A student draws a diagram on their iPad and it appears on their laptop within seconds. All canvas content — element positions, text content, drawing strokes — syncs in real-time between devices via the existing Supabase infrastructure.

**Why this priority**: Cross-device sync is essential for the use case of switching between iPad (drawing) and laptop (typing).

**Independent Test**: Create content on one device, verify it appears on another device within seconds without manual refresh.

**Acceptance Scenarios**:

1. **Given** a user moves a text block on device A, **When** device B is viewing the same document, **Then** the text block moves to the new position on device B within 3 seconds
2. **Given** a user draws strokes on iPad, **When** the desktop has the same document open, **Then** the strokes appear on the desktop within 3 seconds
3. **Given** a user creates or edits a text block, **When** the document syncs, **Then** both text content and position are preserved
4. **Given** a user is offline, **When** they make changes and later reconnect, **Then** changes sync automatically without data loss

---

### User Story 6 — PWA Installation on iPad (Priority: P2)

A student adds Typenote to their iPad home screen. It launches as a standalone app without Safari browser chrome, with a proper icon and splash screen.

**Why this priority**: PWA support makes the iPad experience feel native, but the canvas and drawing features work in Safari too.

**Independent Test**: Add the app to iPad home screen, launch it, verify standalone mode and proper branding.

**Acceptance Scenarios**:

1. **Given** a user visits Typenote in Safari on iPad, **When** they use "Add to Home Screen", **Then** the app installs with the correct name and icon
2. **Given** the app is installed, **When** the user launches it from the home screen, **Then** it opens in standalone mode without browser chrome
3. **Given** the app is installed, **When** the iPad has no internet, **Then** the app still launches and shows cached documents

---

### Edge Cases

- What happens when a text block is dragged on top of a drawing? Both elements remain independent; z-order determines which is visually on top, and users can reorder layers.
- What happens when two users edit the same text block simultaneously? The existing editing lock mechanism applies — one user gets edit access, the other sees real-time updates.
- What happens when a drawing has thousands of strokes? Stroke rendering should remain performant through batched rendering and viewport culling (only render visible strokes).
- What happens when a user draws over a text block? The drawing strokes appear above/below the text block based on z-order, not inside the text block's editor.
- How does the canvas handle very large zoom levels? Define min/max zoom bounds (e.g., 25% to 400%) to prevent unusable states.
- What happens when a user pastes elements from another document? Elements are placed at the current viewport center with their relative positions preserved.
- What happens when the user undoes across element boundaries (e.g., drew a stroke, then typed in a text block, then undoes)? The global undo stack reverses the last action regardless of which element it was on.
- What happens when a folder has a default background and a document overrides it? The document-level setting takes precedence; the folder default only applies to newly created documents.

## Requirements

### Functional Requirements

#### Infinite Canvas

- **FR-001**: System MUST render a pannable, zoomable infinite canvas as the primary document view
- **FR-002**: System MUST support pan via two-finger drag (touch), middle-click drag (mouse), or spacebar+drag
- **FR-003**: System MUST support zoom via pinch gesture (touch) and scroll wheel (mouse), with min/max zoom limits
- **FR-004**: System MUST persist viewport position and zoom level per document
- **FR-004a**: System MUST support four canvas background types: blank, grid, dotted, and lined — configurable per document
- **FR-004b**: Folders MUST support a default background setting that new documents within the folder inherit

#### Moveable Elements

- **FR-005**: System MUST support creating text blocks at arbitrary canvas positions via double-click/tap on empty canvas
- **FR-006**: Text blocks MUST be draggable to any position on the canvas
- **FR-007**: Text blocks MUST be resizable by dragging edges or corners
- **FR-008**: Each text block MUST contain a full rich-text editor supporting bold, italic, headings, lists, and inline math (existing TipTap functionality)
- **FR-009**: System MUST persist each element's position (x, y), size (width, height), and z-order
- **FR-010**: System MUST support selecting, moving, and deleting elements
- **FR-010a**: System MUST support free selection (lasso or shift-click) to multi-select elements for batch move or delete; no persistent grouping
- **FR-010b**: System MUST support copy, paste, and duplicate of selected elements within the same document and across documents

#### Apple Pencil Drawing

- **FR-011**: System MUST capture Apple Pencil input using the Pointer Events API, distinguishing pen from touch from mouse
- **FR-012**: System MUST render pencil strokes in real-time with sub-frame latency
- **FR-013**: System MUST use pressure data to vary stroke width for natural handwriting feel
- **FR-014**: System MUST provide a drawing toolbar with: pen tool, eraser, color picker (minimum 5 colors), and stroke width selector
- **FR-015**: All canvas actions (strokes, moves, text edits, element creation/deletion) MUST be undoable/redoable via a single global history stack
- **FR-016**: System MUST serialize stroke data into a format storable in the existing document content structure

#### Input Mode Handling

- **FR-017**: By default, Apple Pencil input on empty canvas MUST create drawing strokes
- **FR-018**: By default, finger/mouse input MUST pan the canvas and interact with elements (select, drag, resize)
- **FR-019**: Tapping/clicking a text block with any input MUST enter text editing mode
- **FR-020**: A manual mode toggle MUST be available as a fallback for users who prefer explicit control

#### Sync & Persistence

- **FR-021**: All canvas data (element positions, text content, stroke data) MUST be included in the document payload that syncs via Supabase Realtime
- **FR-022**: Drawing and position updates MUST use the same sync mechanism as text content
- **FR-023**: System MUST auto-save canvas state using the existing auto-save mechanism
- **FR-024**: The existing editing lock mechanism MUST apply to canvas documents

#### PWA & Touch Optimization

- **FR-025**: The app MUST include a valid web app manifest for iPad "Add to Home Screen" installation
- **FR-026**: The app MUST register a service worker caching essential assets for offline access
- **FR-027**: All interactive elements MUST meet minimum 44x44pt touch targets on tablet
- **FR-028**: The canvas UI MUST adapt layout for tablet screen sizes

### Key Entities

- **Canvas Document**: Extends the existing document with canvas-specific data — viewport state, background type (blank, grid, dotted, or lined), and a collection of canvas elements
- **Canvas Element**: A positioned object on the canvas with x, y, width, height, z-order, type (text-block or drawing-layer), and type-specific content
- **Text Block**: A canvas element containing TipTap rich-text editor content (JSON)
- **Drawing Layer**: A canvas element containing a collection of strokes
- **Stroke**: A single drawn path with points (x, y, pressure), color, base width, tool type (pen/eraser), and creation timestamp

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can create and position text blocks anywhere on the canvas, and blocks persist their position across sessions
- **SC-002**: Users can draw with Apple Pencil on the canvas with visible pressure sensitivity and under 16ms stroke rendering latency
- **SC-003**: Users can drag any element (text block or drawing) to a new position on the canvas
- **SC-004**: Canvas content (positions, text, drawings) syncs between devices within 3 seconds
- **SC-005**: Users can install the app as a PWA on iPad and launch it in standalone mode
- **SC-006**: 90% of users can create a mixed text-and-drawing document without needing instructions
- **SC-007**: All existing text editing features (bold, italic, headings, lists, inline math) work correctly within canvas text blocks
- **SC-008**: Canvas renders smoothly at 60fps with at least 100 elements and 1,000 strokes visible in the viewport, with no hard cap on document size

## Assumptions

- Users have an iPad running iPadOS 16+ with Safari for Apple Pencil support
- Users have a 1st or 2nd generation Apple Pencil (both support pressure via Pointer Events in Safari)
- The existing Supabase Realtime infrastructure and document content JSONB column can accommodate canvas data (element positions + stroke data) without schema changes
- The existing TipTap editor can be embedded within moveable canvas elements without architectural conflicts
- The project continues to be deployed over HTTPS (required for PWA and service workers)
- Touch optimization focuses on iPad tablet form factor; phone-sized layouts are out of scope

## Out of Scope

- Handwriting-to-text recognition (OCR)
- Shape recognition or auto-straightening
- Multi-user simultaneous drawing on the same canvas (collaborative real-time drawing)
- Apple Pencil double-tap gesture customization
- Native App Store distribution
- Android tablet or stylus support (may work incidentally)
- Phone-sized responsive layouts
- Image or file embedding on the canvas (future feature)
- Infinite canvas collaboration cursors (showing other users' cursors in real-time)

## Dependencies

- Existing real-time sync infrastructure (Supabase Realtime)
- Existing TipTap editor with custom node/extension support
- Existing auto-save and editing lock mechanisms
- HTTPS deployment environment (for PWA/service worker)

## Risks

- **Canvas performance with many elements**: A document with hundreds of text blocks and thousands of strokes could slow down rendering. Mitigation: Viewport culling — only render elements visible in the current viewport.
- **TipTap inside moveable containers**: Embedding a full rich-text editor inside draggable elements may cause input event conflicts (e.g., click-to-edit vs. drag-to-move). Mitigation: Clear interaction zones — border/handle for drag, interior for edit.
- **Drawing data payload size**: Complex drawings with many strokes could make the document payload large, slowing sync. Mitigation: Stroke simplification for completed strokes, and consider chunked sync for drawing data.
- **Apple Pencil latency in Safari**: Browser-based drawing may have slightly higher latency than native PencilKit. Mitigation: Use requestAnimationFrame, offscreen canvas, and optimized rendering pipeline.
- **Offline sync conflicts with canvas positions**: Two devices moving the same element to different positions while offline creates a conflict. Mitigation: Last-write-wins based on timestamp, consistent with existing sync strategy.
