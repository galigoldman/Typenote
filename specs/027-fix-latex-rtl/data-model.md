# Data Model: Fix LaTeX Math Direction in RTL Text

**Date**: 2026-03-24
**Feature**: 027-fix-latex-rtl

## No Data Model Changes

This feature is a presentation-layer fix only. No database schema changes, migrations, or data transformations are required.

- **Existing data**: LaTeX expressions are stored as plain strings in the `content` attribute of `mathExpression` nodes within TipTap's JSON document structure (stored in the `pages` JSONB column of the `documents` table).
- **No migration needed**: The stored LaTeX strings are direction-agnostic — the rendering direction is determined at display time by CSS.
- **No seed data changes**: No new tables, columns, or reference data.
