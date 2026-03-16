# Data Model: 008-inline-material-viewer

**Date**: 2026-03-16

## Entity Changes

### Modified: `documents` table

**New column:**

| Column        | Type   | Nullable | Default | FK                    | Description                                                                                 |
| ------------- | ------ | -------- | ------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `material_id` | `uuid` | YES      | `null`  | `course_materials.id` | Links this document to the source material it was created from. Null for regular documents. |

**Constraints:**

- `UNIQUE(material_id, user_id)` — one annotation document per material per user (prevents duplicate documents when clicking the same material twice)
- `FK material_id → course_materials(id) ON DELETE SET NULL` — if the material is deleted, the document survives (annotations preserved) but loses the PDF background reference

**Why not ON DELETE CASCADE?** The student's annotations have independent value. If a professor removes a material from the course, the student's annotated notes should survive.

### Modified: `CanvasPage` TypeScript type

**New field:**

```typescript
interface CanvasPage {
  id: string;
  order: number;
  pageType?: 'blank' | 'lined' | 'grid' | 'dotted';
  strokes: Stroke[];
  textBoxes: TextBox[];
  flowContent: Record<string, unknown> | null;
  pdfPage?: number; // NEW — 0-indexed PDF page number for background rendering
}
```

- `pdfPage`: When present, indicates this canvas page should render a PDF page as its background. The PDF is fetched from the linked material's storage path.
- Value is 0-indexed (page 0 = first page of PDF)
- Only meaningful when the parent document has a non-null `material_id`

### Modified: `Document` TypeScript type

**New field:**

```typescript
interface Document {
  // ... existing fields ...
  material_id: string | null; // NEW — links to source course_materials record
}
```

### Existing: `course_materials` table (unchanged)

Referenced by the new `material_id` FK. Key fields used:

- `id` — primary key, referenced by documents.material_id
- `storage_path` — path to PDF in Supabase Storage (used to fetch PDF for rendering)
- `file_name` — used to auto-generate document title
- `week_id` — inherited by the created document
- `user_id` — must match the requesting user

## Data Flow

### First Open (material → document creation)

```
1. Student clicks material (material_id=M, week_id=W, course_id=C)
2. Server action: SELECT document WHERE material_id=M AND user_id=U
3. No result → CREATE document:
   - material_id = M
   - course_id = C
   - week_id = W
   - title = material.file_name (sans extension)
   - pages = { pages: [
       { id: uuid(), order: 0, pdfPage: 0, strokes: [], textBoxes: [], flowContent: null },
       { id: uuid(), order: 1, pdfPage: 1, strokes: [], textBoxes: [], flowContent: null },
       ...one per PDF page...
     ]}
4. Navigate to /dashboard/documents/{new_doc_id}
```

**Note**: PDF page count is determined client-side using pdfjs-dist before creating the document. The client fetches the PDF, counts pages, then calls the server action with the page count.

### Subsequent Opens

```
1. Student clicks material (material_id=M)
2. Server action: SELECT document WHERE material_id=M AND user_id=U
3. Result exists → Navigate to /dashboard/documents/{existing_doc_id}
```

### Rendering (on document page load)

```
1. Document loads with material_id=M, pages=[{pdfPage:0,...}, {pdfPage:1,...}, ...]
2. Client fetches material record → gets storage_path and bucket
3. Client generates signed URL for the PDF
4. Client loads PDF via pdfjs-dist
5. For each canvas page with pdfPage set:
   a. pdfjs renders page N to an offscreen canvas
   b. Result is drawn as the bottom layer of the canvas page
6. Student's strokes render on top as usual
```

## Migration

**File**: `supabase/migrations/XXXXX_add_material_id_to_documents.sql`

```sql
-- Add material_id column to documents
ALTER TABLE documents
  ADD COLUMN material_id uuid REFERENCES course_materials(id) ON DELETE SET NULL;

-- Unique constraint: one annotation document per material per user
CREATE UNIQUE INDEX documents_material_user_idx
  ON documents (material_id, user_id)
  WHERE material_id IS NOT NULL;

-- Index for fast lookup when opening a material
CREATE INDEX documents_material_id_idx ON documents (material_id)
  WHERE material_id IS NOT NULL;
```

**RLS**: Existing document RLS policies already filter by `user_id`, so no new policies needed. The new column is just a nullable FK — document access is still governed by ownership.
