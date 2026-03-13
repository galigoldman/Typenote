# Tasks: Export as PDF

**Input**: Design documents from `/specs/005-export-pdf/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Included per constitution Principle II (Test-Driven Quality).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and prepare font assets

- [x] T001 Install jsPDF and svg2pdf.js dependencies via `pnpm add jspdf svg2pdf.js` and add `@types/jspdf` if needed
- [x] T002 Download Geist Sans TTF files (Regular, Bold, Italic) and Geist Mono TTF (Regular) to `public/fonts/`
- [x] T003 Create `src/lib/pdf/` directory structure per implementation plan

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**Warning**: No user story work can begin until this phase is complete

- [x] T004 Implement font loader that registers Geist Sans (Regular, Bold, Italic) and Geist Mono (Regular) TTF fonts with jsPDF in `src/lib/pdf/font-loader.ts` — fetch TTF files from `/fonts/`, convert to base64, register via `addFileToVFS` + `addFont`
- [x] T005 [P] Implement utility functions in `src/lib/pdf/utils.ts` — `sanitizeFilename(title)` to strip unsafe characters (/, \, :, \*, ?, ", <, >, |) and `triggerDownload(blob, filename)` to create a temporary anchor element and trigger browser download
- [x] T006 [P] Create main entry point skeleton `exportDocumentAsPdf(document)` in `src/lib/pdf/export-pdf.ts` — inspects document for `pages` and `content`, delegates to canvas or text renderer, handles empty documents (single blank A4 page), calls triggerDownload
- [x] T007 [P] Write unit tests for font-loader in `src/lib/pdf/__tests__/font-loader.test.ts` — verify fonts are registered with jsPDF mock
- [x] T008 [P] Write unit tests for utils in `src/lib/pdf/__tests__/utils.test.ts` — test filename sanitization with special characters, empty titles, and download trigger

**Checkpoint**: Foundation ready — font loading, utilities, and export skeleton in place

---

## Phase 3: User Story 1 — Export Canvas Document from Editor (Priority: P1) MVP

**Goal**: A student can export a canvas document with pen strokes, text boxes, and page backgrounds as a PDF from the editor toolbar. The PDF has vector strokes, selectable text, and correct backgrounds.

**Independent Test**: Create a canvas document with strokes, text boxes, and a background pattern, click "Export as PDF" in the editor, verify the downloaded PDF contains all visual elements with selectable text.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Write unit tests for background renderer in `src/lib/pdf/__tests__/background-renderer.test.ts` — verify each background type (blank/lined/grid/dotted) calls correct jsPDF drawing methods (line, circle, rect) with correct spacing (32px)
- [x] T010 [P] [US1] Write unit tests for stroke renderer in `src/lib/pdf/__tests__/stroke-renderer.test.ts` — verify perfect-freehand outline points are converted to jsPDF moveTo/lineTo/closePath/fill calls, with correct color and opacity via setFillColor/setGState
- [x] T011 [P] [US1] Write unit tests for canvas-page-renderer in `src/lib/pdf/__tests__/canvas-page-renderer.test.ts` — verify a canvas page with strokes, text boxes, and background produces correct jsPDF calls; verify empty text boxes are omitted; verify page dimensions are 794x1123 pts

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement background renderer in `src/lib/pdf/background-renderer.ts` — `renderBackground(doc, pageType, width, height)` that draws vector patterns: blank (white fill), lined (horizontal lines every 32px in light gray), grid (horizontal + vertical lines every 32px), dotted (filled circles at 32px intersections)
- [x] T013 [P] [US1] Implement stroke renderer in `src/lib/pdf/stroke-renderer.ts` — `renderStroke(doc, stroke)` that takes a Stroke object, calls `getStroke(stroke.points, { size: stroke.width, simulatePressure: false })` to get outline polygon, then iterates points with `doc.moveTo`/`doc.lineTo`/`doc.closePath`/`doc.fill`, applying color via `setFillColor` and opacity via `setGState`
- [x] T014 [P] [US1] Implement math renderer in `src/lib/pdf/math-renderer.ts` — `renderMath(doc, latex, x, y, width, height)` that uses `katex.renderToString(latex)` to produce SVG markup, inserts into a hidden DOM element, then embeds via `doc.svg()` from svg2pdf.js. Include fallback: if svg2pdf fails, rasterize to canvas and embed as high-DPI image via `doc.addImage`
- [x] T015 [US1] Implement TipTap-to-PDF text box renderer in `src/lib/pdf/tiptap-to-pdf.ts` — `renderTiptapContent(doc, content, x, y, width, height)` that walks TipTap JSON nodes and renders each as jsPDF text at the given position. Handle: heading (bold, sizes 24/20/16pt), paragraph (12pt), bold/italic/underline marks, code (Geist Mono), links (blue underlined with `doc.link`), highlight (yellow rect behind text), mathExpression (delegate to math-renderer), bulletList/orderedList (indented with bullet/number prefix), taskList (checkbox character ☐/☑ + text). Use Geist Sans for body, Geist Mono for code.
- [x] T016 [US1] Implement canvas page renderer in `src/lib/pdf/canvas-page-renderer.ts` — `renderCanvasPage(doc, page, canvasType)` that: (1) adds a jsPDF page sized 794x1123 pts, (2) calls background renderer with `page.pageType ?? canvasType`, (3) iterates `page.strokes` sorted by creation order and calls stroke renderer for each, (4) iterates `page.textBoxes`, skips empty ones, and calls tiptap-to-pdf renderer for each at its (x, y, width, height) position
- [x] T017 [US1] Wire canvas export path in `src/lib/pdf/export-pdf.ts` — when document has `pages` with canvas pages, iterate pages sorted by `order`, call `renderCanvasPage` for each, then save and trigger download
- [x] T018 [US1] Create `useExportPdf` hook in `src/hooks/use-export-pdf.ts` — manages loading state (`isExporting`), calls `exportDocumentAsPdf`, shows error toast on failure with retry option, shows brief loading spinner during generation
- [x] T019 [US1] Add "Export as PDF" button to editor toolbar in `src/components/editor/toolbar.tsx` — add a download/export icon button that calls `useExportPdf` hook with current document data, disabled while `isExporting` is true, shows spinner during export

**Checkpoint**: Canvas document export from editor is fully functional and testable independently

---

## Phase 4: User Story 2 — Export Text-Only Document from Editor (Priority: P2)

**Goal**: A student can export a text-only document (rich text with headings, lists, math, highlights) as a paginated A4 PDF from the editor.

**Independent Test**: Create a text document with mixed rich content, export as PDF, verify proper A4 pagination with selectable text and correct formatting.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T020 [P] [US2] Write unit tests for text-document-renderer in `src/lib/pdf/__tests__/text-document-renderer.test.ts` — verify: A4 page size (595x842 pts), 72pt margins, page breaks at content overflow, orphan heading prevention (heading in bottom 15% pushed to next page), text wrapping via splitTextToSize, all TipTap node types produce correct output
- [x] T021 [P] [US2] Write unit tests for tiptap-to-pdf node mapping in `src/lib/pdf/__tests__/tiptap-to-pdf.test.ts` — verify each TipTap node type (heading, paragraph, bulletList, orderedList, taskList, code, link, highlight, mathExpression) maps to correct jsPDF calls with proper font, size, and style

### Implementation for User Story 2

- [x] T022 [US2] Implement text document renderer in `src/lib/pdf/text-document-renderer.ts` — `renderTextDocument(doc, content)` that: (1) adds A4 pages (595x842 pts) with 72pt margins, (2) walks TipTap JSON node tree top-to-bottom, (3) for each node calculates rendered height using `splitTextToSize` and font metrics, (4) tracks cumulative y-position, inserts page break when cursor exceeds usable height (842 - 72 - 72 = 698pt), (5) prevents orphan headings (if heading in bottom 15% of page, push to next), (6) delegates node rendering to tiptap-to-pdf mapper
- [x] T023 [US2] Wire text export path in `src/lib/pdf/export-pdf.ts` — when document has `content` but no `pages`, call `renderTextDocument`, then save and trigger download
- [x] T024 [US2] Verify editor toolbar export button works for text-only documents — no new UI needed (reuses `useExportPdf` hook from T018), but verify the flow end-to-end

**Checkpoint**: Text-only document export from editor is fully functional and testable independently

---

## Phase 5: User Story 3 — Export from Dashboard (Priority: P3)

**Goal**: A student can export any document as PDF directly from the dashboard without opening it, via the document card context menu.

**Independent Test**: Navigate to dashboard, open context menu on a document card, select "Export as PDF", verify the PDF downloads correctly.

### Implementation for User Story 3

- [x] T025 [US3] Add "Export as PDF" option to document card context menu in `src/components/dashboard/document-card.tsx` — add menu item with download icon, calls `useExportPdf` hook. Since the dashboard may not have full document data loaded, fetch complete document (content + pages) via existing query/server action before calling export
- [x] T026 [US3] Write e2e test for dashboard export in `e2e/export-pdf-dashboard.spec.ts` — navigate to dashboard, open context menu on a document card, click "Export as PDF", verify a file downloads

**Checkpoint**: Dashboard export works independently

---

## Phase 6: User Story 4 — Export Mixed Document (Priority: P3)

**Goal**: Documents with both canvas pages and text content export correctly — canvas pages first, then paginated text pages.

**Independent Test**: Create a document with both canvas pages and text content, export, verify canvas pages come first followed by paginated text pages.

### Implementation for User Story 4

- [x] T027 [US4] Handle mixed documents in `src/lib/pdf/export-pdf.ts` — when document has both `pages` and `content`, render canvas pages first (using canvas-page-renderer), then append text content as additional A4 pages (using text-document-renderer on the same jsPDF instance)
- [x] T028 [US4] Write unit test for mixed document export in `src/lib/pdf/__tests__/export-pdf.test.ts` — verify canvas pages rendered first, text pages appended after, total page count correct

**Checkpoint**: All document types (canvas, text, mixed) export correctly

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and final validation

- [x] T029 Handle edge case: empty document exports as single blank A4 page in `src/lib/pdf/export-pdf.ts`
- [x] T030 [P] Handle edge case: canvas strokes at page edges are clipped to page boundary in `src/lib/pdf/canvas-page-renderer.ts`
- [x] T031 [P] Write e2e test for editor export in `e2e/export-pdf-editor.spec.ts` — open a document in editor, click "Export as PDF", verify file downloads with correct filename
- [x] T032 Run full test suite (`pnpm test`) and verify all tests pass — 224 tests passing across 31 test files
- [x] T033 Run quickstart.md validation — build passes, lint clean (0 errors), 224 tests passing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — core export engine
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) and shares tiptap-to-pdf from US1 (T015) — can start after T015 is complete
- **User Story 3 (Phase 5)**: Depends on export engine being functional (US1 or US2 complete)
- **User Story 4 (Phase 6)**: Depends on both US1 and US2 being complete (combines both renderers)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Shares `tiptap-to-pdf.ts` from US1 — can start after T015 (tiptap mapper) is complete, OR the tiptap mapper can be built as part of US2 if doing stories in parallel
- **User Story 3 (P3)**: Reuses export engine — needs at least US1 complete
- **User Story 4 (P3)**: Combines US1 + US2 renderers — needs both complete

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Renderers (background, stroke, math) before orchestrators (canvas-page-renderer)
- Orchestrators before main export entry wiring
- Core engine before UI integration (hook, toolbar button)

### Parallel Opportunities

- T005, T006, T007, T008 can all run in parallel (different files in Phase 2)
- T009, T010, T011 can run in parallel (test files for US1)
- T012, T013, T014 can run in parallel (independent renderer modules)
- T020, T021 can run in parallel (test files for US2)
- T029, T030, T031 can run in parallel (independent polish tasks)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (they should all fail initially):
Task: "Write unit tests for background renderer in src/lib/pdf/__tests__/background-renderer.test.ts"
Task: "Write unit tests for stroke renderer in src/lib/pdf/__tests__/stroke-renderer.test.ts"
Task: "Write unit tests for canvas-page-renderer in src/lib/pdf/__tests__/canvas-page-renderer.test.ts"

# Launch all independent US1 renderers together:
Task: "Implement background renderer in src/lib/pdf/background-renderer.ts"
Task: "Implement stroke renderer in src/lib/pdf/stroke-renderer.ts"
Task: "Implement math renderer in src/lib/pdf/math-renderer.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install deps, download fonts)
2. Complete Phase 2: Foundational (font loader, utils, export skeleton)
3. Complete Phase 3: User Story 1 (canvas export from editor)
4. **STOP and VALIDATE**: Export a canvas document and verify PDF quality
5. Deploy/demo if ready — this alone covers the primary use case

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. User Story 1 → Canvas export works → Deploy (MVP!)
3. User Story 2 → Text export works → Deploy
4. User Story 3 → Dashboard export works → Deploy
5. User Story 4 → Mixed documents work → Deploy
6. Polish → Edge cases handled → Final deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The tiptap-to-pdf mapper (T015) is built in US1 but shared by US2 — this is the only cross-story dependency
