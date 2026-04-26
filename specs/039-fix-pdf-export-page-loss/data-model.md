# Data Model: Fix PDF Export Page Deletion

N/A — no database changes. This is a purely client-side fix affecting page content detection logic and Realtime sync guards.

The existing `documents.pages` JSONB column is unchanged. The fix ensures that pages containing `mathExpression` TipTap nodes are no longer incorrectly classified as empty and stripped during auto-save serialization.
