# Data Model: Change LaTeX Trigger from $ to :{

## No Data Model Changes Required

This feature modifies only the client-side keyboard trigger mechanism in the ProseMirror plugin. No database tables, columns, or stored data formats are affected.

### Existing Entities (Unchanged)

- **MathExpression Node** (TipTap/ProseMirror): Inline atom node with `latex` (string) and `originalText` (string) attributes. Stored as part of the document's `content` JSONB column in the `documents` table via Supabase. The trigger change does not alter how math nodes are created, stored, or rendered — only how the input popup is invoked.
