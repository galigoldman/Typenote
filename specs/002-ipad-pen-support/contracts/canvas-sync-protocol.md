# Contract: Canvas Sync Protocol

## Overview

Canvas documents sync via a **notification-then-fetch** pattern, replacing the current direct-payload approach to work around Supabase Realtime's ~8KB payload truncation.

## Save Flow (Client → Server)

```
1. Canvas state changes (edit, move, draw)
2. Auto-save debounce (800ms)
3. Serialize: canvasState → JSONB
4. Server action: updateDocumentContent(id, canvasJsonb)
5. Supabase UPDATE sets content = canvasJsonb, updated_at = now()
```

### Server Action Interface

```typescript
// Existing — no change to signature
async function updateDocumentContent(
  documentId: string,
  content: Record<string, unknown>
): Promise<void>
```

The `content` parameter accepts both linear TipTap JSON and canvas format JSON.

## Realtime Sync Flow (Server → Other Clients)

```
1. Supabase Realtime broadcasts postgres_changes event
   → Payload contains: id, updated_at (content field truncated due to size)
2. Client receives event
3. Echo guard: compare updated_at with local last-saved timestamp
   → If match: ignore (own echo)
   → If different: proceed
4. Fetch full document: supabase.from('documents').select('content').eq('id', docId).single()
5. Diff fetched content against local canvas state
6. Apply changes to canvas (update elements, strokes, positions)
```

### Key Differences from Current Sync

| Aspect | Current (Linear) | New (Canvas) |
|--------|------------------|--------------|
| Payload delivery | Direct from realtime event | Fetch after realtime signal |
| Content application | `editor.commands.setContent(json)` | Diff-and-patch canvas state |
| Granularity | Full document replace | Per-element update |
| Echo guard | `updated_at` timestamp | Same (unchanged) |

## Offline Sync

Unchanged from existing behavior:

1. Changes queued in IndexedDB `sync-queue`
2. On reconnect: replay queue in chronological order
3. Each replayed edit calls `updateDocumentContent`
4. Conflicts resolved by last-write-wins (timestamp)

## Editing Lock

Unchanged: The existing lock mechanism applies to canvas documents. When another device is editing, the local canvas enters read-only mode with an "Editing elsewhere" banner.
