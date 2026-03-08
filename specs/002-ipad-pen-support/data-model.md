# Data Model: iPad Optimization & Apple Pencil Support

## Overview

This feature extends the existing document content model (Tiptap JSONB) with a new node type for drawings. No new database tables are required — drawing data lives inside the existing `documents.content` JSONB column as a Tiptap node.

## Entity: Drawing Block (Tiptap Node)

A drawing block is a block-level node in the Tiptap document tree, positioned between text paragraphs/headings.

### Node Schema

```
drawingBlock
├── type: "drawingBlock" (string, constant)
└── attrs:
    ├── id: string (UUID, unique per block)
    ├── width: number (canvas width in pixels, default: 800)
    ├── height: number (canvas height in pixels, default: 400)
    ├── background: "transparent" | "lined" | "grid" (default: "transparent")
    └── strokes: Stroke[] (array, default: [])
```

### Entity: Stroke

A single continuous pen stroke within a drawing block.

```
Stroke
├── id: string (UUID, unique per stroke)
├── points: Point[] (array of coordinate tuples)
├── color: string (hex color, e.g., "#000000")
├── width: number (base stroke width in pixels, e.g., 2)
└── tool: "pen" | "eraser" (stroke type)
```

### Entity: Point

A single sampled point in a stroke, stored as a compact tuple.

```
Point = [x, y, pressure]
├── x: number (horizontal position, 0 to canvas width)
├── y: number (vertical position, 0 to canvas height)
└── pressure: number (0.0 to 1.0, from Apple Pencil)
```

## Relationships

```
Document (existing)
└── content (JSONB) — Tiptap document tree
    ├── paragraph (existing)
    ├── heading (existing)
    ├── drawingBlock (NEW)
    │   └── strokes[]
    │       └── points[]
    └── ... (other existing node types)
```

## Example Document Content (JSONB)

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "Calculus Notes" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "The derivative of x² is 2x." }]
    },
    {
      "type": "drawingBlock",
      "attrs": {
        "id": "db-001",
        "width": 800,
        "height": 400,
        "background": "grid",
        "strokes": [
          {
            "id": "s-001",
            "points": [
              [100, 200, 0.5],
              [102, 198, 0.6],
              [105, 195, 0.7]
            ],
            "color": "#000000",
            "width": 2,
            "tool": "pen"
          },
          {
            "id": "s-002",
            "points": [
              [300, 100, 0.4],
              [302, 102, 0.5]
            ],
            "color": "#2563eb",
            "width": 3,
            "tool": "pen"
          }
        ]
      }
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "The graph above shows the parabola." }
      ]
    }
  ]
}
```

## Validation Rules

| Field                     | Rule                           | Rationale                                    |
| ------------------------- | ------------------------------ | -------------------------------------------- |
| `drawingBlock.id`         | Required, UUID format          | Unique identification for sync and undo/redo |
| `drawingBlock.width`      | 100–2048 pixels                | Prevent degenerate or oversized canvases     |
| `drawingBlock.height`     | 100–2048 pixels                | Same as above                                |
| `drawingBlock.background` | Enum: transparent, lined, grid | Must match supported background types        |
| `stroke.points`           | Min 2 points per stroke        | A single point isn't a visible stroke        |
| `stroke.color`            | Valid hex color (#RRGGBB)      | Rendering consistency                        |
| `stroke.width`            | 0.5–20 pixels                  | Prevent invisible or oversized strokes       |
| `stroke.tool`             | Enum: pen, eraser              | Only supported tool types                    |
| `point[0]` (x)            | 0 to canvas width              | Stay within canvas bounds                    |
| `point[1]` (y)            | 0 to canvas height             | Stay within canvas bounds                    |
| `point[2]` (pressure)     | 0.0–1.0                        | Apple Pencil pressure range                  |

## State Transitions

### Drawing Block Lifecycle

```
[Empty] → Insert drawing block → [Active: no strokes]
[Active: no strokes] → User draws → [Active: has strokes]
[Active: has strokes] → User draws more → [Active: has strokes]
[Active: has strokes] → User erases all → [Active: no strokes]
[Active: *] → User deletes block → [Removed from document]
[Active: *] → Undo → [Previous stroke state]
```

### Editor Mode State

```
[Text Mode] (default)
    ↓ User taps Draw toggle
[Draw Mode]
    ↓ User taps Text toggle
[Text Mode]
```

## Offline Cache Model

### Cached Document (IndexedDB)

```
CachedDocument
├── id: string (document UUID, primary key)
├── content: object (full Tiptap JSON including drawingBlocks)
├── title: string
├── updated_at: string (ISO timestamp)
├── is_dirty: boolean (has unsynced local changes)
└── cached_at: string (ISO timestamp of last cache)
```

### Offline Edit Queue (IndexedDB)

```
PendingEdit
├── id: string (auto-increment)
├── document_id: string (FK to cached document)
├── field: "content" | "title"
├── value: object | string (the updated data)
├── timestamp: string (ISO timestamp)
└── synced: boolean (false until confirmed)
```

## Size Estimates

| Scenario                           | Stroke Count | Points/Stroke | JSON Size |
| ---------------------------------- | ------------ | ------------- | --------- |
| Light sketch (diagram)             | 20           | 30            | ~12 KB    |
| Medium drawing (annotated graph)   | 50           | 50            | ~50 KB    |
| Heavy drawing (full page notes)    | 200          | 80            | ~300 KB   |
| Multiple drawing blocks (3 medium) | 150          | 50            | ~150 KB   |

**Note**: Supabase JSONB column has no practical size limit. The 50MB offline cache budget (NFR-5) supports hundreds of documents with drawings.

## Database Schema Changes

**No schema changes required.** Drawing data is embedded in the existing `documents.content` JSONB column as part of the Tiptap document structure. The JSONB type naturally accommodates the new `drawingBlock` node type.

The only infrastructure consideration is ensuring the Supabase Realtime publication on `documents` continues to broadcast the full content updates (already configured in migration `00002`).
