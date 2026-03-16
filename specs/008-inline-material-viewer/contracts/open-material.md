# Contract: Open Material as Document

## Server Action: `openMaterialAsDocument`

**Purpose**: When a student clicks a material, find or create the annotation document and return its ID for navigation.

### Input

| Field        | Type            | Required | Description                                         |
| ------------ | --------------- | -------- | --------------------------------------------------- |
| `materialId` | `string` (uuid) | Yes      | The course_materials record to open                 |
| `pageCount`  | `number`        | Yes      | Number of pages in the PDF (determined client-side) |

### Output (Success)

| Field        | Type            | Description                                                         |
| ------------ | --------------- | ------------------------------------------------------------------- |
| `documentId` | `string` (uuid) | The document ID to navigate to                                      |
| `created`    | `boolean`       | Whether a new document was created (true) or existing found (false) |

### Output (Error)

| Condition                               | Error                     |
| --------------------------------------- | ------------------------- |
| User not authenticated                  | "Not authenticated"       |
| Material not found or not owned by user | "Material not found"      |
| Database error                          | "Failed to open material" |

### Behavior

1. Authenticate user
2. Fetch material record (verify ownership via `user_id`)
3. Query `documents` WHERE `material_id = input.materialId AND user_id = currentUser`
4. If document exists → return `{ documentId, created: false }`
5. If not → create document with:
   - `material_id` = input.materialId
   - `course_id` = material.course_id (via week → course join)
   - `week_id` = material.week_id
   - `title` = material.file_name without extension
   - `pages` = generate N pages, each with `pdfPage: index`
   - `canvas_type` = 'blank'
   - `subject` = 'general'
6. Return `{ documentId: newDoc.id, created: true }`

---

## Server Query: `getMaterialForDocument`

**Purpose**: Fetch the material's storage details for a document that has `material_id` set. Used by the canvas editor to load the PDF for background rendering.

### Input

| Field        | Type            | Required | Description                            |
| ------------ | --------------- | -------- | -------------------------------------- |
| `materialId` | `string` (uuid) | Yes      | The material to fetch storage info for |

### Output (Success)

| Field         | Type     | Description                                                    |
| ------------- | -------- | -------------------------------------------------------------- |
| `storagePath` | `string` | Path within the storage bucket                                 |
| `bucket`      | `string` | Storage bucket name ('course-materials' or 'moodle-materials') |
| `fileName`    | `string` | Original file name                                             |

### Behavior

1. Authenticate user
2. Fetch material record
3. Determine bucket from `storage_path` prefix ('moodle:' → 'moodle-materials', else 'course-materials')
4. Strip 'moodle:' prefix from path if present
5. Return storage details

---

## Client-Side: PDF Background Rendering

### Hook: `usePdfBackground`

**Input**: `materialId: string | null`

**Output**:
| Field | Type | Description |
|-------|------|-------------|
| `renderPage` | `(pageNum: number, canvas: HTMLCanvasElement) => Promise<void>` | Renders a PDF page to a canvas element |
| `isLoading` | `boolean` | Whether the PDF is still being loaded |
| `error` | `string \| null` | Error message if PDF failed to load |
| `pageCount` | `number` | Total number of pages in the PDF |

**Behavior**:

1. If `materialId` is null, return no-op
2. Fetch material storage details via `getMaterialForDocument`
3. Generate signed URL for the PDF
4. Load PDF document via pdfjs-dist
5. Cache the loaded PDF document instance
6. `renderPage()`: Renders requested page to provided canvas at appropriate scale
