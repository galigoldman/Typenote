# Export as PDF — Design Document

**Date:** 2026-03-12
**Status:** Approved

## Summary

Client-side PDF export for Typenote documents, modeled after GoodNotes. Users can export any document (text-only, canvas, or mixed) as a PDF with vector strokes, selectable text, and page backgrounds — directly from the editor toolbar or dashboard.

## Requirements

- Export any document type: text-only, canvas (strokes + text boxes), or mixed
- Client-side generation using jsPDF (no server round-trip)
- Two trigger points: editor toolbar button and dashboard document card context menu
- WYSIWYG: include page backgrounds (blank/lined/grid/dotted)
- Vector strokes (crisp at any zoom, like GoodNotes)
- Selectable text (font embedding, like GoodNotes)
- Text-only documents paginated into A4 pages (Google Docs style)
- Direct browser download as `{document title}.pdf`

## Architecture

```
Document Data (content JSONB / pages JSONB)
    |
PDF Export Service (client-side module)
    |-- Canvas Page Renderer
    |   |-- Background Pattern Renderer (blank/lined/grid/dotted)
    |   |-- Stroke Renderer (perfect-freehand paths -> PDF vector paths)
    |   |-- TextBox Renderer (TipTap JSON -> positioned PDF text)
    |-- Text Document Renderer
    |   |-- TipTap JSON Parser (headings, paragraphs, lists, tasks, etc.)
    |   |-- Math Renderer (KaTeX -> SVG -> PDF embedded SVG)
    |   |-- Paginator (A4 page breaks, margins)
    |-- jsPDF (low-level PDF construction)
         |
    Blob -> browser download
```

**Entry point:** `exportDocumentAsPdf(document)` — inspects the document, delegates to the right renderer based on content type.

**Pure function approach:** Takes document data in, produces PDF blob out. No React dependencies, no DOM manipulation. Callable from both editor and dashboard.

## Canvas Page Rendering

Handles documents with the `pages` JSONB — pen strokes, text boxes, backgrounds on A4 pages (794x1123 pts).

### Background Patterns

- Each page's `pageType` determines its background
- `blank` -> white fill only
- `lined` -> horizontal lines every 32px (light gray)
- `grid` -> horizontal + vertical lines every 32px
- `dotted` -> dots at every 32px intersection
- All rendered as PDF vector primitives (lines/circles), not images

### Stroke Rendering

- Read each stroke's `points` array (x, y, pressure)
- Run through `perfect-freehand`'s `getStroke()` to get outline polygon
- Convert outline to filled PDF path via jsPDF's path drawing API
- Preserve `color`, `width`, `opacity` from each stroke
- Produces crisp vector strokes identical to screen rendering

### TextBox Rendering (like GoodNotes)

- Each text box has fixed (x, y, width, height) coordinates
- Embed the app's actual fonts into jsPDF
- Place text at exact PDF coordinates matching the text box position
- Parse TipTap JSON inside each text box, render with correct font/size/style
- Math nodes -> KaTeX -> SVG -> embed in PDF at text box position

### Page Dimensions

- jsPDF page set to 794x1123 pts to match canvas exactly
- One canvas page = one PDF page

## Text Document Rendering

Handles text-only documents (the `content` JSONB — TipTap rich text with no canvas pages).

### Font Strategy

- Identify the app's fonts from CSS, convert to base64, register with jsPDF
- All text uses the same fonts as the editor

### Pagination (Google Docs style)

- A4 page size (595x842 pt standard PDF points)
- Margins: ~72pt (1 inch) on all sides -> usable area ~451x698 pt
- Track vertical cursor, insert page breaks on overflow
- Headings avoid orphans (push to next page if near bottom)

### TipTap Node Mapping

- `heading` (1-3) -> Bold text, size 24/20/16pt
- `paragraph` -> Regular text, 12pt, with line wrapping
- `bulletList` / `listItem` -> Indented with bullet character
- `orderedList` / `listItem` -> Indented with number prefix
- `taskList` / `taskItem` -> Checkbox + text
- `bold` / `italic` / `underline` -> Font style changes
- `code` -> Monospace font
- `link` -> Blue underlined text (clickable PDF link)
- `highlight` -> Yellow background rectangle behind text
- `mathExpression` -> KaTeX -> SVG -> embedded in PDF inline

### Text Wrapping

- jsPDF's `splitTextToSize()` for wrapping to usable width
- Calculate wrapped block height before rendering to check for page breaks

## Mixed Documents

- Canvas pages rendered first (primary visual content)
- Text content follows as additional paginated pages

## Export UX

### Editor Toolbar

- "Export as PDF" button in toolbar/menu
- Document data already in memory — export directly
- Brief loading spinner ("Exporting...")

### Dashboard Context Menu

- "Export as PDF" in document card "..." menu
- Fetch full document data first, then generate
- Same loading indicator

### Download

- Generate PDF blob -> trigger browser download as `{document title}.pdf`
- No preview/print dialog — direct download
- On failure: toast notification with retry option

## Technology

- **jsPDF** — PDF construction, vector paths, font embedding
- **perfect-freehand** — stroke outline generation (already in project)
- **KaTeX** — LaTeX to SVG (already in project)

## Testing

- Unit: background patterns, stroke rendering, text positioning, TipTap parsing, pagination, math
- Integration: full document export for each content type
- E2E: download trigger from editor and dashboard
