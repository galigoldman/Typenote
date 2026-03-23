# Research: Fix Undo Content Persisting in PDF Export

## Root Cause Analysis

### The Bug Reproduction Path

1. User draws a stroke on the canvas
2. Auto-save triggers after 800ms debounce → DB updated with stroke → `lastSaveTimestampRef` = "T1"
3. User undoes the stroke → `setPages()` removes the stroke from React state → `triggerSave()` re-queues with 800ms debounce
4. During that 800ms window, a Supabase realtime UPDATE event arrives for this document
5. The echo guard in `use-realtime-sync.ts:67` checks: `newRecord.updated_at === lastSaveTimestampRef.current`
6. If the event has a different timestamp (from another tab, a title save, or a concurrent server action), the guard passes
7. `onRemotePagesUpdate` at `canvas-editor.tsx:477` fires: `setPages(remote.pages)` — this unconditionally overwrites the local React state with the database content (which still has the stroke from step 2, because the undo-save hasn't completed yet)
8. The undone stroke is now back in the React state
9. User exports to PDF → the export reads the current React state → the undone stroke appears in the PDF

### Key Code Locations

| File                   | Line      | Role                                                                                     |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `canvas-editor.tsx`    | 1070-1142 | `handleUndo` — correctly removes stroke from React state via `setPages`                  |
| `canvas-editor.tsx`    | 1790      | Export call: `exportPdf({ ...document, pages: { pages } })` — correctly uses React state |
| `canvas-editor.tsx`    | 473-482   | `onRemotePagesUpdate` — **the bug**: unconditionally overwrites React state              |
| `use-auto-save.ts`     | 122-134   | `trigger` — 800ms debounce before save                                                   |
| `use-realtime-sync.ts` | 66-69     | Echo guard: only checks timestamp, not content                                           |

### Why the Echo Guard is Insufficient

The echo guard prevents the user's own save from triggering a state overwrite. But it fails when:

- **Title save**: `saveTitle()` updates `lastSaveTimestampRef` to a new timestamp. A subsequent pages-update event from a previous save now has a mismatched timestamp → echo guard fails.
- **Multi-tab**: Another tab saves the document → new timestamp → echo guard passes → state overwritten.
- **Server actions**: Any server-side update to the document (e.g., background job, API call) triggers a realtime event with a different timestamp.

## Design Decision: Local-Changes Guard

### Decision

Skip `onRemotePagesUpdate` when the local save status is `unsaved` (indicating there are local changes not yet persisted).

### Rationale

- The user's local state is the source of truth for what they see. If they have unsaved changes (including undo), remote updates should not overwrite their work.
- Once the local changes are saved (status becomes `saved`), the next remote event will be the echo of our own save (caught by the existing timestamp guard) or a legitimate remote change (which is fine to apply since our changes are already persisted).
- This is the simplest fix with the smallest blast radius.

### Alternatives Considered

| Alternative                                    | Rejected Because                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Flush save immediately on undo (skip debounce) | Adds load to the database, changes auto-save semantics, still has a race window during the save roundtrip |
| Merge remote updates with local undo stack     | Extremely complex, undo stack is action-based not snapshot-based, would require conflict resolution       |
| Disable realtime sync entirely during undo     | Breaks multi-tab sync, overly broad                                                                       |
| Add content hash to echo guard                 | Complex, requires hashing large JSON on every event, still doesn't solve the fundamental timing issue     |
| Flush save before export                       | Adds latency to export, doesn't prevent the state overwrite from happening before export                  |

## Additional Finding: Dashboard Export Path

`document-card.tsx:131` exports via `exportPdf(document)` using the DB-fetched document prop directly. This is by design (there's no live canvas state on the dashboard), but means dashboard exports always reflect the last-saved state. This is expected behavior and not part of this bug.
