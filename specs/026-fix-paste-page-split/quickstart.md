# Quickstart: Fix Paste Content Page Splitting

## Setup

```bash
pnpm install
pnpm dev
```

## Key Files

| File                                      | Purpose                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `src/components/canvas/canvas-page.tsx`   | Overflow detection & split logic (lines 426–518) — **primary change** |
| `src/components/canvas/canvas-editor.tsx` | `handleTextOverflow` callback, `focusPage`, page creation             |
| `src/types/canvas.ts`                     | `CanvasPage`, `PAGE_HEIGHT` constants                                 |

## Testing Manually

1. Open any document in the canvas editor
2. Switch to Text mode
3. Copy 3+ paragraphs from an external source (Word, web page, etc.)
4. Paste into the editor (Ctrl+V / Cmd+V)
5. Verify content splits across multiple pages — no overflow beyond page boundary

## Automated Tests

```bash
pnpm test                    # Unit tests (Vitest)
pnpm test:integration        # Integration tests (requires Supabase)
```

Test files to create:

- `src/components/canvas/__tests__/overflow-detection.test.ts` — unit tests for the overflow split logic
