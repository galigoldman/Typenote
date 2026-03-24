# Data Model: Fix LaTeX Text Box Cutoff and PDF Import Empty Page

**Date**: 2026-03-24
**Feature**: 024-fix-latex-pdf-bugs

## Overview

No new entities or schema changes required. This feature fixes bugs in the existing data flow between entities.

## Existing Entities (Relevant)

### Document

Represents a user's note document. Already supports linking to either a course material or a personal file.

| Field            | Type             | Description                                                            |
| ---------------- | ---------------- | ---------------------------------------------------------------------- |
| id               | UUID             | Primary key                                                            |
| material_id      | UUID (nullable)  | FK to `course_materials` — set when document is from a course material |
| personal_file_id | UUID (nullable)  | FK to `personal_files` — set when document is from a personal file     |
| pages            | JSONB (nullable) | Array of page objects, each with optional `pdfPage` index              |

**Constraint**: A document may have at most one of `material_id` or `personal_file_id` set (never both).

### Personal File

A user-uploaded file stored in `personal-files` storage bucket.

| Field        | Type   | Description                             |
| ------------ | ------ | --------------------------------------- |
| id           | UUID   | Primary key                             |
| storage_path | string | Path within the `personal-files` bucket |
| mime_type    | string | MIME type (e.g., `application/pdf`)     |

### Course Material

A file associated with a course, stored in `course-materials` or `moodle-materials` bucket.

| Field        | Type   | Description                                                            |
| ------------ | ------ | ---------------------------------------------------------------------- |
| id           | UUID   | Primary key                                                            |
| storage_path | string | Path within bucket; `moodle:` prefix indicates moodle-materials bucket |

## Data Flow Fix

**Before (broken)**: Document page passes only `material_id` → PDF hooks query only `course_materials` → personal-file PDFs get `null` → blank page

**After (fixed)**: Document page passes both `material_id` and `personal_file_id` → PDF hooks check which is set → query the appropriate table and bucket → PDF renders

## No Migrations Needed

Both `material_id` and `personal_file_id` columns already exist on the `documents` table. The `personal_files` table already has `storage_path`. This is purely a client-side code path fix.
