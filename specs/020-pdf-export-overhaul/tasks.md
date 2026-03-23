# Tasks: PDF Export Overhaul

**Input**: Design documents from `/specs/020-pdf-export-overhaul/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per project constitution (Principle II: Test-Driven Quality).

**Organization**: Tasks grouped by user story. Browser-native `window.print()` approach — no server dependencies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US5)

---

## Phase 1: Setup

**Purpose**: Add Hebrew font files. No npm dependencies needed — everything is already installed.

- [x] T001 Download Noto Sans Hebrew TTF files (Regular + Bold) and add to `public/fonts/NotoSansHebrew-Regular.ttf` and `public/fonts/NotoSansHebrew-Bold.ttf`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core print export infrastructure that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Create `src/lib/pdf/print-export.ts` — exports `printExportDocument(document: ExportableDocument): void` that: (a) builds HTML string from document data using `buildHtml()` (stubbed for now), (b) opens a new browser window, (c) writes the HTML, (d) waits for `document.fonts.ready`, (e) calls `window.print()`, (f) closes the window after the print dialog completes. Handle errors gracefully (show toast on failure)
- [x] T003 Update `src/hooks/use-export-pdf.ts` — replace the call to `exportDocumentAsPdf()` with `printExportDocument()` from the new module. Preserve `isExporting` state management, toast notifications, and `trackEvent('pdf_exported')` analytics call. Remove the jsPDF import path
- [x] T004 [P] Write unit test in `src/lib/pdf/__tests__/print-export.test.ts` — test that `printExportDocument` calls `window.open()`, writes content, and calls `print()`. Mock `window.open` to return a mock window object

**Checkpoint**: Export button opens a print window with placeholder content.

---

## Phase 3: User Story 1 + 2 — LaTeX Math + Hebrew BiDi Export (Priority: P1) 🎯 MVP

**Goal**: Text-only documents export with correct LaTeX math rendering AND Hebrew bidirectional text. These two P1 stories share the same module (`html-template.ts`) and are delivered together.

**Independent Test**: Create a document with inline math (`$\frac{a}{b}$`), display math, and Hebrew text with inline English. Export as PDF. Verify math renders as notation and Hebrew flows right-to-left.

### Tests for US1 + US2

- [x] T005 [P] [US1] Write unit tests in `src/lib/pdf/__tests__/html-template.test.ts` — test `buildTextDocumentHtml()`: (a) output is valid HTML with `<head>` and `<body>`, (b) includes `@font-face` for Geist Sans, Geist Mono, and Noto Sans Hebrew, (c) includes KaTeX CSS, (d) math expression nodes are rendered via `katex.renderToString()` (not raw LaTeX), (e) includes `dir="auto"` on content wrapper, (f) includes `@page { size: A4 }` print rule, (g) includes `break-after: avoid` on headings

### Implementation for US1 + US2

- [x] T006 [US1] Create `src/lib/pdf/html-template.ts` — exports `buildTextDocumentHtml(content: TipTapJSON, title: string): string` that: (a) generates `<head>` with `@font-face` declarations for Geist Sans (Regular/Bold/Italic), Geist Mono, and Noto Sans Hebrew (Regular/Bold) referencing `/fonts/` URLs, (b) includes KaTeX CSS (via CDN link to the same version used in the app), (c) includes Tailwind typography prose styles matching the editor (`prose prose-sm sm:prose-base`), (d) includes `@page { size: A4; margin: 72pt; }` and `@media print` rules with `break-after: avoid` on `h1, h2, h3`, (e) sets `<title>` to document title
- [x] T007 [US1] Implement TipTap JSON to HTML conversion in `src/lib/pdf/html-template.ts` — use TipTap's `generateHTML()` with the same extensions configured in `src/components/editor/tiptap-editor.tsx` (StarterKit, Underline, TextAlign, TaskList, TaskItem, Link, MathExpression). Before calling `generateHTML()`, walk the TipTap JSON tree and for each `mathExpression` node, call `katex.renderToString(node.attrs.latex, { throwOnError: false, displayMode })` to pre-render the math as KaTeX HTML
- [x] T008 [US2] Add `dir="auto"` attribute to the content wrapper `<div>` in the generated HTML so the browser auto-detects text direction per paragraph. Add `'Noto Sans Hebrew', 'Noto Sans Hebrew Bold'` to the CSS `font-family` fallback chain after Geist Sans
- [x] T009 [US1] Wire `print-export.ts` to use `buildTextDocumentHtml()` for text-only documents (when `pages` is null or empty). Pass the generated HTML to the print window
- [ ] T010 [US1] Write E2E test in `e2e/export-pdf-print.spec.ts` — create a document with math expressions and Hebrew text, click "Export as PDF", verify the print window opens with rendered content (check that the window's document contains KaTeX-rendered elements, not raw LaTeX strings)

**Checkpoint**: A user can export a text document with LaTeX math and Hebrew text. The print window shows exactly what the editor shows. This is the MVP.

---

## Phase 4: User Story 3 — WYSIWYG Fidelity for Rich Text (Priority: P2)

**Goal**: All TipTap node types render correctly in the print output matching the editor.

**Independent Test**: Create a document with H1-H3, bold, italic, lists, code blocks, blockquotes, links. Export. Compare print preview to editor.

### Tests for US3

- [ ] T011 [P] [US3] Write unit tests in `src/lib/pdf/__tests__/html-template.test.ts` — test edge cases: (a) invalid LaTeX renders KaTeX error HTML (red text), not empty space, (b) empty document produces valid minimal HTML with blank body, (c) code blocks get `font-family: 'GeistMono'` and background color

### Implementation for US3

- [ ] T012 [US3] Refine print CSS in `src/lib/pdf/html-template.ts` to match editor rendering — ensure: headings (H1: 2.25em bold, H2: 1.5em bold, H3: 1.25em bold), bullet/ordered/task lists (correct indentation + markers), code blocks (GeistMono, gray background `#f3f4f6`), blockquotes (left border + indent), links (blue `#2563eb` + underline), horizontal rules, highlights. Reference the Tailwind typography prose class constants
- [ ] T013 [US3] Handle edge cases in `src/lib/pdf/html-template.ts` and `src/lib/pdf/print-export.ts`: (a) empty document → produce valid minimal HTML with blank page, (b) invalid LaTeX → KaTeX's `throwOnError: false` shows red error text, (c) long unbroken text → CSS `overflow-wrap: break-word` prevents overflow
- [ ] T014 [US3] Write E2E test in `e2e/export-pdf-richtext.spec.ts` — create a document with headings, lists, code blocks, and formatted text, trigger export, verify print window opens with styled content

