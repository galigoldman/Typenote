# Data Model: Fix Cross-Page Text Editing Flow

**Feature**: 037-fix-cross-page-editing
**Date**: 2026-04-11

## No Data Model Changes

This feature is a purely client-side bug fix. No database schema changes, no new entities, no migrations.

### Existing Entities (Unchanged)

- **Page** (`CanvasPage`): Contains `id`, `textBoxes[]`, `strokes[]`, `pdfPage?`. No changes.
- **TextBox** (`TextBoxData`): Contains `id`, `x`, `y`, `width`, `height`, `content` (TipTap JSON). No changes.
- **Flow Text Box** (`-ftb` suffix): The auto-reflow text box per page. Participates in inter-page cascade. No changes to the data format.

### Data Flow (Unchanged)

- Text overflow extracts ProseMirror JSON blocks from one page's `-ftb` and prepends them to the next page's `-ftb`.
- Backspace merge extracts content from the current page's first block and appends it to the previous page's last block.
- All changes are persisted via the existing `triggerSave()` mechanism which serializes pages to `documents.pages` JSONB column.
