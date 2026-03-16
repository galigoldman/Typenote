# Quickstart: 008-inline-material-viewer

## What This Feature Does

When a student clicks on a course material (PDF), instead of opening it in a new browser tab, the app creates a regular document with the PDF pages as canvas backgrounds. The student can draw, highlight, and annotate directly on top of the PDF using all existing editor tools. Annotations are auto-saved like any other document.

## Architecture Overview

```
Student clicks material
        ↓
openMaterialAsDocument() server action
  → finds existing doc OR creates new one
  → returns documentId
        ↓
Navigate to /dashboard/documents/{documentId}
        ↓
Document page loads (existing flow)
  → detects material_id on document
  → fetches PDF from storage via pdfjs-dist
  → renders each PDF page as canvas background
        ↓
Student annotates with pen/highlighter/text
  → auto-save persists strokes to documents.pages
  → same sync/realtime as regular documents
```

## Key Changes by Layer

### Database (1 migration)

- Add `material_id` column to `documents` table (nullable FK → `course_materials`)
- Unique partial index on `(material_id, user_id)` to prevent duplicate documents

### Types

- `Document` type: add `material_id: string | null`
- `CanvasPage` type: add `pdfPage?: number` (0-indexed PDF page reference)

### Server Actions

- New: `openMaterialAsDocument(materialId, pageCount)` — find-or-create document
- New: `getMaterialForDocument(materialId)` — fetch storage path/bucket for PDF

### Client Components

- **MaterialItem**: Change click handler from `window.open()` to calling `openMaterialAsDocument()` then `router.push()`
- **CanvasPage**: Add PDF background rendering layer (Layer 0, below CSS background)
- **CanvasEditor**: Pass `materialId` to pages, manage PDF loading state

### New Hook

- `usePdfBackground(materialId)` — loads PDF via pdfjs-dist, provides `renderPage()` function

### New Dependency

- `pdfjs-dist` — Mozilla PDF.js for client-side PDF rendering

## Development Order

1. **Migration + types** — add `material_id` column, update TypeScript types
2. **Server actions** — `openMaterialAsDocument`, `getMaterialForDocument`
3. **PDF rendering hook** — `usePdfBackground` with pdfjs-dist
4. **Canvas page background** — render PDF page as Layer 0
5. **MaterialItem click handler** — wire up the new flow
6. **Tests** — integration tests for server actions, unit tests for hook/rendering

## Interview Talking Points

- **Why create a real document?** Reuses the entire document infrastructure (save, sync, AI, breadcrumbs) without duplication. This is the "composition over inheritance" principle applied to features.
- **Why client-side PDF rendering?** Avoids storage costs for pre-rendered images, keeps the PDF as single source of truth, and leverages browser caching.
- **Why ON DELETE SET NULL?** Student's annotations have independent value. Deleting the source material shouldn't destroy the student's work — this is a data preservation design choice.
- **Why a partial unique index?** `WHERE material_id IS NOT NULL` means regular documents (material_id = null) aren't constrained, while material-backed documents are deduplicated. This is an advanced PostgreSQL pattern.
