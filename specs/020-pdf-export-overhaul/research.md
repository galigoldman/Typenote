# Research: PDF Export Overhaul

**Branch**: `020-pdf-export-overhaul` | **Date**: 2026-03-23

## Research Questions & Findings

### RQ-1: Why is the current jsPDF approach fundamentally broken?

**Decision**: The current jsPDF-based manual rendering pipeline cannot be fixed — it must be replaced.

**Rationale**:
1. **RTL/BiDi is unfixable in jsPDF**: The library's maintainers stated in [issue #2178](https://github.com/parallax/jsPDF/issues/2178) that mixed-direction text cannot be properly supported within jsPDF's architecture.
2. **LaTeX math rendering exists but isn't integrated**: A `math-renderer.ts` module (274 lines) exists but requires async execution. The synchronous pipeline can't use it without a full rewrite.
3. **It's not WYSIWYG**: The approach rebuilds every TipTap node type as manual drawing commands (~1,085 lines). The output never exactly matches the editor.

---

### RQ-2: What is the best rendering approach for EXACT WYSIWYG PDF export?

**Decision**: Browser-native print via `window.print()` on a styled HTML document.

**Rationale**:
- **EXACT match**: The browser IS the rendering engine for both the editor and the PDF. Same HTML, same CSS, same output.
- **KaTeX renders natively**: KaTeX is HTML/CSS — the browser already knows how to render it. Zero extra code.
- **BiDi/RTL handled natively**: Chrome implements the full Unicode BiDi algorithm. Hebrew, Arabic, and mixed-direction text works with `dir="auto"`.
- **Real selectable text**: Unlike html2canvas approaches, browser print produces real PDF text — not rasterized images.
- **100% client-side**: No server, no headless browser, no Puppeteer, no deployment constraints.
- **~150 lines replaces ~1,000 lines**: Build an HTML template + CSS, call print(). Done.
- **Future-proof**: Any new TipTap extension that renders in the editor automatically works in export.

**Alternatives considered and rejected**:

| Approach | Why rejected |
|----------|-------------|
| Puppeteer/headless Chrome (server-side) | Heavy — adds server dependency, Vercel bundle constraints, cold starts, latency. Overkill. |
| html2pdf.js / html2canvas | Rasterizes text to images. User explicitly requires real selectable text. |
| @react-pdf/renderer | No KaTeX support; RTL has bugs; requires complete rewrite as React components. |
| TipTap Conversion API | Paid; no documented math/RTL support; canvas pages unsupported. |
| Fix jsPDF BiDi with bidi-js | Possible but complex; still won't match editor exactly; maintaining ~1,000 lines of manual layout. |

---

### RQ-3: How does the window.print() approach work?

**Implementation**:
1. Take TipTap JSON → call `generateHTML()` with the same extensions the editor uses → get HTML
2. For math nodes: call `katex.renderToString(latex)` client-side to produce rendered math HTML
3. Build a full HTML document with: editor CSS (Tailwind typography) + KaTeX CSS + `@font-face` for Hebrew font + `@media print` / `@page` rules
4. Open in a new browser window (or hidden iframe)
5. Call `window.print()` — browser renders to PDF natively
6. User clicks "Save as PDF" in the print dialog (one click)

**Trade-off**: The print dialog requires one user click. This is how Google Docs, Notion, and most professional apps handle export. It's a well-understood UX pattern.

---

### RQ-4: How to handle canvas pages (freehand strokes)?

**Decision**: Convert strokes to SVG paths and include them in the print HTML.

**Rationale**:
- `perfect-freehand`'s `getStroke()` returns polygon points → trivially convert to SVG `<path>`
- The browser prints SVG as vector paths (not rasterized)
- Text boxes are positioned HTML divs — they print natively
- Page backgrounds (lined/grid/dotted) render as SVG patterns
- Single unified pipeline for all content types

---

### RQ-5: How to handle fonts (Hebrew)?

**Decision**: Add Noto Sans Hebrew to `/public/fonts/` and include `@font-face` declarations in the print HTML.

**Details**:
- The print window loads fonts via `@font-face` referencing `/fonts/` URLs
- The browser's `document.fonts.ready` ensures fonts load before print triggers
- Geist Sans/Mono (existing) + Noto Sans Hebrew (new) cover all needed characters

---

### RQ-6: How to handle pagination and page layout?

**Decision**: Use CSS `@page` rules and `break-*` properties.

**Details**:
- `@page { size: A4; margin: 72pt; }` for text documents
- Custom `@page` size for canvas pages (794×1123 pt)
- `break-after: avoid` on headings prevents orphaned headings
- `break-inside: avoid` on code blocks and blockquotes
- `break-before: always` between canvas pages
- The browser's native print layout engine handles all pagination

---

## Summary of Technical Decisions

| Decision | Choice | Key reason |
|----------|--------|-----------|
| Rendering approach | Browser-native `window.print()` | EXACT WYSIWYG, real text, zero server dependency |
| Math rendering | KaTeX `renderToString()` client-side | Already available, native browser rendering |
| Hebrew/RTL | `dir="auto"` + Noto Sans Hebrew font | Browser's native Unicode BiDi algorithm |
| Canvas strokes | SVG `<path>` in print HTML | Vector output, single pipeline |
| Pagination | CSS `@page` + `break-*` properties | Browser handles layout natively |
| New dependencies | None (only font files) | Everything already available client-side |
