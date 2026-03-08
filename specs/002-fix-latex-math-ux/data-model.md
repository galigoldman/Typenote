# Data Model: Fix LaTeX Math UX

**Feature**: 002-fix-latex-math-ux
**Date**: 2026-03-08

## Entity Changes

### MathExpression Node (Modified)

The existing `mathExpression` TipTap node gains one new attribute: `originalText`.

#### Attributes

| Attribute      | Type     | Default | Description                                                      |
| -------------- | -------- | ------- | ---------------------------------------------------------------- |
| `latex`        | `string` | `''`    | The LaTeX code rendered by KaTeX (existing)                      |
| `originalText` | `string` | `''`    | The natural language text originally submitted by the user (new) |

#### Serialized Format (within `documents.content` JSONB)

**Before (001)**:

```json
{
  "type": "mathExpression",
  "attrs": {
    "latex": "\\frac{1}{2} \\times 5"
  }
}
```

**After (002)**:

```json
{
  "type": "mathExpression",
  "attrs": {
    "latex": "\\frac{1}{2} \\times 5",
    "originalText": "one half times five"
  }
}
```

#### HTML Serialization

```html
<!-- Before -->
<span data-type="math-expression" data-latex="\frac{1}{2} \times 5"></span>

<!-- After -->
<span
  data-type="math-expression"
  data-latex="\frac{1}{2} \times 5"
  data-original-text="one half times five"
></span>
```

### Backward Compatibility

- Existing math nodes without `originalText` will default to `''`
- The "Edit Expression" field will be empty for legacy nodes, allowing users to type new text
- No database migration required — `originalText` is stored within the existing `documents.content` JSONB column
- Existing documents with math nodes will continue to render correctly

### State Transitions

```
[No Math] --($pressed)--> [Input Box Visible, Focused]
[Input Box] --(Enter)--> [AI Converting...] --(success)--> [Node Inserted + Saved]
[Input Box] --(Enter)--> [AI Converting...] --(failure)--> [Error Toast, Input Box Dismissed]
[Input Box] --(Escape)--> [No Math]

[Rendered Node] --(click)--> [Edit Panel Visible]
[Edit Panel: Expression] --(Enter, text changed)--> [AI Converting...] --(success)--> [Node Updated + Saved]
[Edit Panel: Expression] --(Enter, text unchanged)--> [Edit Panel Dismissed]
[Edit Panel: LaTeX] --(Enter)--> [Node Updated + Saved]  (no AI call)
[Edit Panel] --(Escape)--> [Edit Panel Dismissed]
```
