# Quickstart: Fix Image Resize and Position Not Persisting

## Prerequisites

- Local Supabase running (`supabase start`)
- Dependencies installed (`pnpm install`)
- Dev server running (`pnpm dev`)

## The Fix (1 file change)

### File: `src/hooks/use-auto-save.ts`

**What to change**: The unmount cleanup effect (around line 168-173) currently clears pending save timers. Change it to fire the save function before clearing.

**Current code** (buggy):

```typescript
useEffect(() => {
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  };
}, []);
```

**Fixed code**:

```typescript
useEffect(() => {
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      // Fire pending save immediately instead of discarding it
      saveFnRef.current().catch(() => {});
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };
}, []);
```

## Testing

### 1. Unit test (write first -- TDD)

Add a test in `src/hooks/use-auto-save.test.ts`:

- Trigger a save, then unmount before debounce fires
- Assert that `saveFn` was called (not just scheduled)

### 2. Manual verification

1. Open a document in the canvas editor
2. Paste an image (Cmd+V with image in clipboard)
3. Resize the image using corner handles
4. Navigate to the dashboard immediately
5. Return to the document
6. Verify the image is at the resized dimensions

### 3. E2E test (Playwright)

Add a test that automates the manual verification above:

- Log in, open document, paste image, resize, navigate away, return, check dimensions

### 4. Run full suite

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

## Why This Works

- `saveFnRef.current()` calls `updateDocumentContent()` which is a Next.js server action
- Server actions use `fetch` under the hood
- `fetch` requests continue to completion even after the calling React component unmounts
- React 19 treats `setState` on unmounted components as a no-op (safe)
- The save data comes from `pagesRef.current` which is already updated by `setPages()` before `triggerSave()` was called
