# Research: Math Expression Copy & Paste

**Feature**: 036-math-copy-paste
**Date**: 2026-04-09

## R1: Word Math Clipboard Format

**Decision**: Word math from clipboard cannot be reliably converted to LaTeX in the browser. Focus on web sources (KaTeX, MathJax, MathML) and LaTeX-delimited plain text instead.

**Rationale**: When copying from Word, the browser's `text/html` clipboard contains equations as `<img>` tags pointing to local temp files (`file:///...msohtmlclip/clip_image002.png`). Browsers block loading these images for security. MathML is only available if the user manually enables "Copy MathML to clipboard as plain text" in Word's Equation Options — this is off by default and cannot be relied upon. No major web editor (CKEditor, Lexical, Overleaf) has solved this.

**Alternatives considered**:

- Parse OMML from RTF: Browser Clipboard API does not expose `text/rtf` reliably.
- Use `mathml-to-latex` npm package: Only useful if MathML is available, which it isn't by default.
- File import (`.docx` upload): Already supported via mammoth in the personal file import feature. Not a clipboard/paste solution.

**Practical approach for Word**: Detect Word-origin paste (look for `mso-` styles in HTML), check if MathML happens to be in `text/plain` (user enabled the setting), and if so convert it. Otherwise, preserve whatever text representation Word provides rather than dropping content.

## R2: TipTap Paste Pipeline

**Decision**: Use a layered approach — extend `parseHTML()` for structured math formats, use `addPasteRules` (nodePasteRule) for LaTeX-delimited plain text.

**Rationale**: The TipTap/ProseMirror paste pipeline has clear stages:

1. `transformPastedHTML(html)` — string-to-string transform before DOM parsing
2. `DOMParser` with `parseHTML()` rules — matches DOM elements to schema nodes
3. `transformPasted(slice)` — modify parsed Slice before insertion
4. `handlePaste(view, event, slice)` — final interception
5. `addPasteRules` — post-insertion regex on inserted text

For structured HTML (KaTeX spans, MathML elements), extending `parseHTML()` with additional rules is the cleanest approach — the schema parser handles it automatically. For plain-text LaTeX delimiters (`$...$`, `\(...\)`), `nodePasteRule` regex patterns work well as post-insertion transforms.

**Alternatives considered**:

- `transformPastedHTML` for everything: Overkill for formats that map directly to DOM selectors.
- `handlePaste` plugin: Too low-level; would duplicate what `parseHTML` already does.
- `clipboardTextParser`: More complex than `nodePasteRule` for simple regex cases.

## R3: Clipboard Write (Copy Button)

**Decision**: Use `navigator.clipboard.write()` with `ClipboardItem` containing both `text/html` and `text/plain`. Use ProseMirror's `serializeForClipboard` for the HTML to ensure round-trip fidelity via `data-pm-slice`.

**Rationale**: The Clipboard API with `ClipboardItem` is supported in Chrome 76+, Safari 13.1+, Firefox 127+. Since the copy action is triggered by a button click (user gesture), permission is auto-granted. Using `serializeForClipboard` adds the `data-pm-slice` attribute which lets ProseMirror reconstruct the exact node structure on paste — guaranteeing lossless round-trip.

Plain text format: The LaTeX source code (e.g., `\frac{1}{2}`), so pasting into external apps gives useful content.

**Alternatives considered**:

- `document.execCommand('copy')`: Deprecated, cannot independently set HTML and plain text.
- Manual HTML construction: Loses `data-pm-slice` metadata, less reliable round-trip.
- `navigator.clipboard.writeText()` only: Loses HTML structure, paste back into Typenote wouldn't create a math node.

## R4: Current Math Node Interaction Gaps

**Decision**: Leverage the existing `selected` NodeView prop (currently ignored) to show an action menu with Edit + Copy. Change cursor from `pointer` to `default` (text cursor in selection mode).

**Rationale**: The `MathNodeView` component receives `selected: boolean` from TipTap but doesn't use it. The current click handler immediately opens the edit panel. The new flow: click selects the node and shows an action menu; Edit button opens the panel (same as before); Copy button writes to clipboard. This follows the pattern already established by the `HighlightButton` popover in `editor-toolbar.tsx`.

**Alternatives considered**:

- Right-click context menu: Not discoverable on mobile/tablet.
- Long-press for menu: Conflicts with text selection behavior.
- Always-visible buttons on hover: Clutters the reading experience.

## R5: Supported External Math Formats

**Decision**: Support three external paste sources, in priority order:

| Source               | Detection                                                               | Conversion                     |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| KaTeX/MathJax HTML   | `<span class="katex">` with `<annotation encoding="application/x-tex">` | Extract LaTeX from annotation  |
| MathML               | `<math>` elements with `<annotation encoding="application/x-tex">`      | Extract LaTeX from annotation  |
| LaTeX-delimited text | `$...$`, `$$...$$`, `\(...\)`, `\[...\]` in plain text                  | Strip delimiters, use as LaTeX |

**Rationale**: KaTeX and MathJax both embed the original LaTeX in an `<annotation>` tag inside their rendered output. This makes extraction trivial and lossless. For MathML without annotation (e.g., from Word with MathML enabled), we would need `mathml-to-latex` conversion — but this is a rare edge case since Word doesn't put MathML on clipboard by default.

LaTeX-delimited text covers copy-paste from LaTeX editors, Markdown documents, and academic papers.
