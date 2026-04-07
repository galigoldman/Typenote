# Phase 1 Data Model: Reliable Text Reflow and Pagination in Type Mode

**Feature**: 035-fix-text-reflow
**Date**: 2026-04-07

## Summary

**No data model changes.** This feature is a purely client-side bug fix inside the editor's overflow-detection code path. The serialized on-disk shape of a document (the `documents.pages` JSONB column and its nested `flowContent` TipTap JSON per page) is identical before and after.

## Entities touched (read-only)

For context only — none of these schemas change:

- **`documents`** (Supabase table) — unchanged. The fix reads and writes `pages[i].flowContent` using the existing serialization.
- **`CanvasDocument`** (TypeScript type, `src/types/canvas.ts`) — unchanged.
- **`CanvasPage`** (TypeScript type, `src/types/canvas.ts`) — unchanged. The `flowContent: Record<string, unknown> | null` field is the per-page TipTap document, which is read into a TipTap editor on mount and written back via `onFlowContentUpdate`. The fix does not introduce any new fields or attrs.

## No migrations

- No new columns.
- No new tables.
- No RLS policy changes.
- No seed data changes.
- No `supabase migration new` required.
- No `supabase db reset` required for this PR.
