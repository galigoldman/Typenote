# Quickstart: iPad Optimization & Apple Pencil Support

## Prerequisites

- Node.js 20+, pnpm 10+
- Supabase CLI (local development)
- iPad with Apple Pencil (for manual testing)
- Both devices on the same network (for iPad testing against local dev server)

## Setup

```bash
# Install new dependencies
pnpm add perfect-freehand @serwist/next serwist idb-keyval uuid
pnpm add -D @types/uuid

# Start local dev
pnpm dev
```

## Testing on iPad

1. Find your computer's local IP: `hostname -I` (Linux) or `ipconfig getifaddr en0` (Mac)
2. Start dev server: `pnpm dev --hostname 0.0.0.0`
3. On iPad Safari, navigate to `http://<your-ip>:3000`
4. For PWA install: Tap Share → "Add to Home Screen"

**Note**: Service workers require HTTPS. For local testing, PWA install won't work over HTTP. Use `ngrok` or deploy to a staging environment for full PWA testing.

## Key Files to Know

| Area             | File                                           | Purpose                               |
| ---------------- | ---------------------------------------------- | ------------------------------------- |
| Drawing types    | `src/lib/drawing/types.ts`                     | Stroke, Point, DrawingTool interfaces |
| Stroke rendering | `src/lib/drawing/stroke-renderer.ts`           | perfect-freehand → Canvas 2D          |
| Drawing canvas   | `src/components/drawing/drawing-canvas.tsx`    | Pointer event handling + rendering    |
| Drawing toolbar  | `src/components/drawing/drawing-toolbar.tsx`   | Pen/eraser/color/width controls       |
| Tiptap extension | `src/lib/editor/drawing-block-extension.ts`    | Custom node definition                |
| Node view        | `src/components/editor/drawing-block-view.tsx` | React wrapper for canvas in editor    |
| Offline cache    | `src/lib/offline/document-cache.ts`            | IndexedDB document storage            |
| Service worker   | `src/app/sw.ts`                                | Serwist service worker entry          |
| PWA manifest     | `public/manifest.json`                         | App name, icons, display mode         |

## Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Specific test files
pnpm test src/__tests__/stroke-renderer.test.ts
pnpm test:e2e e2e/drawing.spec.ts
```

## Architecture Quick Reference

```
User draws on iPad
  → Pointer Events API captures pressure + coordinates
  → perfect-freehand generates smooth path outline
  → Canvas 2D renders path in real-time
  → On pointerup: stroke compressed + added to Tiptap node attrs
  → Tiptap transaction triggers onUpdate
  → Auto-save debounce (800ms) → updateDocumentContent server action
  → Supabase stores updated JSONB content
  → Supabase Realtime broadcasts to other devices
  → Desktop browser receives update, re-renders drawing block
```
