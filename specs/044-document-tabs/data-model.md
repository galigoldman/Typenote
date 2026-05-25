# Data Model: Document Tabs

## Overview

This feature is **purely client-side** — no database migrations or schema changes needed. The data model describes the client-side state stored in React context and persisted to localStorage.

## Entities

### OpenTab

Represents a single document tab in the tab bar.

| Field | Type | Description |
|---|---|---|
| documentId | string (UUID) | References `documents.id` in Supabase |
| title | string | Document title displayed in the tab |

**Relationships**: References existing `documents` table (read-only, no FK enforced client-side).

**Validation**:
- `documentId` must be a valid UUID
- `title` must be non-empty (fallback to "Untitled" if empty)

### TabSession

The full tab state for a user session on a given browser/device.

| Field | Type | Description |
|---|---|---|
| tabs | OpenTab[] | Ordered list of open tabs (insertion order) |
| activeTabId | string (UUID) | The `documentId` of the currently active tab |

**Validation**:
- `activeTabId` must be present in `tabs` array
- `tabs` must not contain duplicate `documentId` values
- If `tabs` is empty, `activeTabId` is null (no active tab → redirect to dashboard)

**Persistence**: Serialized as JSON to `localStorage` under key `typenote:tabs`.

## State Transitions

```
[No Tabs] → openTab(doc) → [1 Tab, Active]
[N Tabs] → openTab(doc) → [N+1 Tabs, New Tab Active]
[N Tabs] → openTab(existingDoc) → [N Tabs, Existing Tab Focused]
[N Tabs] → closeTab(docId) → [N-1 Tabs, Adjacent Tab Active]
[1 Tab] → closeTab(docId) → [No Tabs] → Redirect to Dashboard
[N Tabs] → switchTab(docId) → [N Tabs, Target Tab Active]
[Restore from localStorage] → validateTabs() → [Valid Tabs Only]
```

## No Database Changes

This feature does not modify any Supabase tables, RLS policies, or migrations. All state is ephemeral and local to the browser. If localStorage is cleared, tabs reset to empty (the user simply sees the dashboard).
