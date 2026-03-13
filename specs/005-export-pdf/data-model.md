# Data Model: Export as PDF

**Feature**: 005-export-pdf
**Date**: 2026-03-13

## Overview

This feature requires **no new database tables or schema changes**. It reads from the existing `documents` table and produces a client-side PDF file (never persisted to the database).

## Existing Entities Used

### Document (read-only)

The export service reads these fields from the existing `documents` table:

| Field         | Type  | Usage in Export                                                          |
| ------------- | ----- | ------------------------------------------------------------------------ |
| `title`       | TEXT  | PDF filename (`{title}.pdf`)                                             |
| `content`     | JSONB | TipTap JSON — rendered as paginated text pages                           |
| `pages`       | JSONB | Canvas data — rendered as fixed-layout pages with strokes and text boxes |
| `canvas_type` | TEXT  | Default background type for canvas pages (blank/lined/grid/dotted)       |

### Canvas Page (from `pages` JSONB)

| Field         | Type      | Usage in Export                                        |
| ------------- | --------- | ------------------------------------------------------ |
| `id`          | string    | Page identification                                    |
| `order`       | number    | Page ordering in PDF                                   |
| `pageType`    | string?   | Per-page background override (blank/lined/grid/dotted) |
| `strokes`     | Stroke[]  | Rendered as filled vector paths                        |
| `textBoxes`   | TextBox[] | Rendered as positioned selectable text                 |
| `flowContent` | JSONB?    | TipTap JSON for flow text on the page                  |

### Stroke (from canvas page)

| Field     | Type               | Usage in Export                                  |
| --------- | ------------------ | ------------------------------------------------ |
| `points`  | [x, y, pressure][] | Input to perfect-freehand for outline generation |
| `color`   | string             | PDF fill color                                   |
| `width`   | number             | perfect-freehand `size` parameter                |
| `opacity` | number             | PDF graphics state opacity                       |

### TextBox (from canvas page)

| Field             | Type   | Usage in Export                           |
| ----------------- | ------ | ----------------------------------------- |
| `x`, `y`          | number | PDF text position coordinates             |
| `width`, `height` | number | Text area bounds                          |
| `content`         | JSONB  | TipTap JSON — rendered as positioned text |

## Output Entity

### PDF File (ephemeral, not persisted)

The output is a `Blob` of type `application/pdf`, created entirely in-memory in the browser. It is never stored in Supabase Storage — it is immediately triggered as a browser download.

| Property          | Value                            |
| ----------------- | -------------------------------- |
| MIME type         | `application/pdf`                |
| Filename          | `{sanitized document title}.pdf` |
| Storage           | None — client-side download only |
| Max expected size | ~1-5 MB for typical documents    |
