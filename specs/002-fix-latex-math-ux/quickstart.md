# Developer Quickstart: Fix LaTeX Math UX

**Feature**: 002-fix-latex-math-ux
**Date**: 2026-03-08

## Prerequisites

- Node.js 18+
- npm or pnpm
- Feature branch `002-fix-latex-math-ux` checked out

## Setup

```bash
git checkout 002-fix-latex-math-ux
npm install   # No new dependencies needed for this feature
```

## Development

```bash
npm run dev   # Start Next.js dev server
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/editor/math-extension.ts` | Add `originalText` attribute to MathExpression node |
| `src/components/editor/math-node-view.tsx` | Remove background styles, add click handler, add edit panel |
| `src/lib/editor/math-input-box.tsx` | Fix auto-focus timing |
| `src/components/editor/tiptap-editor.tsx` | Pass `originalText` through `insertMath`, fix save timing |
| `src/hooks/use-auto-save.ts` | Fix `flush()` race condition with status check |

## Testing

```bash
npm run test          # Run all unit tests
npm run test:e2e      # Run Playwright e2e tests
```

### Manual Test Checklist

1. **Auto-save on Enter**: Type `$` → enter math → press Enter → refresh page → math still present
2. **Cursor focus**: Type `$` → immediately start typing → characters appear in input box
3. **No blue overlay**: Insert math → verify no colored background on rendered expression
4. **Click-to-edit**: Click rendered math → verify edit panel appears with two modes
5. **Expression edit (unchanged)**: Click math → Edit Expression → press Enter without changes → verify no API call
6. **Expression edit (changed)**: Click math → Edit Expression → modify text → press Enter → verify new LaTeX
7. **LaTeX edit**: Click math → Edit LaTeX → modify code → press Enter → verify re-render
8. **Escape to cancel**: In any edit mode → press Escape → verify no changes

## Architecture Notes

- **No new dependencies** — this feature modifies existing files only
- **No API changes** — reuses existing `POST /api/ai/latex`
- **No database migration** — `originalText` stored in existing JSONB content
- **Backward compatible** — existing math nodes render normally (default `originalText: ''`)