**Checkpoint**: All text formatting features render correctly in the print output.

---

## Phase 5: User Story 4 — Canvas Pages with Strokes (Priority: P2)

**Goal**: Canvas pages with freehand strokes, text boxes, and backgrounds export via browser print as vector graphics.

**Independent Test**: Create a canvas document with strokes and text boxes, export, verify strokes appear in the print preview.

### Tests for US4

- [ ] T015 [P] [US4] Write unit tests in `src/lib/pdf/__tests__/stroke-to-svg.test.ts` — test: (a) stroke with 3+ points produces valid SVG `<path>` with `d` attribute, (b) stroke color maps to `fill`, (c) stroke opacity maps to `fill-opacity`, (d) empty strokes (0 points) return empty string
- [ ] T016 [P] [US4] Write unit tests in `src/lib/pdf/__tests__/page-background-svg.test.ts` — test: (a) "blank" returns empty string, (b) "lined" produces SVG with horizontal `<line>` elements, (c) "grid" produces horizontal + vertical lines, (d) "dotted" produces `<circle>` elements

### Implementation for US4

- [ ] T017 [P] [US4] Create `src/lib/pdf/stroke-to-svg.ts` — exports `strokeToSvgPath(stroke: Stroke): string` that calls `getStroke()` from perfect-freehand with the stroke's points and width, converts the polygon points to an SVG `<path d="M...L...Z">` string with `fill` (stroke.color), `fill-opacity` (stroke.opacity), and `stroke="none"`
- [ ] T018 [P] [US4] Create `src/lib/pdf/page-background-svg.ts` — exports `renderBackgroundSvg(pageType: string, width: number, height: number): string` that generates SVG elements for lined (horizontal lines at 32pt spacing), grid (horizontal + vertical lines), dotted (circles at intersections), or blank (empty string). Match color `rgb(200,200,200)` from current `background-renderer.ts`
- [ ] T019 [US4] Add `buildCanvasPageHtml(pages: CanvasPage[], canvasType: string, title: string): string` to `src/lib/pdf/html-template.ts` — generates HTML with: (a) same `<head>` as text documents (fonts, KaTeX, print CSS), (b) `@page { size: 794pt 1123pt; margin: 0; }` for canvas page dimensions, (c) each page as a fixed-size `<div>` with `break-after: always`, (d) background SVG layer, (e) absolute-positioned SVG overlay with all stroke paths, (f) absolute-positioned text box `<div>`s with TipTap HTML content at correct (x, y, width, height), (g) flow content rendered via `generateHTML()` if present
- [ ] T020 [US4] Update `src/lib/pdf/print-export.ts` to route canvas-only documents through `buildCanvasPageHtml()`
- [ ] T021 [US4] Write E2E test in `e2e/export-pdf-canvas.spec.ts` — create a canvas document with strokes and a text box, trigger export, verify print window opens with SVG content

