# Research: 008-inline-material-viewer

**Date**: 2026-03-16

## Decision 1: PDF Rendering Library

**Decision**: Use `pdfjs-dist` (Mozilla PDF.js) for client-side PDF page rendering.

**Rationale**:

- Industry standard for in-browser PDF rendering (used by Firefox, many web apps)
- Renders PDF pages to HTML Canvas — directly compatible with existing canvas-page architecture
- Supports all PDF types (text-based, scanned/image-based, mixed)
- No server-side processing needed — runs entirely in the browser
- Well-maintained, actively developed by Mozilla
- Lightweight when using only the rendering API (no viewer UI needed)

**Alternatives considered**:

- **react-pdf**: React wrapper around pdfjs-dist. Adds abstraction but we need low-level canvas access for our custom rendering pipeline. Rejected — unnecessary wrapper.
- **Server-side pre-rendering** (e.g., render PDF pages to PNGs on upload, store in Supabase Storage): Faster subsequent loads but adds storage costs, upload processing time, and complexity. Rejected for initial implementation — client-side rendering is simpler and sufficient.
- **iframe with signed URL**: Embed browser's native PDF viewer in an iframe. Cannot overlay canvas drawing tools. Rejected — fundamentally incompatible with annotation requirement.

## Decision 2: Material-to-Document Bridge

**Decision**: Create a real `document` record in the database when a material is first opened. Link it via a new `material_id` column on the `documents` table. Subsequent opens navigate to the existing document.

**Rationale**:

- "Open like a regular document" means it literally IS a regular document — with a PDF background
- All existing infrastructure works automatically: auto-save, realtime sync, AI chat, breadcrumbs, undo/redo
- No new routes, no new page components, no new server actions for saving
- The document's `pages` JSONB stores annotations (strokes, text) as usual
- Each canvas page references a PDF page number for background rendering

**Alternatives considered**:

- **New route `/dashboard/materials/[materialId]`**: Separate viewer page with its own save logic. Rejected — duplicates document infrastructure, violates "open like a regular document" requirement.
- **Virtual document (no DB record)**: Render PDF in canvas editor without persisting a document. Rejected — annotations wouldn't persist across sessions.
- **Store PDF page images in JSONB**: Render PDF pages to data URLs and embed in pages JSONB. Rejected — massive JSONB bloat (each page image could be 500KB+), impractical for 30+ page PDFs.

## Decision 3: PDF Background Rendering Strategy

**Decision**: Render PDF pages client-side on each document load using pdfjs-dist. Store only the page number reference (not the rendered image) in the CanvasPage data.

**Rationale**:

- No additional storage costs — the original PDF in Supabase Storage is the single source of truth
- Rendering is fast for typical course materials (lecture slides, 10-50 pages)
- Cached by browser after first render within a session
- Signed URL for the PDF is fetched once on page load

**Trade-offs**:

- Slightly slower initial load vs. pre-rendered images (must download PDF + render)
- Requires PDF to still be available in storage (if deleted, background disappears but annotations survive)
- SC-004 target (5 seconds for <10MB) is achievable — pdfjs renders a single page in ~100-200ms

## Decision 4: Canvas Page Background Extension

**Decision**: Add a `pdfPage` field to the `CanvasPage` type. When present, the canvas page renderer fetches and renders the corresponding PDF page as the bottom-most layer (below strokes, text, everything).

**Rationale**:

- Minimal change to existing type — one optional field
- Rendering layer fits naturally into the existing 6-layer stack in canvas-page.tsx (insert as Layer 0, before the CSS background)
- Eraser automatically only affects strokes (Layer 2) — PDF background is a separate rendered layer
- Zoom scales the entire page container — PDF background scales with it automatically

## Decision 5: Document Title and Metadata

**Decision**: When creating a document from a material, auto-generate the title from the material's file name (without extension). Link to the same course and week as the material.

**Rationale**:

- Consistent with `createWeekDocument` which auto-generates titles
- Course/week linking enables AI context (same as regular week documents)
- Student can rename the document title as needed (existing functionality)
