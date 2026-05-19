# Data Model: Fix Image Resize and Position Not Persisting

## No Schema Changes Required

This bug fix does not modify the data model. The existing schema correctly supports image persistence.

### Existing Entities (unchanged)

**ImageObject** (stored in `CanvasPage.images[]` within the `pages` JSONB column):

- `id`: string (unique identifier)
- `x`: number (horizontal position on page)
- `y`: number (vertical position on page)
- `width`: number (display width in points)
- `height`: number (display height in points)
- `src`: string (base64 data URL)
- `aspectRatio`: number (original width / height)
- `createdAt`: number (timestamp)

**CanvasPage** (stored as array in `documents.pages` JSONB column):

- `id`: string
- `order`: number
- `strokes`: Stroke[]
- `textBoxes`: TextBox[]
- `images`: ImageObject[] (optional, defaults to [])
- `flowContent`: Record | null

### Data Flow (the fix point)

```
User resizes image
  -> setPages() updates React state (images[].width, height, x, y)
  -> triggerSave() starts 800ms debounce
  -> [BUG] If user navigates away: timer cleared, save lost
  -> [FIX] If user navigates away: saveFn fires immediately, data reaches DB
  -> getPagesData() serializes pagesRef.current (includes updated image data)
  -> updateDocumentContent() writes to documents.pages JSONB column
```

No new tables, columns, migrations, or seed data changes needed.