**Checkpoint**: Canvas pages with strokes export as vector graphics via browser print.

---

## Phase 6: User Story 5 — Mixed Documents + Combined Content (Priority: P3)

**Goal**: Mixed documents (canvas + text) and combined scenarios (Hebrew + LaTeX + strokes) all work.

**Independent Test**: Create a document with canvas pages followed by text pages with Hebrew + LaTeX. Export. Verify all pages render correctly.

### Implementation for US5

- [ ] T022 [US5] Add `buildMixedDocumentHtml(document: ExportableDocument): string` to `src/lib/pdf/html-template.ts` — combines canvas pages and text content into a single HTML document. Canvas pages use their custom size; text content uses A4. Use CSS `@page` named pages or size-specific sections with appropriate `break-before: page` to handle the transition between page sizes
- [ ] T023 [US5] Update `src/lib/pdf/print-export.ts` to detect mixed documents (has both `pages` and `content`) and route through `buildMixedDocumentHtml()`
- [ ] T024 [US5] Write E2E test in `e2e/export-pdf-mixed.spec.ts` — create a mixed document (canvas + text), trigger export, verify print window opens with both content types

**Checkpoint**: All document types export correctly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Remove old code, update tests, clean up.

- [ ] T025 Remove old jsPDF rendering modules: `src/lib/pdf/export-pdf.ts`, `src/lib/pdf/tiptap-to-pdf.ts`, `src/lib/pdf/text-document-renderer.ts`, `src/lib/pdf/font-loader.ts`, `src/lib/pdf/math-renderer.ts`, `src/lib/pdf/canvas-page-renderer.ts`, `src/lib/pdf/stroke-renderer.ts`, `src/lib/pdf/background-renderer.ts`
- [ ] T026 Remove old unit tests for deleted modules: `src/lib/pdf/__tests__/export-pdf.test.ts`, `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts`, `src/lib/pdf/__tests__/text-document-renderer.test.ts`, `src/lib/pdf/__tests__/font-loader.test.ts`, `src/lib/pdf/__tests__/canvas-page-renderer.test.ts`, `src/lib/pdf/__tests__/stroke-renderer.test.ts`, `src/lib/pdf/__tests__/background-renderer.test.ts`
- [ ] T027 Update existing E2E tests (`e2e/export-pdf-editor.spec.ts`, `e2e/export-pdf-dashboard.spec.ts`) to work with the print-based export flow
- [ ] T028 Remove `jspdf` and `svg2pdf.js` from `package.json` if not used elsewhere in the codebase. Run `pnpm install` to update lockfile
- [ ] T029 Run full test suite: `pnpm test`, `pnpm lint`, `pnpm format:check`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (font files)
    │
Phase 2: Foundational (print-export.ts + hook update)
    │
Phase 3: US1+US2 — LaTeX + Hebrew (P1) 🎯 MVP
    │
    ├── Phase 4: US3 — Rich Text Fidelity (P2)
    │
    └── Phase 5: US4 — Canvas Pages (P2) [can parallel with Phase 4]
            │
            Phase 6: US5 — Mixed Documents (P3) [needs Phase 4 + 5]
                │
                Phase 7: Polish
```

### Parallel Opportunities

- **Phase 1**: Single task, no parallelism needed
- **Phase 2**: T004 (test) can run in parallel with T002 (implementation)
- **Phase 3**: T005 (test) can run in parallel with T006 (implementation)
- **Phase 4 + 5**: Can run in parallel — US3 (CSS refinement) and US4 (canvas SVG) are independent
- **Phase 5**: T015, T016, T017, T018 — four tasks across four files, all parallelizable

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3)

1. Add Hebrew font files
2. Build print-export.ts + update hook
3. Build html-template.ts with KaTeX + Hebrew + prose CSS
4. **STOP and VALIDATE**: Export a doc with math + Hebrew → verify exact match
5. This alone fixes all three critical bugs (LaTeX, Hebrew, fragile code)

### Incremental Delivery

1. MVP → LaTeX + Hebrew works → demonstrate
2. Add US3 → all rich text renders correctly
3. Add US4 → canvas pages export as vectors
4. Add US5 → mixed documents work
5. Polish → old code removed, clean test suite

---

## Notes

- No npm dependencies to install — all libraries already in project
- No server-side changes — entirely client-side
- Old jsPDF modules kept until Phase 7 for rollback safety
- Print dialog shows once per export — standard UX pattern (Google Docs, Notion, Overleaf)
- Total new code: ~4 files, ~300-400 lines (replacing ~1,085 lines of jsPDF code)
