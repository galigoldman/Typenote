# Research: Paste Images as Canvas Objects

**Feature**: 040-image-paste-select
**Date**: 2026-04-27

## Decision 1: Image Storage Strategy

**Decision**: Store images as base64 data URLs directly in the `pages` JSONB column, compressed and resized on paste.

**Rationale**:

- Keeps the architecture simple — images travel with page data, no extra HTTP requests on load
- Matches existing pattern where all canvas content (strokes, text boxes) lives in JSONB
- No new Supabase Storage bucket, migration, or RLS policies needed
- Automatic persistence through existing `useDocumentSync` save flow
- Works offline after first load

**Alternatives considered**:

- **Supabase Storage with URL references**: Better for large/many images, but adds complexity (new bucket, signed URLs, fetch on load, garbage collection). Overkill for MVP where users paste a few screenshots per document.
- **Hybrid (small → JSONB, large → Storage)**: Optimal long-term but doubles implementation complexity. Can migrate later if JSONB bloat becomes an issue.

**Mitigations for JSONB size**:

- Resize images to max 1200px on longest dimension before storing (prevents multi-MB payloads)
- Convert to JPEG at 80% quality for photographs, keep PNG for screenshots with transparency
- A typical resized screenshot ≈ 50-150KB base64 → manageable for JSONB
- Page auto-save already debounces at 800ms, so payload size won't cause rapid large writes

## Decision 2: Clipboard Access Method

**Decision**: Listen for the browser `paste` event on the document/window level to intercept system clipboard images.

**Rationale**:

- The current paste system is internal-only (React ref-based `clipboardRef` for copied strokes/text boxes)
- System clipboard images come through `ClipboardEvent.clipboardData.items` with type `image/*`
- Need to read the image as a `Blob`, convert to `HTMLImageElement` to get dimensions, then to base64 data URL via canvas
- Must check for image items BEFORE falling through to the existing internal paste logic

**Alternatives considered**:

- **Clipboard API (`navigator.clipboard.read()`)**: More modern but requires explicit permission and has spotty browser support for images. The `paste` event is universally supported and fires automatically.

## Decision 3: Image Resize Behavior

**Decision**: All resize handles lock aspect ratio for images. No free-form stretch.

**Rationale**:

- Distorted images look unprofessional and are almost never intentional
- Simplifies the resize logic — just scale uniformly from the opposite anchor point
- Matches user expectation from tools like Google Slides, Figma, Notion
- The existing resize system already supports per-object behavior differentiation (strokes scale freely, text boxes adjust `fontScale`)

**Alternatives considered**:

- **Shift-key to unlock aspect ratio**: Adds complexity, rarely needed for note-taking
- **Free-form stretch by default**: Against user expectations for images

## Decision 4: Layering Order

**Decision**: Images render above strokes but below text boxes.

**Rationale**:

- Strokes are background annotations (pen marks) — images should overlay them
- Text boxes need to remain readable on top of everything
- This matches the visual hierarchy: background → strokes → images → text
- Consistent with how presentation tools layer objects

## Decision 5: Image Data Model

**Decision**: New `ImageObject` interface alongside `Stroke` and `TextBox`, stored in `CanvasPage.images` array.

**Rationale**:

- Follows the existing pattern — each object type has its own array on `CanvasPage`
- Clean separation of concerns for hit testing, rendering, and serialization
- `aspectRatio` stored alongside dimensions to simplify proportional resize calculations
- `src` field holds the base64 data URL

## Decision 6: PDF Export Integration

**Decision**: Render images as `<img>` tags with base64 `src` in the HTML template, positioned absolutely.

**Rationale**:

- The active PDF export system (print-based) generates HTML and delegates to `window.print()`
- Adding `<img>` tags with absolute positioning matches how text boxes are already rendered
- Browser's print engine handles image rendering natively — no extra library needed
- Base64 src eliminates need for external URL fetching during export
