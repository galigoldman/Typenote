# Data Model: Drawing Copy/Paste

**Feature**: 037-drawing-copy-paste
**Date**: 2026-04-10

## Overview

No database changes. All data structures are client-side, in-memory only.

## Entities

### ClipboardData (new, in-memory)

Holds copied elements for paste operations. Stored as a React ref.

| Field | Type | Description |
| ----- | ---- | ----------- |
| strokes | Stroke[] | Deep-cloned strokes from the copied selection |
| textBoxes | TextBox[] | Deep-cloned text boxes from the copied selection |
| originX | number | X center of the original selection bounding box |
| originY | number | Y center of the original selection bounding box |
| sourcePageId | string | Page ID where the copy was performed |

**Lifecycle**: Created on copy, persists until overwritten by a new copy or document switch. Never persisted to storage.

### PasteCanvasAction (new undo action variant)

Extends the existing `CanvasAction` discriminated union.

| Field | Type | Description |
| ----- | ---- | ----------- |
| type | 'paste' | Discriminant |
| pageId | string | Target page where elements were pasted |
| strokes | Stroke[] | All strokes created by this paste |
| textBoxes | TextBox[] | All text boxes created by this paste |

**Undo behavior**: Removes all strokes and text boxes in this action from the target page.
**Redo behavior**: Re-adds all strokes and text boxes back to the target page.

## Existing Entities (unchanged)

### Stroke (src/types/canvas.ts)

| Field | Type | Description |
| ----- | ---- | ----------- |
| id | string | Unique identifier |
| points | [number, number, number][] | [x, y, pressure] tuples |
| color | string | Stroke color |
| width | number | Stroke width |
| opacity | number | Stroke opacity |
| bbox | BBox | Bounding box for hit detection |
| createdAt | number | Timestamp |

### TextBox (src/types/canvas.ts)

| Field | Type | Description |
| ----- | ---- | ----------- |
| id | string | Unique identifier |
| x, y | number | Position |
| width, height | number | Dimensions |
| content | JSONContent | TipTap JSON content |
| zIndex | number | Layer order |
| fontScale | number | Font scaling factor |

### BBox (src/types/canvas.ts)

| Field | Type | Description |
| ----- | ---- | ----------- |
| minX, minY | number | Top-left corner |
| maxX, maxY | number | Bottom-right corner |

## State Transitions

```
[No clipboard] --copy--> [Clipboard filled]
[Clipboard filled] --paste--> [Clipboard filled] (unchanged, allows repeat paste)
[Clipboard filled] --copy--> [Clipboard replaced]
[Clipboard filled] --document switch--> [No clipboard]
```

## Relationships

- ClipboardData contains deep clones of Stroke and TextBox entities
- PasteCanvasAction references the pasted Stroke and TextBox instances by holding them directly (same pattern as existing stroke-add/stroke-remove actions)
- Pasted strokes/text boxes become part of the CanvasPage.strokes[] / .textBoxes[] arrays, indistinguishable from originals
