# Quickstart: Fix Undo Content Persisting in PDF Export

## Problem

After undoing an action on the canvas and exporting to PDF, the undone content still appears. Root cause: `onRemotePagesUpdate` in `canvas-editor.tsx:477` unconditionally overwrites the React `pages` state with database content during a race window between undo and auto-save.

## Fix Overview

Add a guard to `onRemotePagesUpdate` that skips the state overwrite when there are unsaved local changes (`saveStatus === "unsaved"` or `"saving"`).

## Implementation Steps

### 1. Thread `saveStatus` to `onRemotePagesUpdate`

The `onRemotePagesUpdate` callback in `canvas-editor.tsx` needs to know if there are unsaved local changes. Currently, `saveStatus` is returned from `useDocumentSync` but not accessible inside the callback.

**Option A (Recommended)**: Use a ref to track save status inside the callback:

```typescript
// In canvas-editor.tsx, after getting saveStatus from useDocumentSync:
const saveStatusRef = useRef(saveStatus);
useEffect(() => {
  saveStatusRef.current = saveStatus;
}, [saveStatus]);

// Update onRemotePagesUpdate to check:
const onRemotePagesUpdate = useCallback(
  (remotePagesData: Record<string, unknown>) => {
    // Skip remote updates when we have unsaved local changes
    if (
      saveStatusRef.current === 'unsaved' ||
      saveStatusRef.current === 'saving'
    ) {
      return;
    }
    const remote = remotePagesData as unknown as CanvasDocument;
    if (remote?.pages) {
      setPages(remote.pages);
      setRemoteUpdateCounter((c) => c + 1);
    }
  },
  [],
);
```

**Why a ref**: The callback has `[]` deps to avoid re-subscribing the realtime channel. A ref allows reading the latest save status without adding it to the dependency array.

### 2. Handle the `onRemotePagesUpdate` dependency issue

The `onRemotePagesUpdate` callback is currently defined BEFORE `useDocumentSync` is called (which returns `saveStatus`). This creates a chicken-and-egg problem. To solve this:

- Define `saveStatusRef` at the top of the component
- The `useEffect` that updates `saveStatusRef.current = saveStatus` runs after the first render, after `saveStatus` is available

### 3. Write tests

- **Unit test**: Verify that `onRemotePagesUpdate` does not overwrite state when save status is "unsaved"
- **Regression test**: Verify that remote updates still apply when save status is "saved"

## Files to Modify

| File                                      | Change                                           |
| ----------------------------------------- | ------------------------------------------------ |
| `src/components/canvas/canvas-editor.tsx` | Add `saveStatusRef`, guard `onRemotePagesUpdate` |

## How to Test Manually

1. Open a document in the canvas editor
2. Draw a stroke
3. Wait for auto-save (watch for "Saved" indicator)
4. Undo the stroke (Ctrl+Z / Cmd+Z)
5. Immediately export to PDF
6. Verify the PDF does not contain the undone stroke

## Verification Commands

```bash
pnpm test          # Unit tests
pnpm lint          # Linting
pnpm build         # Build check
```
