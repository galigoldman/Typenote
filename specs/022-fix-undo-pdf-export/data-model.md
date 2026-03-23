# Data Model: Fix Undo Content Persisting in PDF Export

## State Flow: Current (Buggy)

```
User draws stroke
  → setPages([...pages, stroke])          # React state updated
  → triggerSave()                          # 800ms debounce starts
  → [800ms] → save to DB                  # DB updated, lastSaveTimestamp = T1
  → Supabase realtime event (T1)          # Echo guard catches → ignored ✓

User undoes stroke
  → setPages(pages without stroke)         # React state updated (correct)
  → triggerSave()                          # 800ms debounce starts

  [DURING 800ms WINDOW]
  → Supabase realtime event arrives (T ≠ T1)
  → Echo guard passes (timestamps differ)
  → onRemotePagesUpdate(remote.pages)      # ← BUG: overwrites local state
  → setPages(remote.pages)                 # Stroke re-injected from DB!

User exports to PDF
  → exportPdf({ ...document, pages: { pages } })
  → pages now contains the re-injected stroke
  → PDF renders the undone stroke ✗
```

## State Flow: Fixed

```
User draws stroke
  → setPages([...pages, stroke])
  → triggerSave()
  → [800ms] → save to DB
  → Supabase realtime event (T1) → echo guard catches ✓

User undoes stroke
  → setPages(pages without stroke)         # React state updated (correct)
  → triggerSave()                          # saveStatus = "unsaved"

  [DURING 800ms WINDOW]
  → Supabase realtime event arrives
  → onRemotePagesUpdate called
  → CHECK: saveStatus === "unsaved"?       # ← NEW GUARD
  → YES → skip setPages()                  # Local state preserved ✓

  [800ms elapsed]
  → save to DB (without the stroke)
  → saveStatus = "saved"
  → Supabase realtime echo → echo guard catches ✓

User exports to PDF
  → exportPdf({ ...document, pages: { pages } })
  → pages correctly reflects the undo
  → PDF does not contain the undone stroke ✓
```

## Key Entities (unchanged)

| Entity                 | Storage            | Role                                                   |
| ---------------------- | ------------------ | ------------------------------------------------------ |
| `pages` (React state)  | In-memory          | Source of truth for canvas rendering and PDF export    |
| `pagesRef`             | In-memory (useRef) | Mirror of React state for non-render reads             |
| `undoStackRef`         | In-memory (useRef) | Stack of reversible actions                            |
| `redoStackRef`         | In-memory (useRef) | Stack of re-applicable actions                         |
| `documents.pages`      | PostgreSQL (JSONB) | Persisted copy, updated via auto-save                  |
| `saveStatus`           | In-memory          | "saved" / "unsaved" / "saving" / "retrying" / "error"  |
| `lastSaveTimestampRef` | In-memory (useRef) | Timestamp of last successful save, used for echo guard |

## Change Surface

Only `canvas-editor.tsx` `onRemotePagesUpdate` callback needs modification. The guard requires access to the current save status, which needs to be threaded through from `useAutoSave` → `useDocumentSync` → `canvas-editor.tsx`.
