# Quickstart: Change LaTeX Trigger from $ to :{

## What This Feature Does

Replaces the single `$` keypress that opens the LaTeX math input popup with the two-character sequence `:{`. Typing `:` inserts the colon normally; if `{` immediately follows, the colon is removed and the LaTeX popup opens. All other LaTeX popup behavior (AI conversion, submit, cancel, quota) remains unchanged.

## Files to Modify

| File                                      | Change                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/editor/math-extension.ts`        | Replace `$` key handler with `{` key handler that checks for preceding `:`     |
| `src/lib/editor/math-extension.test.ts`   | Add trigger behavior tests for `:{`, false positives, code context suppression |
| `src/components/editor/tiptap-editor.tsx` | Update comment referencing `$` trigger                                         |
| `src/components/canvas/canvas-editor.tsx` | Update comments referencing `$` trigger                                        |

## How to Test Locally

1. `pnpm dev` — start dev server
2. Open any document in the editor
3. Type `:{` — the LaTeX popup should appear, no `:` or `{` in the document
4. Type `$` — a literal `$` should appear, no popup
5. Type `:` then space — colon and space inserted, no popup
6. Type `:{` inside a code block — both characters inserted literally, no popup

## Run Tests

```bash
pnpm test src/lib/editor/math-extension.test.ts
pnpm test src/lib/editor/math-input-box.test.tsx
```
