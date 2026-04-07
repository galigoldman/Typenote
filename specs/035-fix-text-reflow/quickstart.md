# Quickstart: Verifying the Text Reflow Fix

**Feature**: 035-fix-text-reflow
**Date**: 2026-04-07

## Prerequisites

1. Local Supabase running: `supabase start` (confirm with `supabase status`).
2. Dev server running: `pnpm dev` (default http://localhost:3000).
3. Signed in as the seeded test user: `test@typenote.dev` / `Test1234`.

## Manual verification

### Step 1 — Reproduce the bug (before fix)

Run these steps against the CURRENT `dev` branch to observe the bug, then run them again after the fix to confirm resolution.

1. Navigate to `/dashboard` and open any existing canvas-backed document (one that was created via the "New Canvas Document" button — these have `pages` populated).
2. Switch the tool to **Text** (the "T" button in the toolbar, or press `t`).
3. Click anywhere in the first page to start a flow editor cursor.
4. **Hold down a letter key** (or press repeatedly) for 30+ seconds while watching the page. Continue past the visible bottom of the first page.
5. **Expected before fix** (reproducing issue #118): one or more of the following symptoms is observed intermittently:
   - Text "stops flowing" — the cursor stays visible but subsequent characters don't move to a new page.
   - A new page is created, but the cursor doesn't follow it.
   - A very long word extends past the right edge of the page and is visually cut off.
   - After holding the key long enough to cross two page boundaries, the total page count is wrong (missing a page, or with an empty extra page).
6. **Expected after fix**: the typing flows smoothly from page to page. New pages are created automatically. The cursor always follows the content. No visible flicker or missing content.

### Step 2 — Verify line wrapping with long words

1. In a fresh canvas document in Text mode, paste this string into the first page:

   ```
   https://example.com/this-is-a-very-long-url-with-no-word-boundaries-that-should-still-wrap-at-the-right-edge-of-the-page-instead-of-running-off
   ```

2. **Expected**: the URL wraps somewhere visible on the page. No part of it extends past the right edge.
3. **Before fix**: the URL extends past the right edge and is clipped by the `overflow-hidden` text layer.

### Step 3 — Verify paste overflow cascade

1. In a fresh canvas document, ensure you have exactly one page.
2. Copy the following 12-paragraph block to your clipboard. Any 12-paragraph block of ~60-character paragraphs works; example text:

   ```
   Paragraph one. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph two. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph three. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph four. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph five. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph six. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph seven. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph eight. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph nine. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph ten. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph eleven. Lorem ipsum dolor sit amet consectetur adipiscing.
   Paragraph twelve. Lorem ipsum dolor sit amet consectetur adipiscing.
   ```

3. Click inside the first page (Text mode active), then paste (Cmd+V or Ctrl+V).
4. **Expected after fix**: the document now has 2 or more pages. Paragraphs 1–6 (approximately) are on page 1, paragraphs 7–12 (approximately) are on page 2. All 12 paragraphs are visible in the document. Cursor is on the page containing paragraph 12.
5. **Before fix**: may result in missing paragraphs, an extra blank page, cursor on the wrong page, or visible flash during the cascade.

### Step 4 — Verify drawings are undisturbed

1. Open a canvas document that has both drawings (strokes) and flow text across multiple pages.
2. Add text to the first page until it overflows.
3. **Expected**: the drawings on page 1 and page 2 are unchanged after the text reflow. Only the text content moves between pages.

## Automated verification

### Unit tests

```bash
pnpm test src/lib/canvas/__tests__/overflow-utils.test.ts
```

All tests in this file must pass, including the updated assertions for the "block 0 overflows" cases (which now expect `null` instead of `1`).

### End-to-end test

```bash
pnpm test:e2e e2e/canvas-type-mode-flow.spec.ts
```

This new spec runs the paste-overflow scenario from Step 3 above inside a real Chromium browser. It is registered in `e2e/TEST_REGISTRY.md` under the "Canvas Editor" section.

### Full suite

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

Must all pass before the PR can be merged to `dev` (constitution principle III).

## Rollback plan

The fix is a four-location CSS/TypeScript change with no schema migration and no data shape change. If a regression is discovered after merge:

1. Revert the PR commit on `dev`.
2. Re-run CI to confirm the revert is clean.
3. No data repair is needed — existing documents' `pages[i].flowContent` JSON is unchanged by this fix.

## Known limitations (intentional, see spec.md)

- Backward reflow (pulling content back from later pages when a page becomes under-filled after deletion) is NOT implemented by this fix.
- CJK/Thai line-break points are still handled by native browser logic, not by custom code.
- The standalone `TiptapEditor` (used for imported `.docx` text-only documents) is unaffected and has no pagination — that is by design.
