# Data Model: Infinite Canvas with Moveable Elements & iPad Drawing

## Overview

This feature transforms the document model from a linear TipTap document to a canvas-based document. The existing `documents.content` JSONB column stores both formats, discriminated by a `format` field. A new `default_background` column is added to `folders` for inheritable defaults.

## Schema Changes

### Migration: Add `default_background` to folders

```sql
ALTER TABLE folders ADD COLUMN default_background TEXT NOT NULL DEFAULT 'blank';
-- Valid values: 'blank', 'grid', 'dotted', 'lined'
```

### Migration: Extend `canvas_type` enum

```sql
-- Add 'dotted' to the allowed values for documents.canvas_type
-- (implementation depends on whether canvas_type is constrained)
```

No other schema changes. Canvas data lives in the existing `documents.content` JSONB column.

## Canvas Document Format (JSONB)

### Format Discrimination

```
documents.content JSONB
├── Linear format (existing): { "type": "doc", "content": [...] }
│   → No "format" field present → render as TipTap linear editor
└── Canvas format (new): { "format": "canvas", "version": 1, ... }
    → "format" === "canvas" → render as infinite canvas
```

### Canvas Content Structure

```json
{
  "format": "canvas",
  "version": 1,
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "background": "grid",
  "elements": {
    "elem-uuid-1": {
      "type": "text-block",
      "x": 100,
      "y": 200,
      "width": 400,
      "height": 300,
      "zOrder": 1,
      "content": {
        "type": "doc",
        "content": [
          { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Calculus Notes" }] },
          { "type": "paragraph", "content": [{ "type": "text", "text": "The derivative of x² is 2x." }] }
        ]
      }
    },
    "elem-uuid-2": {
      "type": "drawing-layer",
      "x": 0,
      "y": 0,
      "width": 800,
      "height": 600,
      "zOrder": 0,
      "strokes": [
        {
          "id": "s-001",
          "points": [[100, 200, 0.5], [102, 198, 0.6], [105, 195, 0.7]],
          "color": "#000000",
          "width": 2,
          "tool": "pen"
        }
      ]
    }
  },
  "zOrder": ["elem-uuid-2", "elem-uuid-1"]
}
```

## Entities

### Canvas Document

Extends the existing `Document` type. Differentiated by `content.format === "canvas"`.

```
Canvas Document Content
├── format: "canvas" (string, constant)
├── version: 1 (number, schema version)
├── viewport: Viewport
├── background: "blank" | "grid" | "dotted" | "lined"
├── elements: { [id: string]: CanvasElement } (element-keyed map)
└── zOrder: string[] (element IDs in bottom-to-top order)
```

### Viewport

```
Viewport
├── x: number (horizontal pan offset)
├── y: number (vertical pan offset)
└── zoom: number (zoom level, 0.25 to 4.0)
```

### Canvas Element (base)

```
CanvasElement
├── type: "text-block" | "drawing-layer"
├── x: number (position on canvas)
├── y: number (position on canvas)
├── width: number (element width)
├── height: number (element height)
└── zOrder: number (rendering order)
```

### Text Block (extends CanvasElement)

```
TextBlock extends CanvasElement
├── type: "text-block" (constant)
└── content: TipTapJSON (standard TipTap document JSON)
```

### Drawing Layer (extends CanvasElement)

```
DrawingLayer extends CanvasElement
├── type: "drawing-layer" (constant)
└── strokes: Stroke[]
```

### Stroke

```
Stroke
├── id: string (UUID)
├── points: Point[] (array of [x, y, pressure] tuples)
├── color: string (hex, e.g., "#000000")
├── width: number (base width in pixels)
└── tool: "pen" | "eraser"
```

### Point (compact tuple)

```
Point = [x, y, pressure]
├── x: number (canvas-relative horizontal position)
├── y: number (canvas-relative vertical position)
└── pressure: number (0.0 to 1.0)
```

## Relationships

```
Document (existing table)
└── content (JSONB)
    ├── [Linear format] → TipTap doc tree (existing)
    └── [Canvas format] → Canvas Document
        ├── viewport
        ├── elements (map)
        │   ├── TextBlock → content (TipTap JSON)
        │   └── DrawingLayer → strokes[] → points[]
        └── zOrder[]

Folder (existing table)
└── default_background: "blank" | "grid" | "dotted" | "lined"
    → inherited by new documents created in this folder
```

## Validation Rules

| Field | Rule | Rationale |
|-------|------|-----------|
| `format` | Must be `"canvas"` or absent | Discriminates canvas vs. linear |
| `version` | Must be `1` | Schema versioning for future changes |
| `viewport.zoom` | 0.25 to 4.0 | Prevent unusable zoom states |
| `background` | Enum: blank, grid, dotted, lined | Supported types only |
| `element.x`, `element.y` | Any number (infinite canvas) | No bounds restriction |
| `element.width` | >= 50 pixels | Minimum usable size |
| `element.height` | >= 30 pixels | Minimum usable size |
| `element.zOrder` | Non-negative integer | Rendering order |
| `stroke.points` | Min 2 points | Single point isn't visible |
| `stroke.color` | Valid hex (#RRGGBB) | Rendering consistency |
| `stroke.width` | 0.5 to 20 pixels | Prevent invisible or oversized |
| `point[2]` (pressure) | 0.0 to 1.0 | Apple Pencil range |

## State Transitions

### Canvas Element Lifecycle

```
[Created] → User double-clicks canvas → [Positioned on canvas]
[Positioned] → User drags → [Moved to new position]
[Positioned] → User resizes → [Resized]
[Positioned] → User selects + deletes → [Removed from elements map + zOrder]
[Removed] → Undo → [Restored to previous position]
```

### Text Block Edit Lifecycle

```
[Idle] → User clicks inside → [Editing] (TipTap editor focused)
[Editing] → User clicks outside → [Idle] (content saved)
[Idle] → User drags border → [Moving]
[Moving] → User releases → [Idle at new position]
```

### Drawing Lifecycle

```
[No strokes] → Apple Pencil touches canvas → [Drawing active]
[Drawing active] → Pencil moves → [Stroke points accumulating]
[Stroke points accumulating] → Pencil lifts → [Stroke completed, added to layer]
[Stroke completed] → Eraser touches stroke → [Stroke removed]
```

## Size Estimates

| Scenario | Elements | Strokes | Points/Stroke | Est. JSON Size |
|----------|----------|---------|---------------|----------------|
| Light canvas (few notes) | 5 text blocks | 20 | 30 | ~25 KB |
| Medium canvas (lecture) | 20 text blocks, 5 drawing layers | 100 | 50 | ~120 KB |
| Heavy canvas (full session) | 50 text blocks, 15 drawing layers | 500 | 80 | ~500 KB |
| Stress test (100+ elements) | 100 text blocks, 20 drawing layers | 1000 | 80 | ~1 MB |

**Note**: The notification-then-fetch sync pattern handles any payload size. The 50MB offline cache budget supports dozens of heavy documents.

## Offline Cache Model

### Cached Document (IndexedDB) — unchanged from existing

```
CachedDocument
├── id: string (document UUID)
├── content: object (canvas format or linear format JSONB)
├── title: string
├── updated_at: string (ISO timestamp)
├── is_dirty: boolean (unsynced local changes)
└── cached_at: string (ISO timestamp)
```

### Offline Edit Queue (IndexedDB) — unchanged from existing

```
PendingEdit
├── id: string (UUID)
├── document_id: string
├── field: "content" | "title"
├── value: object | string
├── timestamp: string (ISO)
└── synced: boolean
```
