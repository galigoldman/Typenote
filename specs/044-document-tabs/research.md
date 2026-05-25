# Research: Document Tabs

## R1: Tab Switching Strategy — Client-Side vs Server Navigation

### Decision: Client-side tab state with React context

### Rationale

The current document page (`/dashboard/documents/[docId]/page.tsx`) is a **server component** that fetches document data from Supabase on every navigation. Standard Next.js routing would cause a server round-trip on every tab switch, violating the "instant switching" requirement (SC-001: < 0.5s).

A client-side React context (`TabsProvider`) manages the list of open tabs and the active tab. When switching tabs, the context swaps which document editor is rendered without triggering Next.js server navigation. Document data is cached client-side after the first load, so subsequent switches are instant.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Pure Next.js routing** (`router.push`) | Server round-trip on every switch. Even with `loading.tsx` skeleton, perceived latency is 200-500ms. Does not meet SC-001. |
| **URL query params** (`?tabs=id1,id2&active=id2`) | URL becomes unwieldy with many tabs. Browser history pollution. Hard to share/bookmark. |
| **Next.js Parallel Routes** | Over-engineered for this use case. Parallel routes are designed for modals/slots, not dynamic tab lists. Would require generating route segments dynamically. |
| **Zustand/Redux global store** | Overkill — a simple React context with localStorage persistence is sufficient. No cross-component communication complexity. |

---

## R2: Editor Instance Lifecycle — Mount/Unmount vs Hide/Show

### Decision: Mount/unmount with cached document data

### Rationale

Two approaches exist for managing inactive tab editors:

1. **Hide/Show (CSS `display:none`)**: Keep all editor instances mounted, toggle visibility. Truly instant (no re-render), preserves cursor position and undo history.
2. **Mount/Unmount with cache**: Unmount inactive editors, cache their document data. Remount on switch using cached data (no network fetch).

We choose **mount/unmount** because:
- Each editor instance (TipTap or Canvas) consumes significant memory (DOM nodes, ProseMirror state, canvas buffers)
- Each document subscribes to a Supabase Realtime channel — keeping 10+ channels open is wasteful
- The `useAutoSave` hook runs debounced timers per editor — multiple concurrent timers increase complexity
- Cached data means re-mounting is fast (< 100ms), well within the 0.5s target
- Cursor position loss is an acceptable trade-off for v1

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **CSS hide/show** | Memory scales linearly with open tabs. 10 canvas editors with drawings could consume 200MB+. Realtime channels multiply. |
| **Hybrid (keep last 3 mounted)** | Added complexity for marginal benefit. Cache-based remount is fast enough. |

---

## R3: Tab State Persistence — localStorage vs Database

### Decision: localStorage (browser-local, no database changes)

### Rationale

The spec assumes local persistence (no cross-device sync). `localStorage` is the simplest approach:
- No database migration needed
- No additional API calls
- Instant read/write (synchronous)
- Sufficient capacity (5MB+, tab state is < 1KB)
- Scoped per browser/device naturally

The stored shape:

```json
{
  "tabs": [
    { "documentId": "uuid-1", "title": "Lecture Notes" },
    { "documentId": "uuid-2", "title": "Homework 3" }
  ],
  "activeTabId": "uuid-1"
}
```

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Supabase `user_preferences` table** | Adds database migration, API calls, and sync complexity. Cross-device sync is out of scope for v1. |
| **sessionStorage** | Lost when browser closes, violating FR-010 (persist across sessions). |
| **Cookies** | Size limited (4KB), sent on every request, not appropriate for UI state. |

---

## R4: URL Synchronization

### Decision: Keep URL in sync with active tab using `window.history.replaceState`

### Rationale

The URL should always reflect the active document (`/dashboard/documents/{activeDocId}`) so that:
- Browser refresh loads the correct document
- Bookmarking works naturally
- The sidebar's "active document" highlighting works correctly

We use `window.history.replaceState` (not `router.push`) to update the URL without triggering Next.js server navigation. This keeps the URL as a reflection of tab state, not a driver of it.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **`router.replace`** (Next.js) | Triggers RSC re-render unnecessarily. We already have the document data cached. |
| **Static URL** (don't update) | Breaks refresh, bookmark, and sidebar highlighting. |

---

## R5: Navigation Interception

### Decision: Intercept document link clicks in `SidebarFolderTree` and `DocumentCard`

### Rationale

Currently, navigating to a document uses `router.push('/dashboard/documents/${id}')`. To add documents as tabs instead of doing a full navigation, we need to intercept these navigation calls and delegate to the `TabsProvider`.

Two approaches:
1. **Modify each navigation call site** — change `router.push` to `tabsContext.openTab(id, title)` in `DocumentCard`, `SidebarFolderTree`, etc.
2. **Middleware/wrapper** — wrap `router.push` to detect document URLs and intercept them.

We choose **approach 1** (explicit modification) because:
- Only a few call sites exist (DocumentCard, SidebarFolderTree, material/file openers)
- Explicit is better than implicit — no "magic" URL interception
- Some navigations (e.g., server action redirects from `openMaterialAsDocument`) will need special handling anyway

---

## R6: Document Data Fetching for Tabs

### Decision: Client-side fetch using existing server actions on tab open

### Rationale

When a new tab is opened, the document data must be fetched. The current server component fetches data via Supabase directly. Since tabs operate client-side, we need client-callable data fetching.

The project already has server actions in `src/lib/actions/documents.ts`. We'll add (or reuse) a `getDocument(docId)` server action that the `TabsProvider` can call when opening a new tab. This returns the same document data the page.tsx server component currently fetches.

This keeps data fetching on the server (secure, uses service role or RLS) while being callable from client components.

---

## R7: Handling Deleted Documents in Open Tabs

### Decision: Validate tab document IDs on session restore; remove stale tabs silently

### Rationale

When restoring tabs from localStorage, some documents may have been deleted since the last session. Options:
1. Fetch all tab documents on restore, remove tabs for deleted ones
2. Optimistically restore all tabs, show error when a deleted document's tab is activated

We choose **option 1** — validate on restore. A single batch query checks which document IDs still exist. This prevents confusing "document not found" errors after restoring.
