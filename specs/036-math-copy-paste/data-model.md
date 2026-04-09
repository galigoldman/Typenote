# Data Model: Math Expression Copy & Paste

**Feature**: 036-math-copy-paste
**Date**: 2026-04-09

## Overview

No new database tables or schema changes required. This feature operates entirely on the client-side, modifying how existing `mathExpression` TipTap nodes are serialized to/from the clipboard and how external math formats are parsed on paste.

## Existing Entity: Math Expression Node

The `mathExpression` node is already defined in the TipTap schema as an inline, atomic node.

**Attributes** (no changes):

| Attribute      | Type   | Description                                          |
| -------------- | ------ | ---------------------------------------------------- |
| `latex`        | string | The compiled LaTeX code (e.g., `\frac{1}{2}`)        |
| `originalText` | string | The user's natural-language input (e.g., "one half") |

**HTML Serialization** (no changes to schema, but additional `parseHTML` rules added):

| Format               | Selector                            | Attributes Read                                       |
| -------------------- | ----------------------------------- | ----------------------------------------------------- |
| Typenote native      | `span[data-type="math-expression"]` | `data-latex`, `data-original-text`                    |
| KaTeX rendered (NEW) | `span.katex`                        | LaTeX from `annotation[encoding="application/x-tex"]` |
| MathML (NEW)         | `math` element                      | LaTeX from `annotation[encoding="application/x-tex"]` |

## Clipboard Data Formats

When a math expression is copied from Typenote, the clipboard contains:

| MIME Type    | Content                                                                                                     | Purpose                          |
| ------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `text/html`  | `<span data-type="math-expression" data-latex="..." data-original-text="...">` with `data-pm-slice` wrapper | Round-trip paste within Typenote |
| `text/plain` | Raw LaTeX source (e.g., `\frac{1}{2}`)                                                                      | Paste into external apps         |

## State Transitions

Math node interaction states:

```
Idle → (click/tap) → Selected → (click Edit) → Editing
                    → (click Copy) → Idle (clipboard written)
                    → (click elsewhere) → Idle
```
