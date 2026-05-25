# Data Model: Fix Image Paste Target & Cross-Page Object Movement

**No database changes required.** This feature is purely client-side. All changes affect in-memory state and the existing `documents.pages` JSONB column.

## Existing Entities (unchanged)

### CanvasPage
```
id: string (UUID)
order: number (0-based index)
pageType: 'blank' | 'lined' | 'grid' | 'dotted'
strokes: Stroke[]
textBoxes: TextBox[]
images: ImageObject[]
flowContent: Record<string, unknown> | null
pdfPage: number | undefined
```

### ImageObject
```
id: string (random)
x: number (page-relative, 0 = left edge)
y: number (page-relative, 0 = top edge)
width: number (pixels)
height: number (pixels)
src: string (base64 data URL)
aspectRatio: number (width / height)
createdAt: number (timestamp)
```

### ClipboardData
```
strokes: Stroke[]
textBoxes: TextBox[]
images: ImageObject[]
originX: number (center of copied selection)
originY: number (center of copied selection)
sourcePageId: string
```

## New Type: CrossPageMoveAction (undo action)

Added to the `CanvasAction` discriminated union:

```
type: 'cross-page-move'
fromPageId: string
toPageId: string
strokes: Stroke[] (moved strokes with original coordinates)
textBoxes: TextBox[] (moved text boxes with original coordinates)
images: ImageObject[] (moved images with original coordinates)
dx: number (displacement applied to X)
dy: number (displacement applied to Y, adjusted for page boundary)
```

**Relationship**: Extends the existing `CanvasAction` union at `canvas-editor.tsx:510-547`. Undo reverses by removing objects from `toPageId` and re-adding to `fromPageId` with original coordinates.

## State Changes (in-memory only)

### Paste Target Fix
- No new state. The viewport detection logic is improved to always find the correct page.

### Cross-Page Drag
- `activePageIdRef` in `use-selection.ts` may change during drag commit when objects cross a page boundary.
- `selectionPageId` updates to the new target page after a cross-page move.
- Objects are removed from source page's array (strokes/textBoxes/images) and added to target page's array.

### Persistence
- No change. The `pages` JSONB column already serializes the full page array including all objects. Moving an object between pages just changes which page's array contains it.
