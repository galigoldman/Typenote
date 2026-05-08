# Quickstart: Paste Images as Canvas Objects

**Feature**: 040-image-paste-select
**Date**: 2026-04-27

## What This Feature Does

Adds the ability to paste images from the system clipboard onto canvas pages. Pasted images become first-class canvas objects that can be selected, moved, resized (aspect ratio locked), and deleted. The editor automatically switches to select mode when an image is pasted.

## Key Files to Modify

| File                                      | Change                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/types/canvas.ts`                     | Add `ImageObject` interface, extend `CanvasPage` and `ClipboardData`                                       |
| `src/hooks/use-selection.ts`              | Add image hit testing, image in selection, image resize (aspect-locked)                                    |
| `src/components/canvas/canvas-editor.tsx` | Add paste event listener for system clipboard images, image add/delete/move handlers, undo/redo for images |
| `src/components/canvas/canvas-page.tsx`   | Render `<img>` elements for each image on the page                                                         |
| `src/lib/pdf/html-template.ts`            | Add `<img>` tags for images in PDF export HTML                                                             |

## Key Files to Read First

| File                                      | Why                                                             |
| ----------------------------------------- | --------------------------------------------------------------- |
| `src/types/canvas.ts`                     | Understand existing `Stroke`, `TextBox`, `CanvasPage` types     |
| `src/hooks/use-selection.ts`              | Understand selection, copy/paste, resize, and drag logic        |
| `src/components/canvas/canvas-editor.tsx` | Understand page state management, undo/redo, keyboard shortcuts |
| `src/components/canvas/canvas-page.tsx`   | Understand how strokes and text boxes are rendered per page     |

## No New Dependencies

All functionality uses built-in browser APIs:

- `ClipboardEvent.clipboardData.items` for reading pasted images
- `HTMLCanvasElement` for resizing images and converting to base64
- `HTMLImageElement` for loading image blobs and reading dimensions

## No Database Migration

Images are stored as base64 data URLs inside the existing `pages` JSONB column on the `documents` table. The `images` array is added to the `CanvasPage` type but defaults to `[]` — backward compatible with existing documents.

## Testing Approach

- **Unit tests**: Image resize/compression utility, hit testing logic, aspect ratio enforcement
- **E2E tests**: Paste image → verify visible, select → move → verify position, resize → verify proportional, delete → undo → verify restored
