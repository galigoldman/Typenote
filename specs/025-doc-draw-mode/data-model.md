# Data Model: Enable Draw Mode in Text Documents

**Feature**: 025-doc-draw-mode
**Date**: 2026-03-24

## Entities

### Document (existing — modified behavior)

The `documents` table already has a `pages` JSONB column. Text-only documents currently store `null` in this field. This feature will populate `pages` for text documents that have drawing annotations.

| Field     | Type             | Change              | Notes                                                                                 |
| --------- | ---------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `id`      | UUID             | None                | Primary key                                                                           |
| `content` | JSONB            | None                | TipTap editor JSON — unchanged                                                        |
| `pages`   | JSONB (nullable) | **Behavior change** | Will be set to `{ pages: [...], mode: "text-overlay" }` when user draws on a text doc |

### Pages JSONB Structure (for text documents with drawings)

When a text document gains drawings, `pages` will be set to:

```json
{
  "mode": "text-overlay",
  "pages": [
    {
      "id": "generated-id",
      "order": 0,
      "strokes": [
        {
          "id": "stroke-id",
          "points": [[x, y, pressure], ...],
          "color": "#000000",
          "width": 3,
          "opacity": 1,
          "bbox": { "minX": 0, "minY": 0, "maxX": 100, "maxY": 100 },
          "createdAt": 1711276800000
        }
      ],
      "textBoxes": [],
      "flowContent": null,
      "pageType": "blank"
    }
  ]
}
```

**Key difference from canvas documents**: The `mode: "text-overlay"` field distinguishes text documents with drawing annotations from true canvas documents. This allows the routing logic to send these documents to the TipTap editor (with drawing overlay) rather than the CanvasEditor.

### Stroke (existing — no changes)

Reuses the existing `Stroke` type from `src/types/canvas.ts`:

| Field       | Type          | Description                           |
| ----------- | ------------- | ------------------------------------- |
| `id`        | string        | Unique identifier                     |
| `points`    | StrokePoint[] | Array of [x, y, pressure] tuples      |
| `color`     | string        | Hex color code                        |
| `width`     | number        | Stroke width in pixels                |
| `opacity`   | number        | 0-1 opacity value                     |
| `bbox`      | BBox          | Precomputed axis-aligned bounding box |
| `createdAt` | number        | Timestamp of creation                 |

## State Transitions

### Text Document Drawing Lifecycle

```
┌──────────────────┐
│  Text-Only Doc   │  pages: null
│  (no drawings)   │
└────────┬─────────┘
         │ User activates draw mode and draws first stroke
         ▼
┌──────────────────┐
│  Text Doc with   │  pages: { mode: "text-overlay", pages: [{ strokes: [...] }] }
│  Drawing Overlay │
└────────┬─────────┘
         │ User erases all strokes
         ▼
┌──────────────────┐
│  Text Doc with   │  pages: { mode: "text-overlay", pages: [{ strokes: [] }] }
│  Empty Overlay   │  (pages remains set — not reset to null)
└──────────────────┘
```

## Routing Logic Update

**Current** (`page.tsx` line 49):

```
isTextDocument = !pages && !material_id
```

**New**:

```
isTextDocument = (!pages && !material_id) || (pages.mode === "text-overlay")
```

This ensures text documents with drawing annotations continue to route through the TipTap editor path.

## Validation Rules

- Strokes must have at least 2 points.
- Stroke color must be a valid hex color.
- Stroke width must be positive.
- Stroke opacity must be between 0 and 1 (inclusive).
- BBox must be correctly computed from points (same as canvas docs).
- The `mode` field in pages must be `"text-overlay"` for text documents (canvas documents don't set this field).

## No Migration Required

No database migration is needed. The `pages` column already exists as nullable JSONB with no schema constraints. The `mode: "text-overlay"` marker is stored within the JSON structure, not as a separate column.
