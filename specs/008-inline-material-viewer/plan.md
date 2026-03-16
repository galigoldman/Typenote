# Implementation Plan: Inline Material Viewer

**Branch**: `008-inline-material-viewer` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-inline-material-viewer/spec.md`

## Summary

When a student clicks a course material (PDF), the system creates a regular document with PDF pages as canvas backgrounds (or navigates to an existing one). The student gets the full canvas editor experience — pen, highlighter, eraser, zoom, text, undo/redo — on top of the PDF. Annotations auto-save like any other document. This is achieved by adding `pdfjs-dist` for client-side PDF rendering, a `material_id` FK on the documents table, and a `pdfPage` field on the CanvasPage type.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), pdfjs-dist (NEW), TipTap 3, perfect-freehand, Supabase SSR
**Storage**: PostgreSQL via Supabase (documents table), Supabase Storage (course-materials & moodle-materials buckets)
**Testing**: Vitest (unit/integration), Playwright (e2e)
**Target Platform**: Web (desktop/laptop primary, responsive secondary)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: PDF page visible within 5 seconds for <10MB files; annotation tools responsive at 60fps
**Constraints**: Client-side PDF rendering only (no server-side processing); signed URLs expire after 1 hour
**Scale/Scope**: Typical course materials: 1-50 page PDFs, <50MB each

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Phase 0 Check

| Principle                       | Status | Notes                                                                                                                                                              |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Incremental Development      | PASS   | Building on existing canvas editor + document infrastructure. Migration first, then server actions, then client rendering. Each phase produces testable increment. |
| II. Test-Driven Quality         | PASS   | Plan includes integration tests for migration/actions, unit tests for PDF hook, e2e for full flow.                                                                 |
| III. Protected Main Branch      | PASS   | Working on `008-inline-material-viewer` branch. Will PR to main.                                                                                                   |
| IV. Migrations as Code          | PASS   | Single migration adding `material_id` column. Will run `supabase db reset` to verify.                                                                              |
| V. Interview-Ready Architecture | PASS   | Key concepts documented in quickstart.md: composition over inheritance, partial unique indexes, ON DELETE SET NULL rationale.                                      |

### Post-Phase 1 Check

| Principle                       | Status | Notes                                                                                              |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | Data model (migration) → server actions → client rendering → wiring. Clean incremental phases.     |
| II. Test-Driven Quality         | PASS   | Integration test for `openMaterialAsDocument` idempotency. Unit tests for `usePdfBackground` hook. |
| IV. Migrations as Code          | PASS   | Single migration file with FK, partial unique index, and lookup index.                             |
| V. Interview-Ready Architecture | PASS   | Design leverages composition: material-backed documents reuse 100% of document infrastructure.     |

## Project Structure

### Documentation (this feature)

```text
specs/008-inline-material-viewer/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — schema changes
├── quickstart.md        # Phase 1 output — development guide
├── contracts/           # Phase 1 output — interface contracts
│   └── open-material.md # Server action + hook contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/(dashboard)/dashboard/
│   └── documents/[docId]/page.tsx      # MODIFIED — pass material_id to editor
├── components/
│   ├── canvas/
│   │   ├── canvas-editor.tsx           # MODIFIED — accept materialId, pass to pages
│   │   └── canvas-page.tsx             # MODIFIED — add PDF background layer (Layer 0)
│   └── dashboard/
│       └── material-item.tsx           # MODIFIED — change click to open-as-document
├── hooks/
│   └── use-pdf-background.ts           # NEW — loads PDF via pdfjs-dist, provides renderPage()
├── lib/
│   ├── actions/
│   │   └── documents.ts                # MODIFIED — add openMaterialAsDocument action
│   └── queries/
│       └── course-materials.ts         # MODIFIED — add getMaterialForDocument query
└── types/
    ├── canvas.ts                       # MODIFIED — add pdfPage to CanvasPage
    └── database.ts                     # MODIFIED — add material_id to Document

supabase/
└── migrations/
    └── XXXXX_add_material_id.sql       # NEW — material_id column + indexes

tests/
├── src/lib/actions/
│   └── open-material.integration.test.ts  # NEW — server action tests
└── src/hooks/
    └── use-pdf-background.test.ts         # NEW — hook unit tests
