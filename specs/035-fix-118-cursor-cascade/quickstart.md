# Quickstart: Fix Cursor Jumps in Multi-Page Reflow Cascade

**Feature**: 035-fix-118-cursor-cascade
**Date**: 2026-04-09

This is a step-by-step guide to picking up this feature, reproducing the bugs, applying the fix, and verifying it. Designed so a contributor can finish the work in one focused session.

## 0. Prerequisites

```bash
# You should be on the feature branch (created by /speckit.specify)
git status
# → On branch 035-fix-118-cursor-cascade

# All deps installed and Supabase running
pnpm install
supabase start
```

## 1. Reproduce the bugs manually

```bash
pnpm dev
```

Open the app in a browser, log in with `test@typenote.dev` / `Test1234`, create a new document.

**Reproduce Bug A** (cursor jumps to a different part of the page):

1. Type or paste a ~9-page document. Quick way: open the dev tools console on the canvas editor page and run:
   ```js
   // Find the visible text box editor on page 1 and bulk-fill it.
   // (You'll do this more cleanly in the E2E test fixture; this is just for manual smoke testing.)
   ```
   Or type / paste lots of dense text by hand.
2. Place the cursor on the **last visible line of the document** (last line of page 9).
3. Press `Enter`.
4. **Expected (post-fix)**: cursor lands on the new empty paragraph on a freshly-created page 10.
5. **Actual (current branch)**: cursor sometimes lands somewhere unrelated on a different page; you'll see it move ~300 ms after the keystroke.

**Reproduce Bug B** (cursor jumps to page 9):

1. Same 9-page document.
2. Place the cursor on the **last line of page 1** (or first line of page 2 — the visual border).
3. Press `Enter`.
4. **Expected (post-fix)**: cursor lands on the empty paragraph on page 2 (or stays on page 1 if your cursor was actually mid-block on page 1 — see Bug C).
5. **Actual (current branch)**: cursor jumps all the way to page 9.

**Reproduce Bug C** (middle-of-page Enter moves cursor to wrong page — discovered during clarification):

1. Same 9-page document.
2. Place the cursor in the **middle of a paragraph in the middle of page 1**.
3. Press `Enter`.
4. **Expected (post-fix)**: cursor stays on page 1 at the start of the new line.
5. **Actual (current branch)**: cursor jumps to page 2 (because the current code always moves cursor to "next page" after any cascade).

## 2. Write the failing tests

Per Constitution Principle II (test-driven), write the failing tests **before** writing the fix.

### 2a. Pure-function unit test

Create `src/components/canvas/__tests__/cursor-target.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideCursorTarget } from '@/lib/canvas/cursor-target';

describe('decideCursorTarget', () => {
  it('returns "stay" when cursor is in a block before the split', () => {
    expect(decideCursorTarget(5, 0, 15)).toEqual({ kind: 'stay' });
  });

  it('returns "move" when cursor is in the boundary block', () => {
    expect(decideCursorTarget(15, 0, 15)).toEqual({
      kind: 'move',
      newBlockIndex: 0,
      offset: 0,
    });
  });

  it('returns "move" when cursor is past the split', () => {
    expect(decideCursorTarget(18, 4, 15)).toEqual({
      kind: 'move',
      newBlockIndex: 3,
      offset: 4,
    });
  });

  it('handles cursor at index 0 (top of page) — stays unless split is also 0', () => {
    expect(decideCursorTarget(0, 0, 5)).toEqual({ kind: 'stay' });
    expect(decideCursorTarget(0, 0, 0)).toEqual({
      kind: 'move',
      newBlockIndex: 0,
      offset: 0,
    });
  });

  it('preserves the within-block offset across the move', () => {
    expect(decideCursorTarget(20, 42, 17)).toEqual({
      kind: 'move',
      newBlockIndex: 3,
      offset: 42,
    });
  });
});
```

Run it:

```bash
pnpm test cursor-target
```

