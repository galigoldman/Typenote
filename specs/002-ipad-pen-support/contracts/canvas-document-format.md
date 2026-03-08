# Contract: Canvas Document Content Format

## Format Discrimination

The `documents.content` JSONB column supports two formats:

| Format | Detection | Renderer |
|--------|-----------|----------|
| Linear (existing) | No `format` field, top-level `"type": "doc"` | TipTap linear editor |
| Canvas (new) | `"format": "canvas"` | Infinite canvas |

## Canvas Content Schema

```json
{
  "format": "canvas",
  "version": 1,
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1.0
  },
  "background": "blank",
  "elements": {},
  "zOrder": []
}
```

### Field Definitions

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `format` | `"canvas"` | Yes | — | Constant string |
| `version` | number | Yes | `1` | Schema version |
| `viewport.x` | number | Yes | `0` | Pan offset X |
| `viewport.y` | number | Yes | `0` | Pan offset Y |
| `viewport.zoom` | number | Yes | `1.0` | 0.25 – 4.0 |
| `background` | string | Yes | `"blank"` | `"blank"` \| `"grid"` \| `"dotted"` \| `"lined"` |
| `elements` | object | Yes | `{}` | Map of element ID → CanvasElement |
| `zOrder` | string[] | Yes | `[]` | Element IDs, bottom-to-top order |

## Canvas Element Schema

### Text Block

```json
{
  "type": "text-block",
  "x": 100,
  "y": 200,
  "width": 400,
  "height": 300,
  "zOrder": 1,
  "content": {
    "type": "doc",
    "content": [...]
  }
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | `"text-block"` | Constant |
| `x`, `y` | number | Any value (infinite canvas) |
| `width` | number | >= 50 |
| `height` | number | >= 30 |
| `zOrder` | number | >= 0 |
| `content` | TipTap JSON | Standard TipTap document |

### Drawing Layer

```json
{
  "type": "drawing-layer",
  "x": 0,
  "y": 0,
  "width": 800,
  "height": 600,
  "zOrder": 0,
  "strokes": [
    {
      "id": "uuid",
      "points": [[100, 200, 0.5], [102, 198, 0.6]],
      "color": "#000000",
      "width": 2,
      "tool": "pen"
    }
  ]
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | `"drawing-layer"` | Constant |
| `strokes` | Stroke[] | Array of stroke objects |
| `stroke.id` | string | UUID |
| `stroke.points` | number[][] | Min 2 points, each `[x, y, pressure]` |
| `stroke.color` | string | Hex `#RRGGBB` |
| `stroke.width` | number | 0.5 – 20 |
| `stroke.tool` | string | `"pen"` \| `"eraser"` |

## New Document Creation

When creating a canvas document:

```json
{
  "format": "canvas",
  "version": 1,
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "background": "<folder.default_background or 'blank'>",
  "elements": {
    "<uuid>": {
      "type": "text-block",
      "x": 0,
      "y": 0,
      "width": 400,
      "height": 200,
      "zOrder": 0,
      "content": { "type": "doc", "content": [{ "type": "paragraph" }] }
    }
  },
  "zOrder": ["<uuid>"]
}
```

A new canvas document starts with one empty text block at origin.

## Migration: Linear → Canvas

Optional "Convert to Canvas" action wraps existing TipTap content:

```json
{
  "format": "canvas",
  "version": 1,
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "background": "<document.canvas_type>",
  "elements": {
    "<uuid>": {
      "type": "text-block",
      "x": 0,
      "y": 0,
      "width": 600,
      "height": 800,
      "zOrder": 0,
      "content": "<existing linear TipTap JSON>"
    }
  },
  "zOrder": ["<uuid>"]
}
```
