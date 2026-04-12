# Data Model: Auto-Expanding LaTeX Editor

**Feature**: 038-latex-editor-resize
**Date**: 2026-04-12

## N/A

This feature is a purely client-side UI change. No database tables, entities, or data structures are created or modified.

The existing `mathExpression` TipTap node attributes (`latex`, `originalText`) remain unchanged. Only the input element used to edit these values is being modified (from `<input>` to `<textarea>`).