It will fail (file doesn't exist yet) — that's correct.

### 2b. E2E test (Playwright)

Create `e2e/canvas-editor-cursor-cascade.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { createDocumentWithNearFullPages } from './helpers/canvas-fill-pages';

test.describe('Canvas editor: cursor cascade', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Enter at end of last page creates new page and cursor lands there', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: 9 });
    // Place cursor at end of last visible line
    // ... (see helper)
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Enter');
    // Wait for the cursor to settle, then assert position
    await page.waitForFunction(() => {
      // Check that the active editor's selection is on a brand-new page
      // ...
    });
    const t1 = await page.evaluate(() => performance.now());
    expect(t1 - t0).toBeLessThan(100);
    // Assert cursor is on the new page (page 10)
    // ...
  });

  test('Enter at boundary of pages 1-2 puts cursor on page 2, never page 9', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: 9 });
    // Place cursor on the LAST line of page 1
    // ...
    await page.keyboard.press('Enter');
    // Wait for cascade to settle
    // Assert cursor is on page 2 (NOT page 9)
    // ...
  });

  test('Enter in middle of a paragraph keeps cursor on the same page', async ({
    page,
  }) => {
    await createDocumentWithNearFullPages(page, { pages: 9 });
    // Place cursor mid-paragraph on page 1
    // ...
    await page.keyboard.press('Enter');
    // Assert cursor is STILL on page 1
    // ...
  });

  test('Hebrew (RTL) document: same rules apply', async ({ page }) => {
    await createDocumentWithNearFullPages(page, { pages: 9, language: 'he' });
    // Repeat the three scenarios above
    // ...
  });
});
```

Run them:

```bash
pnpm test:e2e canvas-editor-cursor-cascade
```

They will fail — that's correct.

## 3. Apply the fix

### 3a. Create the pure-function helper

Create `src/lib/canvas/cursor-target.ts` with the `decideCursorTarget` function from research.md, Decision 3.

Run unit test — should now pass.

### 3b. Refactor `handleTextBoxOverflow`

In `src/components/canvas/canvas-editor.tsx`:

1. **Remove**:
   - The `cascadeCursorTargetRef` declaration and all references to it.
   - The `__NEW__` sentinel logic.
   - The `setTimeout(..., 300)` block at the end of the multi-block path.
   - The `isOutermostHop` variable and the related guard-setting code.
2. **Add**:
   - A new ref `cascadeTargetTextBoxIds: React.MutableRefObject<Set<string>>` initialized to `new Set()`.
3. **Modify** `handleTextBoxOverflow`:
   - At entry, check `cascadeTargetTextBoxIds.current.has(textBoxId)`. If yes → `isInnerHop = true`; remove the ID from the set after the synchronous work completes.
   - Capture `cursorBlockIndex` and `cursorOffsetInBlock` from `editor.state.selection.$from`.
   - Compute `splitIdx` (existing code).
   - Call `decideCursorTarget(cursorBlockIndex, cursorOffsetInBlock, splitIdx)`.
   - Do the existing `deleteRange` + `handleTextOverflow` hand-off.
   - **If** the result is `{ kind: 'move' }` and `isInnerHop === false`:
     - After the hand-off, get the next page's editor (use the new `focusPage` extension that takes a target position; see step 3c).
     - Compute the ProseMirror position from `newBlockIndex` and `offset`.
     - Set the next page's editor selection at that position and focus it.
   - **If** the result is `{ kind: 'stay' }` and `isInnerHop === false`:
     - Do nothing extra. The current text box editor's selection survives the deleteRange.
   - **If** `isInnerHop === true`:
     - Do not touch focus or selection on any editor.
   - **In all cases**: add the next page's text box ID to `cascadeTargetTextBoxIds.current` so its `handleTextBoxHeightMeasured` will be classified as an inner hop.

### 3c. Extend `focusPage` to accept a target position

The current `focusPage` signature is `(pageId, overflowContent, isExistingPage, attempt)`. Add an optional target position:

```ts
focusPage(
  pageId: string,
  overflowContent: Record<string, unknown> | null,
  isExistingPage: boolean,
  cursorTarget?: { blockIndex: number; offset: number },  // NEW
  attempt = 0,
);
```

When `cursorTarget` is provided, after the editor is found / mounted, set its selection at the corresponding ProseMirror position instead of calling `focus('start')`.

### 3d. Run all tests

```bash
pnpm test                    # all unit tests
pnpm test:integration        # all integration tests (Supabase)
pnpm test:e2e                # all E2E (Playwright)
```

All five new tests should now pass. All existing tests should also still pass.

## 4. Manual smoke test

```bash
pnpm dev
```

Repeat the manual reproduction from step 1 in the browser. Verify:

- Bug A: cursor lands instantly on the new page after Enter at end-of-document.
- Bug B: cursor lands on page 2 (not page 9) when Enter at the page-1/2 boundary.
- Bug C: cursor stays on page 1 when Enter mid-paragraph.
- No visible flicker, no 300 ms delay, no cursor "stop in the wrong place".
- Repeat in a Hebrew (RTL) document.

## 5. Open the PR

Per Constitution Principle III:

```bash
git push -u origin 035-fix-118-cursor-cascade
gh pr create \
  --base fix/118-reflow-surgical \
  --title "fix(editor): cursor stays at user's edit position in multi-page cascade" \
  --body "$(cat <<'EOF'
## Summary

- Fix cursor jumping to wrong page when Enter triggers a multi-page reflow cascade
- Replace 300 ms setTimeout heuristic with deterministic, pure-function cursor target rule
- Cursor now lands at its final position on the same frame as the keystroke (move-first strategy)

## Test plan

- [ ] `pnpm test cursor-target` (new unit test for the rule)
- [ ] `pnpm test:e2e canvas-editor-cursor-cascade` (new E2E for all 4 scenarios)
- [ ] `pnpm test && pnpm test:integration && pnpm test:e2e` (full suite)
- [ ] Manual smoke test in browser, both LTR and RTL documents

Closes follow-up to #118.
EOF
)"
```

CI must pass before merge.
