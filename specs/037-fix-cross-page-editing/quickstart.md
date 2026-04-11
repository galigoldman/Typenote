# Quickstart: Fix Cross-Page Text Editing Flow

**Feature**: 037-fix-cross-page-editing
**Date**: 2026-04-11

## Setup

```bash
pnpm install
pnpm dev
```

No database changes needed — this is a client-side-only fix.

## What to Test

1. Open any document with multiple pages of text
2. **Enter test**: Place cursor at the last line of text on a page, press Enter — text AND cursor should move to the next page
3. **Backspace test**: Place cursor at position 0 of page 2's first line, press Backspace — line should merge with page 1

## Key Files to Modify

| File                                       | Change                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `src/components/canvas/canvas-page.tsx`    | Remove/rework the Enter interception in `handleKeyDown` (lines 346-365) |
| `src/components/canvas/canvas-editor.tsx`  | Fix `handleBackspaceAtStart` to preserve formatting (lines 1339-1397)   |
| `e2e/canvas-editor-cursor-cascade.spec.ts` | Add E2E tests for Enter overflow and Backspace merge                    |

## Running Tests

```bash
pnpm test                  # Unit tests
pnpm test:integration      # Integration tests
pnpm test:e2e              # E2E browser tests (Playwright)
```
