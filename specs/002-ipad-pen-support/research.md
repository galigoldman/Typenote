# Research: iPad Optimization & Apple Pencil Support

## Decision 1: PWA Library Approach

**Decision**: Use `@serwist/next` (Serwist) for PWA integration with Next.js

**Rationale**:

- `next-pwa` (the classic library) is no longer actively maintained and incompatible with Next.js 16
- Serwist is the maintained successor/fork that supports the Next.js App Router and latest versions
- Provides automatic service worker generation, precaching, and runtime caching strategies
- Minimal configuration — wraps `next.config.ts` and generates service worker automatically
- Well-documented with TypeScript support

**Alternatives Considered**:

- **Manual service worker**: Full control but significant boilerplate and maintenance burden; not worth it for a standard PWA setup
- **next-pwa**: Unmaintained, no Next.js 16 support
- **Workbox directly**: Low-level, Serwist already wraps Workbox with Next.js-specific optimizations

---

## Decision 2: Drawing Library for Apple Pencil Strokes

**Decision**: Use `perfect-freehand` for stroke rendering combined with raw Canvas 2D for display

**Rationale**:

- `perfect-freehand` is a tiny (~2KB) library that converts pressure-sensitive points into smooth, variable-width SVG/Canvas paths
- Designed specifically for stylus input with pressure, tilt support
- Returns an array of points forming the stroke outline, which can be rendered on Canvas 2D or as SVG paths
- Used by tldraw, Excalidraw, and other proven drawing apps
- Purely computational — no opinion on rendering target, so we can render to Canvas 2D for performance
- Canvas 2D rendering via `Path2D` objects ensures sub-16ms frame times even with hundreds of strokes

**Alternatives Considered**:

- **Raw Canvas 2D only**: Would need to implement pressure-to-width interpolation, stroke smoothing, and path generation manually — `perfect-freehand` solves this in 2KB
- **Fabric.js / Konva.js**: Full canvas frameworks with large bundle sizes (200KB+), include features we don't need (shapes, transforms, layers), adds complexity
- **SVG rendering**: Scales poorly with hundreds of strokes due to DOM node count; Canvas 2D is more performant for freehand drawing
- **tldraw**: Full collaborative whiteboard — massive dependency (500KB+), opinionated UI, overkill for inline drawing blocks

---

## Decision 3: Tiptap Drawing Block Integration

**Decision**: Create a custom Tiptap Node extension (`drawingBlock`) that renders a React component with an HTML5 Canvas

**Rationale**:

- Tiptap supports custom Node Views with React components via `ReactNodeViewRenderer`
- A drawing block becomes a first-class document node alongside paragraphs, headings, etc.
- Drawing data serialized as JSON in the node's `attrs` — flows through Tiptap's `getJSON()` and `setContent()` naturally
- Undo/redo integration comes free via ProseMirror's transaction history
- Inline placement between text blocks requires the node to be a "block" type (not inline atom)

**Key Implementation Details**:

- Node name: `drawingBlock`
- Node type: block (not inline)
- Attrs: `{ strokes: [], width: number, height: number, background: string }`
- Strokes stored as compressed JSON in attrs
- React component renders Canvas 2D, handles pointer events
- On stroke completion → update node attrs via `editor.commands.updateAttributes()`

**Alternatives Considered**:

- **Separate drawing overlay on top of editor**: Would break document flow, complicate serialization, and not integrate with undo/redo
- **Tiptap Extension without NodeView**: Insufficient — need full React component lifecycle for Canvas rendering and pointer event handling
- **Store drawings outside document content**: Would break real-time sync (content is the sync unit) and complicate the data model

---

## Decision 4: Stroke Data Serialization Format

**Decision**: Store strokes as a JSON array within the Tiptap node attributes, using a compact point format

**Rationale**:

- Tiptap document content is already stored as JSONB in Supabase
- Adding stroke data to node attrs keeps everything in one document payload
- Compact format: each point as `[x, y, pressure]` tuple (array) instead of `{x, y, pressure}` object — reduces JSON size by ~40%
- A typical drawing with 100 strokes of 50 points each = ~60KB of JSON, well within Supabase's JSONB limits

**Format**:

```json
{
  "type": "drawingBlock",
  "attrs": {
    "width": 800,
    "height": 400,
    "background": "transparent",
    "strokes": [
      {
        "points": [[100, 50, 0.5], [102, 51, 0.6], ...],
        "color": "#000000",
        "width": 2,
        "tool": "pen"
      }
    ]
  }
}
```

**Alternatives Considered**:

- **Base64-encoded canvas image**: Loses editability (can't undo individual strokes), much larger payload (image data >> stroke data)
- **Separate storage table for strokes**: Complicates sync, requires joins, breaks the single-document-content-unit pattern
- **Binary format (protobuf/msgpack)**: Would need encode/decode steps, not human-debuggable, JSONB storage already handles JSON efficiently

---

## Decision 5: Offline Storage Strategy

**Decision**: Use Service Worker Cache API for app shell + IndexedDB (via `idb-keyval`) for document data

**Rationale**:

- **Cache API** (via Serwist): Best for static assets (HTML, CSS, JS, fonts, images). Serwist handles this automatically with precaching and runtime caching strategies
- **IndexedDB**: Best for structured data (documents). Can store large JSON objects, supports transactions, available in service workers
- `idb-keyval` is a tiny (~600B) promise-based wrapper around IndexedDB — avoids the verbose native API
- Documents cached on open, updated on save, served from cache when offline
- Offline edits queued in IndexedDB, synced on reconnect via existing auto-save mechanism

**Alternatives Considered**:

- **localStorage**: 5MB limit, synchronous API, not available in service workers
- **Cache API for everything**: Not designed for structured data, awkward for document CRUD
- **Full offline-first DB (PouchDB, RxDB)**: Massive dependencies, replicate Supabase functionality, overkill for caching recent documents

---

## Decision 6: Touch Optimization Approach

**Decision**: Add responsive button size variants and conditional touch-friendly CSS using Tailwind's `@media (pointer: coarse)` strategy

**Rationale**:

- `pointer: coarse` media query accurately detects touch devices (iPad, phones) vs. precision pointer devices (mouse)
- More reliable than screen width for determining input type (an iPad in landscape has desktop-like width but still needs large touch targets)
- Can create Tailwind utility classes or custom CSS that increases button sizes to 44px+ only on touch devices
- Hover-dependent UI (action menus on cards) switches to always-visible or long-press triggered on touch devices

**Key Changes**:

- Editor toolbar buttons: 24px → 44px on touch devices
- Card action buttons: Always visible on touch (no hover dependency)
- Sidebar: Collapsible on tablet widths (toggled via hamburger button)
- Add `touch-action: none` on drawing canvas to prevent browser gestures

**Alternatives Considered**:

- **Width-based responsive only**: iPad landscape (1024px+) would get desktop-sized buttons despite being touch
- **JavaScript touch detection**: `navigator.maxTouchPoints` works but CSS media queries are cleaner and don't cause layout shifts
- **Separate mobile/tablet layout**: Too much duplication, `pointer: coarse` gives us targeted changes with minimal code
