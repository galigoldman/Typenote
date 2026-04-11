# Implementation Plan: Math Expression Copy & Paste

**Branch**: `036-math-copy-paste` | **Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-math-copy-paste/spec.md`

## Summary

Make math expressions selectable with an Edit + Copy action menu, support copying math to clipboard in dual format (HTML + LaTeX plain text), and recognize math content on paste from external sources (KaTeX/MathJax HTML, MathML with annotations, LaTeX-delimited plain text). No new dependencies or backend changes — entirely client-side using TipTap/ProseMirror's built-in paste pipeline and the browser Clipboard API.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), TipTap 3 (ProseMirror), KaTeX 0.16.x
**Storage**: N/A — no database changes, client-side only
**Testing**: Vitest (unit tests for extension logic), Playwright (E2E for copy-paste flows)
**Target Platform**: Modern browsers (Chrome 76+, Safari 13.1+, Firefox 127+), desktop + iPad
**Project Type**: Web application (Next.js)
**Performance Goals**: Copy/paste completes in <100ms (no API calls involved)
**Constraints**: No new npm dependencies; must work in both canvas page mode and text-only mode
**Scale/Scope**: 2 files modified (`math-extension.ts`, `math-node-view.tsx`), ~200 lines added

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                        |
| ------------------------------- | ------ | ---------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | No new infrastructure needed — extends existing math extension               |
| II. Test-Driven Quality         | PASS   | Unit tests for paste rules + parse rules, E2E for copy-paste flows           |
| III. Protected Main Branch      | PASS   | Working on feature branch `036-math-copy-paste`                              |
| IV. Migrations as Code          | N/A    | No database changes                                                          |
| V. Interview-Ready Architecture | PASS   | Explains TipTap paste pipeline, Clipboard API, and ProseMirror serialization |

**Post-Phase 1 re-check**: No violations. No new dependencies, no schema changes, no new services.

## Project Structure

### Documentation (this feature)

```text
specs/036-math-copy-paste/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research findings
├── data-model.md        # Data model (no DB changes)
├── quickstart.md        # Quick reference
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task list (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── lib/
│   └── editor/
│       └── math-extension.ts        # MODIFY: add parseHTML rules, paste rules, renderText
├── components/
│   └── editor/
│       └── math-node-view.tsx        # MODIFY: selection UI, action menu, copy button
└── (no new files)
```

### Test Files

```text
src/
├── lib/
│   └── editor/
│       └── math-extension.test.ts   # MODIFY: add tests for new parseHTML rules + paste rules
├── components/
│   └── editor/
│       └── math-node-view.test.tsx   # MODIFY: add tests for selection state + copy action
e2e/
└── math-copy-paste.spec.ts           # NEW: E2E tests for clipboard round-trip
```

## Design Decisions

### D1: Selection + Action Menu (not direct edit on click)

**Current behavior**: Clicking a math node immediately opens the edit panel.
**New behavior**: Clicking selects the node and shows an action menu (Edit / Copy). Edit opens the panel as before.

**Why**: The current behavior makes it impossible to select-then-copy. The action menu pattern follows how other rich editors handle inline objects. The `selected` prop from TipTap NodeView is already available but unused.

**Interview talking point**: This is the Command pattern — user intent (select) is separated from action (edit/copy), making the interaction composable.

### D2: Layered Paste Strategy

Three layers handle different paste sources, each using the most appropriate TipTap/ProseMirror mechanism:

| Layer                  | Mechanism                 | Handles                                                                   |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------- |
| 1. `parseHTML()` rules | Schema-level DOM matching | KaTeX spans (`span.katex`), MathML (`<math>`) with `<annotation>`         |
| 2. `addPasteRules()`   | Post-insertion regex      | LaTeX delimiters in plain text (`$...$`, `\(...\)`, `$$...$$`, `\[...\]`) |
| 3. Native round-trip   | `data-pm-slice` metadata  | Copy-paste within Typenote (already works)                                |

**Why layered**: Each mechanism is purpose-built for its format. `parseHTML` works on DOM structure (ideal for HTML formats), `nodePasteRule` works on text patterns (ideal for LaTeX delimiters). No single mechanism handles all cases well.

**Interview talking point**: This demonstrates the Strategy pattern — different parsing strategies selected based on input format, composed through TipTap's extension system.

### D3: Clipboard Write with `serializeForClipboard`

Use ProseMirror's built-in `serializeForClipboard(view, slice)` to produce the HTML, which includes the `data-pm-slice` attribute for lossless round-trip. Override plain-text with the LaTeX source via `renderText()` on the node spec.

**Why**: `data-pm-slice` encodes the open/close depth and node context, which ProseMirror uses to reconstruct the exact document structure on paste. Manual HTML construction would lose this metadata.

### D4: Word Paste Limitation (Scoped Out of P2)

Word equations arrive as `<img>` tags pointing to local temp files that browsers block. No web editor has solved this. Our approach:

- If the user has enabled "Copy MathML to clipboard" in Word, we detect MathML in `text/plain` and convert it (best-effort).
- Otherwise, we preserve whatever text representation Word provides (graceful fallback).
- The existing `.docx` file import feature (via mammoth) remains the recommended path for importing Word documents with math.

This is documented as a known limitation, not a failure.

## Implementation Phases

### Phase 1: Math Node Selection + Action Menu (P1 core)

**Goal**: Click a math expression → it gets selected → shows Edit + Copy buttons.

1. Modify `math-node-view.tsx`:
   - Use the `selected` prop to conditionally render an action menu
   - Show Edit button (opens existing edit panel) and Copy button
   - Change cursor from `pointer` to `default`
   - Add selection highlight styling (border or background)
   - Clicking the node triggers ProseMirror's native `NodeSelection` (remove the direct `openEditor` onClick)

2. Add unit tests for selection state rendering and button visibility.

### Phase 2: Copy to Clipboard (P1 core)

**Goal**: Copy button writes math to clipboard in dual format.

1. Modify `math-node-view.tsx`:
   - Implement `handleCopy` function using `navigator.clipboard.write()` with `ClipboardItem`
   - HTML format: use `editor.view.serializeForClipboard(slice)` for round-trip fidelity
   - Plain text format: LaTeX source code
   - Show brief "Copied!" feedback

2. Modify `math-extension.ts`:
   - Add `renderText({ node })` returning `node.attrs.latex` so native copy (Ctrl+C with node selected) also produces LaTeX as plain text

3. Add unit tests for clipboard write and renderText.

### Phase 3: Paste from External HTML Sources (P2)

**Goal**: Recognize KaTeX/MathJax/MathML in pasted HTML and create math nodes.

1. Modify `math-extension.ts` — add `parseHTML()` rules:
   - `span.katex` → extract LaTeX from `annotation[encoding="application/x-tex"]`
   - `math` element → extract LaTeX from `annotation[encoding="application/x-tex"]`
   - Both rules return `false` (skip) if no annotation found, preserving fallback behavior

2. Add unit tests for each parseHTML rule with sample HTML from KaTeX and MathML.

### Phase 4: Paste LaTeX-Delimited Text (P2)

**Goal**: Recognize `$...$`, `$$...$$`, `\(...\)`, `\[...\]` in pasted plain text.

1. Modify `math-extension.ts` — add `addPasteRules()`:
   - `nodePasteRule` for `$...$` (inline, not `$$`)
   - `nodePasteRule` for `$$...$$` (display math)
   - `nodePasteRule` for `\(...\)` (inline)
   - `nodePasteRule` for `\[...\]` (display)
   - Each extracts the LaTeX content and creates a `mathExpression` node

2. Add unit tests for each paste rule pattern.

### Phase 5: Cursor + Polish (P3)

**Goal**: Fix cursor style, ensure atomic selection in text ranges.

1. Modify `math-node-view.tsx`:
   - CSS: Change `cursor: pointer` to `cursor: default` on the math span
   - Verify that selecting a text range across a math node includes it atomically (should work by default since `atom: true`)

2. E2E tests:
   - Create math, select, copy, paste → verify round-trip
   - Paste KaTeX HTML → verify math node created
   - Paste `$\frac{1}{2}$` text → verify math node created
   - Copy math from Typenote → paste into text field → verify LaTeX text
