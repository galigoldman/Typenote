# Tasks: Inline Material Viewer

**Input**: Design documents from `/specs/008-inline-material-viewer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/open-material.md, quickstart.md

**Tests**: Included per Constitution Principle II (Test-Driven Quality) and CLAUDE.md testing requirements.

**Organization**: Tasks grouped by user story. US2 (multi-page) and US3 (persistence) share infrastructure with US1 — their implementation is inherent in US1's design, so their phases focus on verification and edge cases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install new dependency and configure build tooling

- [x] T001 Install `pdfjs-dist` package via `pnpm add pdfjs-dist`
- [x] T002 Configure pdfjs-dist worker for Next.js — copy worker file to `public/` or configure CDN URL in a setup module at `src/lib/pdf/pdfjs-setup.ts`
- [ ] T003 Verify pdfjs-dist works with Next.js 16 build — run `pnpm build` to catch any SSR/bundling issues

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migration and TypeScript type updates that MUST be complete before any user story work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create migration via `supabase migration new add_material_id_to_documents` — add `material_id uuid` column with FK to `course_materials(id) ON DELETE SET NULL`, partial unique index on `(material_id, user_id) WHERE material_id IS NOT NULL`, and lookup index on `material_id WHERE material_id IS NOT NULL` in `supabase/migrations/`
- [ ] T005 Run `supabase db reset` to verify full migration chain replays cleanly
- [x] T006 [P] Update `Document` interface — add `material_id: string | null` field in `src/types/database.ts`
- [x] T007 [P] Update `CanvasPage` interface — add optional `pdfPage?: number` field (0-indexed PDF page reference) in `src/types/canvas.ts`
- [ ] T008 Write integration test for migration — verify document creation with `material_id`, unique constraint prevents duplicate `(material_id, user_id)`, and ON DELETE SET NULL behavior in `src/lib/actions/open-material.integration.test.ts`

**Checkpoint**: Database schema extended, types updated, migration verified — user story implementation can begin

---

## Phase 3: User Story 1 — Open Material as a Full Document (Priority: P1) 🎯 MVP

**Goal**: Clicking a material navigates to the canvas editor with PDF pages rendered as backgrounds. All existing tools (pen, highlighter, eraser, zoom, text, undo/redo) work on top of the PDF.

**Independent Test**: Navigate to a course page, click a material, verify the canvas editor opens with PDF content as background and drawing tools are functional.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Integration test for `openMaterialAsDocument` — test: creates document on first call, returns existing on second call (idempotent), rejects unauthorized access, sets correct course_id/week_id/title in `src/lib/actions/open-material.integration.test.ts` (DEFERRED — requires Supabase)
- [ ] T010 [P] [US1] Integration test for `getMaterialForDocument` — test: returns correct bucket for direct uploads (`course-materials`) and Moodle imports (`moodle-materials`), strips `moodle:` prefix from path in `src/lib/queries/course-materials.test.ts` (DEFERRED — requires Supabase)
- [ ] T011 [P] [US1] Unit test for `usePdfBackground` hook — test: returns no-op when materialId is null, loading/error states, renderPage function signature in `src/hooks/use-pdf-background.test.ts` (DEFERRED — requires DOM/canvas mocks)

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement `openMaterialAsDocument(materialId, pageCount)` server action — authenticate user, fetch material (verify ownership via user_id), check for existing document with same material_id+user_id, create document with course/week context and N pages each with `pdfPage: index` if not found, return `{ documentId, created }` in `src/lib/actions/documents.ts`
- [x] T013 [P] [US1] Implement `getMaterialForDocument(materialId)` query — fetch material record, determine bucket from `storage_path` prefix (`moodle:` → `moodle-materials`, else `course-materials`), strip prefix, return `{ storagePath, bucket, fileName }` in `src/lib/queries/course-materials.ts`
- [x] T014 [US1] Create `usePdfBackground(materialId)` hook — fetch material storage details via `getMaterialForDocument`, generate signed URL via Supabase Storage, load PDF via pdfjs-dist `getDocument()`, cache PDF instance, expose `renderPage(pageNum, canvas)` / `isLoading` / `error` / `pageCount` in `src/hooks/use-pdf-background.ts`
- [x] T015 [US1] Add PDF background layer (Layer 0) to canvas page — add a canvas element behind the existing CSS background layer, accept `pdfPage` and `renderPdfPage` props, on mount call `renderPdfPage(pdfPage, canvasEl)` to draw PDF page, handle loading/error states in `src/components/canvas/canvas-page.tsx`
- [x] T016 [US1] Wire `materialId` into canvas editor — accept `materialId` prop, call `usePdfBackground(materialId)`, pass `renderPdfPage` function and each page's `pdfPage` value to `CanvasPage` components in `src/components/canvas/canvas-editor.tsx`
- [x] T017 [US1] Change MaterialItem click handler — replace `window.open(signedUrl, '_blank')` with: fetch PDF to get page count via pdfjs-dist, call `openMaterialAsDocument(materialId, pageCount)`, then `router.push(/dashboard/documents/${documentId})`, add loading state during creation in `src/components/dashboard/material-item.tsx`
- [x] T018 [US1] Pass `material_id` from document page to editor — read `document.material_id` from fetched document, pass as `materialId` prop to `DocumentWithAi` or `CanvasEditor` in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`
- [x] T019 [US1] Thread `materialId` through DocumentWithAi — accept `materialId` prop, forward to `CanvasEditor` component in `src/components/ai/document-with-ai.tsx`
- [x] T020 [US1] Run full test suite — `pnpm test` and `pnpm test:integration` to verify nothing is broken

