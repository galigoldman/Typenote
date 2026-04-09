# Quickstart: Math Expression Copy & Paste

**Feature**: 036-math-copy-paste

## What This Feature Does

Makes math expressions in the editor behave like selectable, copyable content — not just clickable edit triggers. Also recognizes math content pasted from external sources (web pages with KaTeX/MathJax, LaTeX-delimited text) and converts them into editable math nodes.

## Key Files to Modify

| File                                       | Change                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/editor/math-extension.ts`         | Add `parseHTML` rules for KaTeX/MathML, add `nodePasteRule` for LaTeX delimiters, add `renderText` for plain-text clipboard |
| `src/components/editor/math-node-view.tsx` | Add selection state UI, action menu (Edit/Copy), change cursor, implement copy-to-clipboard                                 |

## How to Test

1. **Copy within Typenote**: Create a math expression via `:{`, click it, click Copy, paste elsewhere → should create identical math node
2. **Paste from KaTeX site**: Copy rendered math from a KaTeX demo page, paste into Typenote → should create math node
3. **Paste LaTeX text**: Copy `$\frac{1}{2}$` from a text editor, paste into Typenote → should render as math
4. **External paste**: Copy math from Typenote, paste into Notepad → should get LaTeX source text

## Architecture Decisions

- **No new dependencies**: All clipboard handling uses browser APIs + TipTap/ProseMirror built-in infrastructure
- **No backend changes**: Entirely client-side feature
- **No database changes**: Math nodes already stored in document content JSONB
- **Word paste limitation**: Word puts equations as images on clipboard — no web editor has solved this. We handle what's detectable and fall back gracefully.
