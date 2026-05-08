# Data Model: Paste Images as Canvas Objects

**Feature**: 040-image-paste-select
**Date**: 2026-04-27

## Entities

### ImageObject (NEW)

A positioned raster image on a canvas page.

| Field       | Type   | Description                                           |
| ----------- | ------ | ----------------------------------------------------- |
| id          | string | Unique identifier (UUID)                              |
| x           | number | X position on page (px, 0 = left edge)                |
| y           | number | Y position on page (px, 0 = top edge)                 |
| width       | number | Display width on page (px)                            |
| height      | number | Display height on page (px)                           |
| src         | string | Base64 data URL (`data:image/jpeg;base64,...`)        |
| aspectRatio | number | Original width/height ratio (for proportional resize) |
| createdAt   | number | Timestamp of creation (epoch ms)                      |

**Validation rules**:

- `width` and `height` must be > 0 and ≤ page dimensions (794x1123)
- `x` must be ≥ 0 and `x + width` ≤ 794
- `y` must be ≥ 0 and `y + height` ≤ 1123
- `src` must be a valid data URL with image MIME type
- `aspectRatio` must be > 0

### CanvasPage (MODIFIED)

Add `images` array alongside existing `strokes` and `textBoxes`.

| Field (new) | Type          | Description                            |
| ----------- | ------------- | -------------------------------------- |
| images      | ImageObject[] | Array of positioned images on the page |

**Default**: `[]` (empty array). Existing pages without `images` field are treated as having no images (backward compatible).

### ClipboardData (MODIFIED)

Extend to include images for internal copy/paste.

| Field (new) | Type          | Description                       |
| ----------- | ------------- | --------------------------------- |
| images      | ImageObject[] | Deep-cloned images from selection |

## Relationships

```
CanvasDocument
  └── pages: CanvasPage[]
        ├── strokes: Stroke[]       (existing)
        ├── textBoxes: TextBox[]    (existing)
        └── images: ImageObject[]   (NEW)
```

## State Transitions

### Image Lifecycle

```
[Clipboard] → paste → [Placed on Page] → save → [Persisted in JSONB]
                            ↕
                    [Selected] ←→ [Moving/Resizing]
                            ↓
                    [Deleted] → undo → [Restored]
```

### Selection States (extended)

The existing selection state machine adds images as selectable objects:

```
idle → pointerDown on image → selected (single image)
idle → rectangle selection → selected (mixed: strokes + images)
selected → drag → dragging → pointerUp → selected (new position)
selected → handle drag → resizing → pointerUp → selected (new size)
selected → Delete key → idle (image removed)
```

## Undo/Redo Actions (extended)

New action types for the existing undo stack:

| Action Type      | Payload                                     |
| ---------------- | ------------------------------------------- |
| add-image        | pageId, image (the added ImageObject)       |
| delete-images    | pageId, images[] (the removed ImageObjects) |
| move-images      | pageId, images[], previousPositions[]       |
| resize-image     | pageId, imageId, previousDimensions         |
| paste (modified) | pageId, strokes[], textBoxes[], images[]    |

## Backward Compatibility

- Existing documents without `images` field on pages will work unchanged
- The `images` array defaults to `[]` when absent
- No database migration needed — JSONB schema is flexible
- Old clients that don't understand `images` will simply ignore the field
