# Data Model: Fix Cursor Jumps in Multi-Page Reflow Cascade

**Feature**: 035-fix-118-cursor-cascade
**Date**: 2026-04-09

## N/A — No data model changes

This feature is a purely client-side bugfix in `src/components/canvas/canvas-editor.tsx`. There are:

- **No new database tables**.
- **No migrations**.
- **No changes to existing table columns**.
- **No changes to RLS policies**.
- **No changes to seed data**.
- **No changes to Supabase storage buckets**.

The document content stored in `documents.pages` (JSONB) and `documents.content` (legacy JSONB) is **read and written in exactly the same shape** as before. The cursor-jump fix only changes _how the editor places the cursor after an overflow event_ — it does not change what gets persisted.

## Internal client-side state changes

For completeness, the client-side state changes inside the canvas-editor component are listed here. These are implementation details, not data-model changes.

| Ref / state                                                         | Change        | Reason                                                                                                                                           |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cascadeCursorTargetRef: React.MutableRefObject<string \| null>`    | **Removed**   | Replaced by `decideCursorTarget` pure function + the new `cascadeTargetTextBoxIds` set.                                                          |
| `cascadeTargetTextBoxIds: React.MutableRefObject<Set<string>>`      | **New**       | Tracks which text boxes are currently downstream cascade targets (so their `handleTextBoxHeightMeasured` knows to treat itself as an inner hop). |
| `processingTextBoxOverflowRef: React.MutableRefObject<Set<string>>` | **Unchanged** | Still tracks per-text-box re-entrance protection inside `handleTextBoxHeightMeasured`. Independent from `cascadeTargetTextBoxIds`.               |
| `textBoxEditorsRef: React.MutableRefObject<Map<string, Editor>>`    | **Unchanged** | Still maps text box IDs to their TipTap editor instances.                                                                                        |
| `editorsRef: React.MutableRefObject<Map<string, Editor>>`           | **Unchanged** | Still maps page IDs to their primary editor instance (the text box editor for `-ftb` pages, the legacy flow editor otherwise).                   |

## Validation

There is no schema or constraint validation needed for this feature. The pure-function rule `decideCursorTarget` has its own input contract:

- `cursorBlockIndex >= 0`
- `splitIndex >= 0`
- `cursorOffset >= 0`

These are enforced by the TypeScript types and verified by the unit tests.
