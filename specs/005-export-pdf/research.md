# Research: Export as PDF

**Feature**: 005-export-pdf
**Date**: 2026-03-13

## R1: PDF Library Selection

**Decision**: jsPDF + svg2pdf.js

**Rationale**: jsPDF provides the exact low-level APIs needed for this feature:

- `moveTo`/`lineTo`/`closePath`/`fill` maps directly to perfect-freehand stroke outline polygons
- Custom page sizes supported (794x1123 for canvas pages, A4 for text pages), mixable per document
- Exact text positioning with `text(string, x, y)` for text box placement
- TTF font embedding via `addFileToVFS` + `addFont`
- svg2pdf.js addon converts KaTeX SVG elements to native PDF vector paths (~30KB additional)
- Combined bundle ~125KB minzipped

**Alternatives considered**:

- **pdf-lib**: Better font support (WOFF2 native), has `drawSvgPath()`, but last published 2021, smaller community. Would need manual SVG element decomposition.
- **pdfmake**: Declarative JSON model is a poor fit for arbitrary coordinate-based stroke placement. ~300KB+ bundle.
- **PDFKit**: Node.js only, not suitable for client-side generation.

## R2: Font Embedding Strategy

**Decision**: Bundle Geist Sans and Geist Mono as TTF files, register with jsPDF

**Rationale**: The app uses Geist Sans (body text) and Geist Mono (code blocks) loaded via `next/font/google`. jsPDF only supports TTF fonts (not WOFF2), so we need to:

1. Download Geist TTF files from Google Fonts (Regular, Bold, Italic, BoldItalic for Sans; Regular for Mono)
2. Convert to base64 strings at build time (or load via fetch at export time)
3. Register with jsPDF using `addFileToVFS` + `addFont`

**Size impact**: Each TTF file is ~100-300KB. For the PDF output file, only the font subsets actually used in the document get embedded by jsPDF.

**KaTeX fonts**: Not needed for direct embedding — KaTeX math will be rendered as SVG and converted to PDF vector paths via svg2pdf.js.

## R3: Stroke Rendering Pipeline (Canvas → PDF)

**Decision**: Reuse `perfect-freehand` + convert outline polygon to jsPDF path commands

**Rationale**: The existing canvas rendering pipeline is:

1. `stroke.points` (StrokePoint[]) → `getStroke()` → outline polygon ([x, y][] points)
2. `getSvgPathFromStroke()` → SVG path string (M, Q, T, Z commands)
3. `new Path2D(pathData)` → `ctx.fill()` on canvas

For PDF, we skip steps 2-3 and instead:

1. Same: `getStroke()` to produce outline polygon points
2. Iterate points with `doc.moveTo(x, y)` / `doc.lineTo(x, y)` / `doc.closePath()` / `doc.fill()`
3. Apply color via `doc.setFillColor()` and opacity via `doc.setGState()`

This approach uses the outline points directly (no SVG parsing needed), which is simpler and more reliable than trying to parse the SVG path string.

**Alternative considered**: Using svg2pdf.js to parse the SVG path string. Rejected because it adds unnecessary complexity when we already have the raw polygon points.

## R4: KaTeX Math in PDF

**Decision**: Render KaTeX to SVG in a hidden DOM element, embed via svg2pdf.js

**Rationale**:

1. Use `katex.renderToString(latex)` to produce HTML/SVG markup
2. Insert into a hidden DOM element to get a rendered SVG element
3. Use `doc.svg(svgElement, { x, y, width, height })` from svg2pdf.js to embed as vector PDF content

**Risk**: KaTeX SVG uses `<use>` references, custom viewBoxes, and CSS-driven positioning that may not map perfectly in svg2pdf.js. Mitigation: test early with representative math expressions. Fallback: rasterize KaTeX SVG to canvas, export as high-DPI PNG, embed as image.

## R5: Text-Only Document Pagination

**Decision**: Custom paginator that walks TipTap JSON nodes and tracks vertical position

**Rationale**: No existing library handles TipTap-JSON-to-paginated-PDF. We build a simple paginator:

1. Parse TipTap JSON document node tree
2. For each node, calculate rendered height (based on font size, line count after wrapping)
3. Track cumulative y-position; when it exceeds page height minus bottom margin, add a new page
4. Orphan prevention: if a heading node would land in the bottom 15% of the page, push to next page
5. Use `jsPDF.splitTextToSize()` to calculate line wrapping and height

## R6: Page Background Patterns

**Decision**: Render backgrounds as jsPDF vector primitives

**Rationale**: Each background type maps to simple PDF drawing commands:

- `blank`: White rectangle fill only
- `lined`: Horizontal lines every 32px using `doc.line(x1, y1, x2, y2)` with light gray color
- `grid`: Horizontal + vertical lines every 32px
- `dotted`: Small filled circles at every 32px intersection using `doc.circle(x, y, r, 'F')`

This produces vector patterns that are resolution-independent and small in file size.