```

**Structure Decision**: Feature is implemented within the existing Next.js App Router structure. No new routes needed — material-backed documents use the existing `/dashboard/documents/[docId]` route. One new hook, one new migration, modifications to ~8 existing files.

## Implementation Phases

### Phase 1: Database & Types (Foundation)

**Goal**: Add `material_id` to documents, update TypeScript types.

1. Create migration: `supabase migration new add_material_id_to_documents`
   - Add `material_id uuid` column (nullable FK → course_materials, ON DELETE SET NULL)
   - Create partial unique index: `(material_id, user_id) WHERE material_id IS NOT NULL`
   - Create lookup index: `material_id WHERE material_id IS NOT NULL`
2. Run `supabase db reset` to verify migration chain
3. Update `src/types/database.ts`: add `material_id: string | null` to Document interface
4. Update `src/types/canvas.ts`: add `pdfPage?: number` to CanvasPage interface
5. Update seed.sql if needed

**Test**: Integration test verifying:

- Document can be created with `material_id`
- Unique constraint prevents duplicate `(material_id, user_id)`
- Deleting material sets `material_id` to null (not cascade)

### Phase 2: Server Actions (Backend Logic)

**Goal**: Implement find-or-create and material lookup actions.

1. Add `openMaterialAsDocument(materialId, pageCount)` to `src/lib/actions/documents.ts`:
   - Authenticate user
   - Fetch material (verify ownership)
   - Check for existing document with this material_id + user_id
   - If exists, return its ID
   - If not, create document with course/week context, generate N pages with pdfPage indices
   - Return document ID + created flag
2. Add `getMaterialForDocument(materialId)` to `src/lib/queries/course-materials.ts`:
   - Fetch material record
   - Determine bucket from storage_path prefix
   - Return storage path, bucket, file name

**Test**: Integration tests for:

- `openMaterialAsDocument` creates document on first call
- `openMaterialAsDocument` returns existing document on second call (idempotent)
- `openMaterialAsDocument` rejects unauthorized material access
- `getMaterialForDocument` returns correct bucket for both storage sources

### Phase 3: PDF Rendering (Client-Side)

**Goal**: Install pdfjs-dist, create rendering hook, add PDF background layer to canvas.

1. Install `pdfjs-dist`: `pnpm add pdfjs-dist`
2. Configure pdfjs-dist worker (copy worker to public/ or use CDN)
3. Create `src/hooks/use-pdf-background.ts`:
   - Accept `materialId: string | null`
   - Fetch material storage details
   - Generate signed URL
   - Load PDF document via pdfjs
   - Expose `renderPage(pageNum, canvas)`, `isLoading`, `error`, `pageCount`
   - Cache loaded PDF instance (avoid re-fetching on re-renders)
4. Modify `src/components/canvas/canvas-page.tsx`:
   - Accept `pdfPage` and `renderPdfPage` props
   - Add Layer 0: a canvas element behind the CSS background layer
   - On mount (and when pdfPage changes), call `renderPdfPage(pdfPage, canvasEl)`
   - Handle loading/error states
5. Modify `src/components/canvas/canvas-editor.tsx`:
   - Accept `materialId` prop
   - Call `usePdfBackground(materialId)`
   - Pass `renderPdfPage` function and `pdfPage` to each CanvasPage

**Test**: Unit tests for:

- `usePdfBackground` returns no-op when materialId is null
- `usePdfBackground` loading states
- Canvas page renders PDF background when pdfPage is set
- Canvas page renders no background when pdfPage is undefined

### Phase 4: Wiring (Connect Everything)

**Goal**: Change MaterialItem click handler, pass materialId through document page.

1. Modify `src/components/dashboard/material-item.tsx`:
   - Replace `window.open(signedUrl, '_blank')` with:
     a. Load PDF to get page count (lightweight pdfjs call)
     b. Call `openMaterialAsDocument(materialId, pageCount)`
     c. `router.push(/dashboard/documents/${documentId})`
   - Add loading state during document creation
2. Modify `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`:
   - Pass `document.material_id` to `CanvasEditor` / `DocumentWithAi`
3. Modify `src/components/ai/document-with-ai.tsx`:
   - Pass `materialId` through to `CanvasEditor`

**Test**: E2E test (Playwright):

- Navigate to course page
- Click a material
- Verify navigation to document page (not new tab)
- Verify PDF content visible as background
- Draw a stroke, navigate away, return — verify stroke persisted

### Phase 5: Polish & Edge Cases

**Goal**: Handle error states, loading UX, URL expiry.

1. Loading UX: Show skeleton/spinner while PDF is being fetched and rendered
2. Error state: If PDF fails to load, show error banner with "Go back" link (annotations still editable)
3. Signed URL refresh: If rendering fails due to expired URL, auto-generate a new signed URL and retry
4. Large PDF handling: Render pages lazily (only visible pages + buffer) to manage memory
5. Breadcrumbs: Verify material-backed documents show correct course/week breadcrumbs (should work automatically via existing course_id/week_id)

## Complexity Tracking

No constitution violations. All complexity is justified by the feature requirements:

| Decision                    | Why                                                          | Simpler Alternative                                 |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| pdfjs-dist dependency       | Only way to render PDF pages to canvas in-browser            | iframe embed — but can't overlay drawing tools      |
| material_id FK              | Links documents to source materials for dedup + PDF fetching | No link — would create duplicate documents          |
| pdfPage field on CanvasPage | Maps canvas pages to PDF pages for rendering                 | Store rendered images — would bloat JSONB massively |
