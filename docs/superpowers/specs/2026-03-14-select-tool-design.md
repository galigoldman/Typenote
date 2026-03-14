# Select Tool & Text-as-Text-Boxes Design

## Overview

Add a Select tool to the canvas editor and migrate all text to a text-box-based model. Every piece of text lives in a positioned, sized `TextBox` container. The Select tool allows users to tap, lasso, move, resize, copy, and delete objects (strokes and text boxes) on the canvas — matching GoodNotes/Notability behavior.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Text model | All text in text boxes | Enables moving/resizing text, matches note-taking apps |
| Select tool placement | Top-level mode (Draw / Select / Type) | Select is fundamentally different from Draw; needs easy access |
| Full-page text box overflow | Auto-flows to next page | Google Docs feel for default typing experience |
| Custom text box overflow | Fixed boundary, no auto-flow | User controls the size, content clips at boundary |
| Double-tap text box in Select | Switches to Type mode, focuses cursor | Quick editing without manual mode switch |
| Tap outside text box in Type | Returns to Draw mode | Pen is the "home" mode |
| Pointer types for Select | All (pen, touch, mouse) | Selection must work on desktop and tablet |

## Architecture: Text-as-Text-Boxes

### Two Kinds of Text Boxes

1. **Full-page text box**
   - Auto-created when user taps in Type mode on empty page space
   - Fills page width with comfortable margins
   - Auto-flows overflow to a new full-page text box on the next page (current Google Docs behavior preserved)
   - Feels like typing in a document — user doesn't know it's a text box until they select it
   - **If moved or resized by user, converts to a custom text box** (loses full-page status and auto-flow)

2. **Custom text box**
   - Created by tap-and-drag in Type mode (or via a future "Text Box" sub-tool)
   - User-defined position and size
   - Fixed boundary — no auto-flow, content clips at boundary (uses CSS `overflow: hidden` with fixed `height`)
   - Can be moved and resized freely

### Text Box Data Model

```typescript
interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: Record<string, unknown> | null; // TipTap ProseMirror JSON
  isFullPage: boolean;       // true = auto-flow on overflow, false = fixed boundary
  zIndex: number;            // rendering and selection order (higher = on top)
  linkedNextId?: string;     // for full-page boxes: ID of the overflow text box on next page
}
```

### Full-Page Text Box Overflow

Overflow detection moves into the `TextBox` component for full-page boxes:
- The text box monitors its content height vs its container height
- When content overflows, it triggers creation of a new full-page text box on the next page
- The two boxes are linked via `linkedNextId` — deleting content from the second box flows text back up
- This preserves the existing Google Docs-like behavior, just scoped to the text box instead of the page

### Math Extension

The KaTeX math extension is a TipTap node. It works identically in all text boxes — no changes needed. Wherever TipTap runs, math works.

### Splitting Text Boxes

- Place cursor at a point in a text box
- Invoke "Split here" action (context menu or keyboard shortcut)
- Text box splits into two at the cursor position
- Top box keeps content above cursor, bottom box gets content below
- Both boxes are independently movable/resizable
- If splitting a full-page box, both halves become custom text boxes

## Three Top-Level Modes

The toolbar changes from two modes to three:

```
[ Draw ] [ Select ] [ Type ]
```

- **Draw**: Pen, highlighter, eraser sub-tools (existing)
- **Select**: Tap/lasso to select, move, resize, delete objects
- **Type**: Tap to create/edit text boxes

### CanvasTool Type Update

```
'pen' | 'highlighter' | 'eraser' | 'select' | 'text'
```

**Note:** The existing `useSelection` hook checks for `'selection'` (with a cast). This must be updated to `'select'` to match the new type.

## Select Tool Behavior

### Pointer Types

Unlike Draw mode (pen-only), the Select tool responds to **all pointer types**: pen, touch, and mouse. This is necessary for desktop use and comfortable tablet interaction.

### Core Interactions (GoodNotes-style)

| Gesture | Action |
|---------|--------|
| Tap on object | Select it — show bounding box with 8 resize handles |
| Tap on empty space | Deselect all |
| Drag on empty space | Draw selection rectangle — selects all objects inside |
| Drag selected object | Move all selected objects |
| Drag resize handle | Resize selected object(s) |
| Double-tap text box | Switch to Type mode, focus cursor inside |
| Delete key / toolbar button | Delete selected objects |
| Tap when objects overlap | Cycle through overlapping objects on repeated taps |

### Selection Visual Feedback

- Selected objects show a blue bounding box with 8 resize handles (corners + edge midpoints)
- Selection rectangle while drawing: dashed blue border
- When dragging to move: slight shadow/offset to indicate movement
- Multi-selection: union bounding box around all selected objects

### Resize Behavior

**Text boxes:**
- Dragging a handle changes width/height. Text reflows within the new dimensions.
- Minimum size: 50x30px (enough for one line of text)
- No aspect ratio lock (text boxes are free-form)

**Strokes:**
- Resize scales all points proportionally from the opposite corner/edge
- Stroke width scales proportionally with the resize
- Pressure values are preserved (visual thickness scales with the geometry)

**Multi-selection resize:**
- Deferred to v2. In v1, resize handles are only shown for single-object selections.
- Multi-selection supports move and delete only.

### Object Disambiguation (Overlapping Objects)

When multiple objects overlap at the tap point:
1. First tap selects the topmost object (highest `zIndex` for text boxes, latest `createdAt` for strokes)
2. Subsequent taps within 15px of the same location cycle through overlapping objects (next one down in z-order)
3. Moving the tap point beyond 15px or waiting >1s resets the cycle

### Z-Order

