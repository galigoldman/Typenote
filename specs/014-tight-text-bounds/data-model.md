# Data Model: Tight Text Selection Bounds

## Modified Entities

### TextBox (extended)

The existing `TextBox` interface gains one optional property. No database migration required — this is a runtime-only measurement stored in React state, not persisted to the database. The existing `pages` JSONB column stores `x, y, width, height, content` etc., but `contentBounds` is computed on the client from the rendered DOM and does not need persistence.

**New property:**

| Property        | Type                                 | Required | Description                                                                                                                                                                                                                                |
| --------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contentBounds` | `{ offsetX: number; width: number }` | Optional | Measured tight bounds of rendered text content. `offsetX` is horizontal offset from text box origin (0 for LTR, positive for RTL). `width` is the actual content width (max across all rendered lines). Undefined until first measurement. |

**Existing properties (unchanged):**

| Property       | Type                              | Description                                              |
| -------------- | --------------------------------- | -------------------------------------------------------- |
| `id`           | `string`                          | Unique identifier                                        |
| `x`            | `number`                          | Left position (page coordinates)                         |
| `y`            | `number`                          | Top position (page coordinates)                          |
| `width`        | `number`                          | Container width (text wrapping boundary) — unchanged     |
| `height`       | `number`                          | Measured content height (via ResizeObserver) — unchanged |
| `content`      | `Record<string, unknown> \| null` | TipTap JSON (ProseMirror format)                         |
| `isFullPage`   | `boolean`                         | Legacy flag                                              |
| `zIndex`       | `number`                          | Stacking order                                           |
| `linkedNextId` | `string?`                         | Overflow text box link                                   |
| `fontScale`    | `number?`                         | Font size multiplier                                     |

### BBox (unchanged)

The existing `BBox` interface (`{ minX, minY, maxX, maxY }`) is unchanged. The `getSelectableBBox()` function will compute different values from `contentBounds` instead of `width`, but the BBox shape itself is the same.

## State Transitions

```
TextBox created → contentBounds = undefined
  → TipTap renders → ResizeObserver fires → contentBounds = { offsetX, width }
    → Content edited → ResizeObserver fires → contentBounds updated
      → Content cleared (empty) → contentBounds = undefined (fallback to min area)
```

## Serialization Note

`contentBounds` is NOT serialized to the database. It is a transient, client-side computed property:

- Computed from the DOM on every mount/content change
- Stored in React state (`pages[].textBoxes[].contentBounds`)
- Excluded from save/load operations (the `pages` JSONB column should not include it)
- On page load, text boxes start with `contentBounds = undefined` and are measured after TipTap renders
