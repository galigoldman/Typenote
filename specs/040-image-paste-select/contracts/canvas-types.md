# Contract: Canvas Type Extensions

**Feature**: 040-image-paste-select
**Date**: 2026-04-27

## New Type: ImageObject

```typescript
interface ImageObject {
  id: string; // UUID v4
  x: number; // Page X coordinate (0–794)
  y: number; // Page Y coordinate (0–1123)
  width: number; // Display width in page units
  height: number; // Display height in page units
  src: string; // Base64 data URL (data:image/jpeg;base64,... or data:image/png;base64,...)
  aspectRatio: number; // width/height of original image (for proportional resize)
  createdAt: number; // Unix epoch ms
}
```

## Modified Type: CanvasPage

```typescript
interface CanvasPage {
  id: string;
  order: number;
  pageType?: 'blank' | 'lined' | 'grid' | 'dotted';
  strokes: Stroke[];
  textBoxes: TextBox[];
  images: ImageObject[]; // NEW — defaults to []
  flowContent: Record<string, unknown> | null;
  pdfPage?: number;
}
```

## Modified Type: ClipboardData

```typescript
interface ClipboardData {
  strokes: Stroke[];
  textBoxes: TextBox[];
  images: ImageObject[]; // NEW — copied images
  originX: number;
  originY: number;
  sourcePageId: string;
}
```

## New Undo Action Types

```typescript
// Add to existing CanvasAction union:
| { type: 'add-image'; pageId: string; image: ImageObject }
| { type: 'delete-images'; pageId: string; images: ImageObject[] }
| { type: 'move-images'; pageId: string; imageIds: string[]; dx: number; dy: number }
| { type: 'resize-image'; pageId: string; imageId: string; prev: { x: number; y: number; width: number; height: number } }
```

## Image Processing Contract

```typescript
// Utility to process pasted image before adding to canvas
function processClipboardImage(blob: Blob): Promise<{
  src: string; // Compressed base64 data URL
  width: number; // Original pixel width (before page scaling)
  height: number; // Original pixel height
  aspectRatio: number; // width / height
}>;
```

**Processing rules**:

1. If longest dimension > 1200px, resize to 1200px (maintain aspect ratio)
2. If image has no transparency → JPEG at 80% quality
3. If image has transparency → PNG
4. Return base64 data URL and original dimensions
