# Quickstart: Fix PDF Export Page Deletion

## Branch

```bash
git checkout 039-fix-pdf-export-page-loss
```

## What to Change

### 1. Fix `pageHasContent()` (core bug)

**File**: `src/components/canvas/page-utils.ts`

The `pageHasContent()` function checks if a page has content by looking for `"text"` in the serialized JSON. Math nodes use `"mathExpression"` — add that to the check.

Two places to fix:

- Line 22: `-ftb` text box content check
- Line 28: flow content check

### 2. Add page-count guard in `onRemotePagesUpdate` (race condition)

**File**: `src/components/canvas/canvas-editor.tsx`

In `onRemotePagesUpdate` (~line 556), before `setPages(remote.pages)`, add a guard: if remote has fewer pages than `pagesRef.current`, skip the update. This prevents the echo guard race condition from overwriting local state with stripped pages.

### 3. Unit tests

**Files**:

- `src/components/canvas/__tests__/page-utils.test.ts` — add tests for math-only pages
- `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts` — add test for page-count guard

### 4. E2E test

**File**: `e2e/export-pdf-page-persistence.spec.ts` (new)

Create a Playwright test that:

1. Logs in using `e2e/helpers/auth.ts`
2. Creates a new canvas document
3. Types content on 6 pages
4. Clicks the export/download button
5. Waits 60 seconds
6. Verifies all 6 pages still exist

### 5. Update test registry

**File**: `e2e/TEST_REGISTRY.md` — add the new test scenarios

## Run Tests

```bash
pnpm test                # unit tests
pnpm test:integration    # integration tests
pnpm test:e2e            # E2E browser tests
```
