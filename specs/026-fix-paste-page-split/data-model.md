# Data Model: Fix Paste Content Page Splitting

**No schema changes.** This is a client-side-only fix to the page overflow detection logic.

## Existing Entities (unchanged)

### CanvasPage

A single A4 page in the document. Stored in the `pages` JSONB column.

| Field       | Type                                     | Description                             |
| ----------- | ---------------------------------------- | --------------------------------------- |
| id          | string                                   | Unique page identifier                  |
| order       | number                                   | Page index (0-based)                    |
| pageType    | 'blank' \| 'lined' \| 'grid' \| 'dotted' | Page background style                   |
| strokes     | Stroke[]                                 | Pen/highlighter strokes on the page     |
| textBoxes   | TextBox[]                                | Positioned text boxes (select mode)     |
| flowContent | JSON \| null                             | TipTap ProseMirror document (text mode) |
| pdfPage     | number \| undefined                      | PDF page index for material-backed docs |

### CanvasDocument

Top-level container stored in `documents.pages` JSONB column.

| Field | Type         | Description                |
| ----- | ------------ | -------------------------- |
| pages | CanvasPage[] | Ordered array of all pages |

## Content Flow During Overflow

### Before fix (single-block extraction)

```
Page N (overflowing):  [Block 1] [Block 2] ... [Block K] [Block K+1] ... [Block N]
                                                  ^PAGE_HEIGHT
After split:
  Page N:              [Block 1] [Block 2] ... [Block K] [Block K+1] ... [Block N-1]
  Page N+1:            [Block N]  ← only last block moved
  ❌ Page N still overflows!
```

### After fix (bulk extraction from overflow point)

```
Page N (overflowing):  [Block 1] [Block 2] ... [Block K] [Block K+1] ... [Block N]
                                                  ^PAGE_HEIGHT
After split:
  Page N:              [Block 1] [Block 2] ... [Block K]  ← fits within PAGE_HEIGHT
  Page N+1:            [Block K+1] ... [Block N]  ← all overflow blocks moved
  → If Page N+1 overflows, cascade repeats
```

## Constants

| Constant    | Value | Description                  |
| ----------- | ----- | ---------------------------- |
| PAGE_WIDTH  | 794   | A4 width in points (96 DPI)  |
| PAGE_HEIGHT | 1123  | A4 height in points (96 DPI) |
