# Research: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Date**: 2026-03-24
**Feature**: 024-fix-latex-pdf-bugs

## Bug 1: PDF Import Shows Empty Page

### Decision: Extend PDF hooks to support both `materialId` and `personalFileId`

**Rationale**: The root cause is a missing code path, not a design flaw. The `usePdfBackground` and `usePdfTextLayer` hooks hardcode queries to the `course_materials` table and only support `course-materials`/`moodle-materials` storage buckets. Personal-file documents set `personal_file_id` instead of `material_id`, so the hooks receive `null` and exit early — rendering nothing.

**Alternatives considered**:

1. **Map personal files to course_materials at import time** — Rejected: Creates a fake course_material row for a non-course file, polluting the data model and coupling personal files to course concepts.
2. **Create a unified `source_files` table** — Rejected: Too large a refactor for a bug fix; would require migrating existing data and updating all course-material queries across the app.
3. **Pass a pre-signed URL directly instead of an ID** — Rejected: URLs expire (3600s), which would break long editing sessions. The hooks need to manage URL lifecycle internally.

### Data Flow Analysis

**Current flow (broken for personal files)**:

```
Document page → CanvasEditor(materialId=null) → usePdfBackground(null) → exits early → blank canvas
```

**Fixed flow**:

```
Document page → CanvasEditor(materialId OR personalFileId) → usePdfBackground(materialId, personalFileId)
  → if materialId: query course_materials → bucket: course-materials/moodle-materials
  → if personalFileId: query personal_files → bucket: personal-files
  → load PDF → render pages
```

### Files to Modify

| File                                                       | Change                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `src/hooks/use-pdf-background.ts`                          | Accept `personalFileId`, add personal_files query path |
| `src/hooks/use-pdf-text-layer.ts`                          | Same as above                                          |
| `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx` | Pass `personalFileId` prop alongside `materialId`      |
| `src/components/canvas/canvas-editor.tsx`                  | Accept `personalFileId`, pass to hooks                 |
| `src/components/canvas/canvas-page.tsx`                    | Accept `personalFileId`, pass to PdfTextLayer          |
| `src/components/document-with-ai.tsx` (if exists)          | Pass `personalFileId` through                          |

### Storage Bucket Mapping

| Source          | Table              | Bucket             | Path prefix               |
| --------------- | ------------------ | ------------------ | ------------------------- |
| Course material | `course_materials` | `course-materials` | direct path               |
| Moodle material | `course_materials` | `moodle-materials` | `moodle:` prefix stripped |
| Personal file   | `personal_files`   | `personal-files`   | direct path               |

---

## Bug 2: LaTeX Input Box Cuts Off Text

### Decision: Make the input field flex-grow and ensure text scrollability

**Rationale**: The `<input>` in `MathInputBox` has `min-w-[220px]` but no `flex-1` or width constraint that lets it grow with the container. The outer container has no max-width, so it could theoretically grow, but the input element itself doesn't expand. Adding `flex-1` to the input and `max-w` to the container ensures the input fills available space while the container stays within viewport bounds.

**Alternatives considered**:

1. **Use a `<textarea>` for multi-line input** — Rejected: The input is conceptually a single-line math description; multi-line adds unnecessary complexity.
2. **Auto-resize input width based on text content** — Rejected: JavaScript-driven resize causes layout jank. CSS `flex-1` with scroll is simpler and more reliable.
3. **Remove `min-w` entirely** — Rejected: Would cause the input to collapse when empty, making the placeholder hard to read.

### Root Cause

In `src/lib/editor/math-input-box.tsx` line 98:

```
className="min-w-[220px] border-none bg-transparent text-sm outline-none ..."
```

The input has `min-w-[220px]` but:

- No `flex-1` → doesn't grow with container
- No `max-w` on container → container can grow past viewport
- The flex row contains: sigma icon + input + kbd label + close button
- When text exceeds ~35 characters, the input clips the rest

### Fix

1. Add `flex-1` to the input so it fills available space in the flex row
2. Add `max-w-[min(400px,calc(100vw-2rem))]` to the outer container to cap width
3. The input already scrolls horizontally natively — once `flex-1` is set, the `min-w-[220px]` provides a floor and the input grows to fill the row

### Files to Modify

| File                                | Change                                          |
| ----------------------------------- | ----------------------------------------------- |
| `src/lib/editor/math-input-box.tsx` | Add `flex-1` to input, add `max-w` to container |