**Checkpoint**: Clicking a material opens it in the canvas editor with PDF background. All drawing tools work. Material-backed documents are regular documents with PDF backgrounds. This is the MVP.

---

## Phase 4: User Story 2 — Navigate Multi-Page PDF Materials (Priority: P1)

**Goal**: Multi-page PDFs render as multiple canvas pages, each independently annotatable. (Implementation is inherent in US1's page generation — this phase verifies and handles edge cases.)

**Independent Test**: Open a multi-page PDF, verify each page is a separate canvas page with correct content, draw on multiple pages independently.

**Dependencies**: Requires US1 complete (Phase 3)

### Implementation for User Story 2

- [ ] T021 [US2] Verify multi-page rendering — manually test with a 10+ page PDF, confirm each PDF page maps to a separate canvas page in correct order, verify scrolling between pages works in `src/components/canvas/canvas-editor.tsx`
- [ ] T022 [US2] Handle PDF page dimension scaling — ensure PDF pages of varying dimensions (landscape slides, portrait pages, mixed) scale correctly to fit canvas page dimensions (PAGE_WIDTH=794, PAGE_HEIGHT=1123) in `src/hooks/use-pdf-background.ts`
- [ ] T023 [US2] Add lazy page rendering for performance — only render PDF backgrounds for visible pages plus a small buffer (e.g., 2 pages above/below viewport), defer rendering for off-screen pages to manage memory with large PDFs in `src/components/canvas/canvas-page.tsx`

**Checkpoint**: Multi-page PDFs render correctly with independent per-page annotation. Large PDFs load efficiently.

---

## Phase 5: User Story 3 — Save Annotations on Materials (Priority: P1)

**Goal**: Annotations auto-save and persist across sessions. Each student's annotations are private. (Persistence is inherent via existing document auto-save — this phase verifies the behavior.)

**Independent Test**: Open a material, add annotations (strokes, highlights), navigate away, return, verify all annotations are preserved.

**Dependencies**: Requires US1 complete (Phase 3)

### Implementation for User Story 3

- [ ] T024 [US3] Verify annotation persistence — manually test: draw strokes and highlights on a material, navigate away, click the same material again, confirm `openMaterialAsDocument` returns the existing document and all annotations are intact in `src/components/dashboard/material-item.tsx`
- [ ] T025 [US3] Verify per-student isolation — test that two different users importing the same material get independent documents with independent annotations (validated by the `(material_id, user_id)` unique constraint) in `src/lib/actions/open-material.integration.test.ts`
- [ ] T026 [US3] Verify auto-save triggers correctly — confirm that `useDocumentSync` fires `triggerSave()` when drawing on a material-backed document, same as regular documents, no special handling needed in `src/hooks/use-document-sync.ts`

**Checkpoint**: Annotations persist reliably. Per-student isolation confirmed.

---

## Phase 6: User Story 4 — Navigate Back to Course (Priority: P2)

**Goal**: Material-backed documents show correct breadcrumb navigation back to the course/week page.

**Independent Test**: Open a material from a course page, verify breadcrumb links navigate back to the correct course, verify browser back button works.

**Dependencies**: Requires US1 complete (Phase 3)

### Implementation for User Story 4

- [ ] T027 [US4] Verify breadcrumb navigation — open a material-backed document, confirm breadcrumbs show `Course Name > Week N` and link correctly back to the course page (should work automatically since document has `course_id` and `week_id` set) in `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`
- [ ] T028 [US4] Verify browser back button — navigate from course page → material → confirm browser back returns to course page (standard Next.js routing, no special handling expected)

**Checkpoint**: Navigation to and from material-backed documents works identically to regular documents.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, loading UX, and edge cases that affect multiple user stories

- [x] T029 Add loading UX for PDF fetch — show skeleton or spinner overlay on canvas pages while PDF is being downloaded and rendered in `src/components/canvas/canvas-page.tsx`
- [x] T030 Add error state for failed PDF load — if PDF fails to load (deleted file, network error), show error banner with "Go back" link while keeping annotations editable in `src/components/canvas/canvas-editor.tsx`
- [ ] T031 Handle signed URL expiry — if PDF rendering fails due to expired URL (after 1 hour), auto-regenerate a new signed URL and retry the render in `src/hooks/use-pdf-background.ts`
- [x] T032 Handle material deletion gracefully — when a material is deleted (`material_id` set to null via ON DELETE SET NULL), the document should still open but without PDF background, annotations remain accessible in `src/components/canvas/canvas-editor.tsx`
- [x] T033 Run full test suite and lint — `pnpm test`, `pnpm test:integration`, `pnpm lint`, `pnpm format:check` to verify everything passes
- [ ] T034 Run `pnpm build` to verify production build succeeds with pdfjs-dist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — this is the main implementation phase
- **US2 (Phase 4)**: Depends on US1 (Phase 3) — verification and edge case handling
- **US3 (Phase 5)**: Depends on US1 (Phase 3) — verification of persistence behavior
- **US4 (Phase 6)**: Depends on US1 (Phase 3) — verification of navigation
- **Polish (Phase 7)**: Depends on US1 (Phase 3) — can start before US2/US3/US4 are complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — the core implementation
- **US2 (P1)**: Depends on US1 — multi-page is built into US1's design, this phase verifies and optimizes
- **US3 (P1)**: Depends on US1 — persistence is automatic via existing auto-save, this phase verifies
- **US4 (P2)**: Depends on US1 — breadcrumbs are automatic via existing document page, this phase verifies

### Within User Story 1

- Tests (T009-T011) MUST be written and FAIL before implementation
- Server actions (T012-T013) can run in parallel — different files
- PDF hook (T014) depends on T013 (needs `getMaterialForDocument`)
- Canvas page modification (T015) depends on T014 (needs `renderPdfPage` function)
- Canvas editor wiring (T016) depends on T014 and T015
- MaterialItem click change (T017) depends on T012 (needs `openMaterialAsDocument`)
- Document page pass-through (T018) and DocumentWithAi (T019) can run in parallel, depend on T016
- Full test run (T020) depends on all US1 tasks

### Parallel Opportunities

- T006 + T007: Type updates in different files
- T009 + T010 + T011: Test files for different components
- T012 + T013: Server action and query in different files
- US2 (Phase 4) + US3 (Phase 5) + US4 (Phase 6): Independent verification phases after US1

---

## Parallel Example: User Story 1

```bash
# Tests (write first, should FAIL):
Task T009: "Integration test for openMaterialAsDocument"
Task T010: "Integration test for getMaterialForDocument"
Task T011: "Unit test for usePdfBackground hook"

# Server-side (after tests, parallel):
Task T012: "Implement openMaterialAsDocument in src/lib/actions/documents.ts"
Task T013: "Implement getMaterialForDocument in src/lib/queries/course-materials.ts"

# Client-side (sequential chain):
Task T014: "Create usePdfBackground hook" (depends on T013)
Task T015: "Add PDF background layer to canvas-page" (depends on T014)
Task T016: "Wire materialId into canvas-editor" (depends on T014, T015)

# Wiring (after server + client):
Task T017: "Change MaterialItem click handler" (depends on T012)
Task T018 + T019: "Pass materialId through document page" (parallel, depend on T016)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install pdfjs-dist)
2. Complete Phase 2: Foundational (migration + types)
3. Complete Phase 3: User Story 1 (core implementation)
4. **STOP and VALIDATE**: Click a material → opens in canvas editor → PDF visible → can draw on it → annotations save
5. This is the MVP — the feature is usable

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Material opens as annotatable document → **MVP deployed**
3. US2 → Multi-page verified and optimized (lazy rendering)
4. US3 → Persistence verified (idempotent reopening)
5. US4 → Navigation verified (breadcrumbs correct)
6. Polish → Error states, loading UX, URL refresh

---

## Notes

- US2/US3/US4 are largely verification phases — their implementation is built into US1's architecture
- The "composition over inheritance" design means most features work automatically: auto-save, realtime sync, AI chat, breadcrumbs, undo/redo
- pdfjs-dist is the only new dependency — everything else leverages existing infrastructure
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