- Strokes: ordered by `createdAt` timestamp (existing field). Later strokes are on top.
- Text boxes: ordered by `zIndex` field (new). Default `zIndex` = creation order.
- Text boxes render above strokes (text is always readable over drawings).
- Moving a selected object to front/back: deferred to v2.

### Multi-Selection

- Rectangle selects all objects whose bounding boxes intersect the selection area
- Selected group shows a union bounding box
- Move applies to all objects in the group
- Delete removes all selected objects
- Resize: v1 supports single-object only (see Resize Behavior)

## Interaction Layer for Select Mode

The canvas page has 6 rendering layers. In Select mode:
- The interaction layer (layer 6) captures all pointer events (like Draw mode)
- Text boxes remain visible but non-interactive (pointer-events: none) — interaction goes through the selection system
- Double-tap detection happens in the `useSelection` hook; when detected on a text box, it triggers the mode switch to Type and programmatically focuses the TipTap editor

## Mode Transitions

```
Draw ──[toolbar]──> Select ──[toolbar]──> Type
  ^                   │                     │
  │                   │ double-tap          │ tap outside
  │                   │ text box            │ text box
  │                   v                     │
  │                 Type ───────────────────┘
  │                   │
  └───────────────────┘ (tap outside text box → Draw)
```

| From | Action | To | Details |
|------|--------|----|---------|
| Select | double-tap text box | Type | Focus cursor inside that text box |
| Type | tap outside any text box | Draw | Pen is the "home" mode |
| Any | tap toolbar button | Target mode | Explicit mode switch |

## Undo/Redo

### Unified Action Stack

Extend the existing `StrokeAction` to a polymorphic `CanvasAction` type:

```typescript
type CanvasAction =
  | { type: 'stroke-add'; pageId: string; stroke: Stroke }
  | { type: 'stroke-remove'; pageId: string; stroke: Stroke }
  | { type: 'textbox-add'; pageId: string; textBox: TextBox }
  | { type: 'textbox-remove'; pageId: string; textBox: TextBox }
  | { type: 'textbox-move'; pageId: string; textBoxId: string; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'textbox-resize'; pageId: string; textBoxId: string; fromBounds: BBox; toBounds: BBox }
  | { type: 'textbox-split'; pageId: string; originalId: string; topBox: TextBox; bottomBox: TextBox };
```

- **Canvas actions** (move, resize, create, delete, split) use the shared undo stack
- **Text content** changes within a text box use TipTap's built-in undo/redo (unchanged)
- Undoing a split re-merges the two text boxes back into the original

## Existing Infrastructure

The codebase already has partial implementations:

- **`useSelection` hook** (`src/hooks/use-selection.ts`) — full selection lifecycle: idle → drawing → selected → dragging. Handles stroke selection and drag-to-move. Currently unused. **Needs updates:** change `'selection'` to `'select'`, accept all pointer types (not just pen), add text box hit detection, add resize handle interaction.
- **`SelectionOverlay` component** (`src/components/canvas/selection-overlay.tsx`) — renders selection rectangle, bounding box with 8 resize handles. Currently unused. **Needs updates:** remove `pointerEvents: 'none'` or implement mathematical hit-testing for handles in `useSelection`.
- **`TextBox` type** (`src/types/canvas.ts`) — position, size, content fields. Already part of `CanvasPage.textBoxes[]`. **Needs updates:** add `isFullPage`, `zIndex`, `linkedNextId` fields.
- **`TextBox` component** (`src/components/canvas/text-box.tsx`) — TipTap editor in a positioned container. Exists but no UI creates them. **Needs updates:** overflow detection for full-page boxes, fixed height for custom boxes.
- **Hit detection utilities** (`src/lib/canvas/stroke-utils.ts`) — `isStrokeInSelection()`, `pointInPolygon()`, `getSelectionBBox()`, AABB broad-phase.

### What Needs Building

1. Add `'select'` to `CanvasTool` type
2. Update `TextBox` type with `isFullPage`, `zIndex`, `linkedNextId` fields
3. Update `useSelection` hook: change tool name, accept all pointer types, add text box selection, add resize handle hit detection, add double-tap detection
4. Make `SelectionOverlay` handle interactions (resize handle hit-testing)
5. Wire `SelectionOverlay` into `CanvasPage` for select mode
6. Migrate from full-page `flowContent` to text box model
7. Add text box creation UI in Type mode (tap = full-page, drag = custom)
8. Move overflow detection into `TextBox` component for full-page boxes
9. Add Select button to toolbar (3-mode layout)
10. Implement mode transition logic (double-tap → Type, tap outside → Draw)
11. Add text box split functionality
12. Implement `CanvasAction` undo/redo stack (replacing `StrokeAction`)
13. Update data persistence (save text boxes to DB)
14. Add interaction layer routing for select mode in `CanvasPage`

## Migration Strategy

Existing documents have `page.flowContent` (full-page TipTap JSON). Migration:

1. On load, if `flowContent` exists and `textBoxes` is empty: auto-create a full-page text box from `flowContent`
2. If both `flowContent` and `textBoxes` exist: prefer `textBoxes` (partially migrated document)
3. Save always writes to `textBoxes[]` format
4. `flowContent` field becomes deprecated but kept for backward compat

## Out of Scope (v1)

- Lasso (freehand) selection — rectangle selection only
- Text box rotation
- Text box styling (border, background color)
- Copy/paste (within page or across pages)
- Grouping objects
- Multi-selection resize (move and delete only)
- Send to front/back z-order controls
- Cross-page selection
- Keyboard shortcuts beyond Delete (Cmd+A, arrow nudge, etc.)
