# Quickstart: Fix Image Paste Target & Cross-Page Object Movement

## Setup

```bash
pnpm install        # No new dependencies
pnpm dev            # Start dev server
```

## Test the Bug (before fix)

1. Open any document with 3+ pages
2. Scroll to page 3
3. Copy an image from the web (right-click → Copy Image)
4. Press Cmd+V / Ctrl+V in the document
5. **Bug**: Image appears on page 1 instead of page 3

## Key Files to Modify

| File | Change | Priority |
| ---- | ------ | -------- |
| `src/components/canvas/canvas-editor.tsx` | Fix paste page detection fallback (line ~2339) | P1 |
| `src/components/canvas/canvas-editor.tsx` | Add `cross-page-move` undo action type (~line 510) | P2 |
| `src/components/canvas/canvas-editor.tsx` | Add `handleCrossPageMove` callback | P2 |
| `src/hooks/use-selection.ts` | Detect page boundary crossing at drag commit (~line 962) | P2 |
| `src/types/canvas.ts` | No changes needed (types are sufficient) | - |

## Verify the Fix

```bash
pnpm test                # Unit tests
pnpm test:integration    # Integration tests (no DB changes, should pass)
pnpm test:e2e            # E2E tests
```

## No Database Changes

This feature is entirely client-side. No migrations, no seed updates, no RLS changes.
