# Quickstart: Auto-Expanding LaTeX Editor

**Feature**: 038-latex-editor-resize
**Branch**: `038-latex-editor-resize`

## What This Feature Does

Changes the LaTeX editing inputs from fixed single-line `<input>` fields to auto-expanding `<textarea>` fields that grow vertically to fit content. Applies to both the quick math input (`:{ ` trigger) and the edit panel on existing math expressions.

## Files to Modify

| File                                            | Change                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| `src/lib/editor/math-input-box.tsx`             | Replace `<input>` with auto-expanding `<textarea>` |
| `src/components/editor/math-node-view.tsx`      | Replace `<input>` with auto-expanding `<textarea>` |
| `src/lib/editor/math-input-box.test.tsx`        | Update tests for textarea element                  |
| `src/components/editor/math-node-view.test.tsx` | Update tests for textarea element                  |
| `e2e/latex-math.spec.ts`                        | Add E2E scenario for long expression editing       |

## No New Files Needed

This feature modifies existing components only. No new hooks, utilities, or dependencies.

## No Database Changes

Purely client-side UI change.

## How to Test Locally

```bash
pnpm dev
# Navigate to a document, create a math expression with :{
# Edit the expression and type a long LaTeX string
# Verify the input area grows vertically
pnpm test          # Unit tests
pnpm test:e2e      # E2E tests
```
