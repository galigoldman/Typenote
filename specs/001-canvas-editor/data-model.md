# Data Model: Freeform Canvas Editor

**Branch**: `001-canvas-editor` | **Date**: 2026-03-08

## Entity Relationship

```
Document 1──* Page 1──* Stroke
                   1──* TextBox
                   1──1 FlowContent
```

## Entities

### Document (existing, extended)

The existing `documents` table gains a new `pages` JSONB column.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key (existing) |
| user_id | UUID | FK to profiles (existing) |
| folder_id | UUID | FK to folders, nullable (existing) |
| title | text | Document title (existing) |
| content | JSONB | Legacy TipTap JSON (existing, eventually deprecated) |
| pages | JSONB | New multi-page canvas data (new) |
| canvas_type | text | Background style: blank, lined, grid (existing) |
| position | integer | Sort order (existing) |
| created_at | timestamptz | (existing) |
| updated_at | timestamptz | Auto-updated by trigger (existing) |

### Page

Stored as elements of the `pages.pages[]` JSON array.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Stable identifier for reconciliation |
| order | integer | Display sequence (0-based) |
| strokes | Stroke[] | Array of pen strokes on this page |
| textBoxes | TextBox[] | Array of positioned text boxes |
| flowContent | TipTap JSON | Default document-like text that flows naturally |

**Dimensions**: 794 × 1123 points (A4 at 96 DPI). All coordinates on a page are relative to this space.

### Stroke

Stored as elements of `page.strokes[]`.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier for selection/deletion |
| points | number[][] | Array of `[x, y, pressure]` triples |
| color | string | Hex color (default: `"#000000"`) |
| width | number | Stroke width in points (default: `2`) |
| bbox | BBox | Precomputed bounding box for hit detection |
| createdAt | number | Epoch milliseconds |

**Point format**: `[x, y, pressure]` where:
- `x`: 0–794 (page width), rounded to 1 decimal
- `y`: 0–1123 (page height), rounded to 1 decimal
- `pressure`: 0.00–1.00, rounded to 2 decimals

**BBox format**: `{ minX, minY, maxX, maxY }` — computed client-side, stored for eraser hit detection optimization.

### TextBox

Stored as elements of `page.textBoxes[]`.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| x | number | Left position in page coordinates |
| y | number | Top position in page coordinates |
| width | number | Width in page coordinates |
| height | number | Height in page coordinates (auto-grows with content) |
| content | TipTap JSON | ProseMirror document JSON |

TextBoxes are created when:
1. The selection tool cuts text from the flow content
2. The selection tool splits an existing text box

### FlowContent

Stored as `page.flowContent` — a TipTap JSON document.

This is the "default mode" text that behaves like a regular document. It fills the page top-to-bottom with standard text flow. When a user types without using any canvas tool, text goes here.

When the selection tool cuts a portion of flow content, that portion becomes a TextBox, and the remaining text stays in flowContent (or splits into flowContent + TextBox).

## JSON Schema Example

```json
{
  "pages": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "order": 0,
      "strokes": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440010",
          "points": [[100.0, 200.5, 0.80], [101.2, 201.3, 0.82], [103.5, 202.0, 0.75]],
          "color": "#000000",
          "width": 2,
          "bbox": { "minX": 100.0, "minY": 200.5, "maxX": 103.5, "maxY": 202.0 },
          "createdAt": 1710000000000
        }
      ],
      "textBoxes": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440020",
          "x": 50,
          "y": 400,
          "width": 300,
          "height": 100,
          "content": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Moved text"}]}]
          }
        }
      ],
      "flowContent": {
        "type": "doc",
        "content": [
          {"type": "paragraph", "content": [{"type": "text", "text": "This is default flowing text..."}]}
        ]
      }
    }
  ]
}
```

## Size Estimates

| Scenario | Strokes | Points/stroke | Approx. JSON size |
|----------|---------|---------------|-------------------|
| Light note (1 page) | 20 | 50 | ~22 KB |
| Medium note (5 pages) | 250 | 50 | ~275 KB |
| Heavy note (10 pages) | 500 | 50 | ~550 KB |
| Max safe (Realtime limit) | ~700 | 50 | ~770 KB |

**Constraint**: Keep total `pages` JSON under ~800 KB for Supabase Realtime compatibility.

## Migration Plan

**Phase 1** — Add column (non-destructive):
```sql
ALTER TABLE public.documents ADD COLUMN pages jsonb DEFAULT '{"pages":[]}';
```

**Phase 2** — Dual-write in application code: save to both `content` and `pages`.

**Phase 3** — Backfill existing documents:
```sql
UPDATE public.documents
SET pages = jsonb_build_object(
  'pages', jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'order', 0,
      'strokes', '[]'::jsonb,
      'textBoxes', '[]'::jsonb,
      'flowContent', content
    )
  )
)
WHERE pages = '{"pages":[]}'::jsonb
  AND content IS NOT NULL
  AND content != '{}'::jsonb;
```

## State Transitions

### Stroke Lifecycle
```
Created (pen down) → Points added (pen move) → Finalized (pen up) → Persisted (auto-save)
                                                                   → Erased (eraser touch) → Removed from array
                                                                   → Selected (cut tool) → Moved (drag) → Persisted
```

### Text Box Lifecycle
```
Flow content (default typing) → Cut by selection tool → TextBox created with x,y position
                                                      → Split into 2 TextBoxes (partial cut)
TextBox → Selected → Moved → Persisted
```
