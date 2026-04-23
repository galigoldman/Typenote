# Research: Document Version History

## R1: Where to trigger version snapshots

**Decision**: Client-side hook (`useVersionSnapshots`) separate from auto-save, calling a dedicated server action.

**Rationale**: The existing auto-save fires every 800ms (debounced). Version snapshots need different timing (30s idle, 5min periodic). Mixing them into `useAutoSave` would couple two unrelated concerns. A separate hook tracks idle/periodic timers and calls its own server action (`createVersionSnapshot`) when triggered.

**Alternatives considered**:
- Postgres trigger on `documents` UPDATE — rejected because it would fire on every 800ms save, creating far too many versions. Pruning logic in a trigger adds complexity.
- Server-side debounce — rejected because the server doesn't know when the user stopped typing; only the client has that context.

## R2: Snapshot storage strategy

**Decision**: Full JSONB snapshots in a `document_versions` table. No diffs.

**Rationale**: With a cap of 8 versions and typical document sizes of 10-100 KB, the worst case is 800 KB per document (8 × 100 KB). Even with 1,000 documents, that's 800 MB — well within Supabase Pro limits (8 GB) and manageable on free tier (500 MB) for typical usage. Full snapshots make restore trivial (single row read) and avoid the complexity of reconstructing state from diffs.

**Alternatives considered**:
- JSONB diff/patch (RFC 6902) — rejected: complex to implement, reconstruct, and debug. Savings not needed at this scale.
- Supabase Storage (JSON files) — rejected: can't query metadata efficiently, harder to enforce cap atomically.

## R3: Cap enforcement strategy

**Decision**: Postgres RPC function that atomically inserts the new version and deletes the oldest if count exceeds 8.

**Rationale**: Using an RPC function (`create_document_version`) ensures atomicity — no race condition where two tabs both see 8 versions and both insert, ending up with 10. The function does: INSERT new version → DELETE oldest if count > 8, all in one transaction. This follows the existing pattern used by `increment_ai_usage`.

**Alternatives considered**:
- Client-side count check before insert — rejected: TOCTOU race with multiple tabs.
- Postgres trigger on INSERT — viable but less explicit; RPC is the established pattern in this project.

## R4: Change detection to avoid duplicate snapshots

**Decision**: Hash comparison using `JSON.stringify()` equality check on client side.

**Rationale**: Before creating a snapshot, the client compares the current `content` + `pages` JSON strings against the last snapshot's content (stored in a ref). If identical, skip. This is fast (string comparison) and avoids unnecessary DB writes. No need for cryptographic hashing at this scale.

**Alternatives considered**:
- Server-side hash column — adds migration complexity for minimal benefit.
- Deep object comparison — slower and more error-prone than string comparison.

## R5: Version history sidebar UI pattern

**Decision**: Follow the AI Chat Panel pattern — inline on desktop (right side, fixed width), full-screen overlay on mobile. Open via a button in the document toolbar/header.

**Rationale**: The AI chat sidebar already established this pattern in the codebase. Reusing it keeps the UX consistent and reduces implementation effort. The version sidebar is simpler (read-only list + restore button), so the same responsive pattern works well.

**Alternatives considered**:
- Modal dialog — rejected: version history benefits from staying open while viewing the document.
- Sheet (Radix slide-over) — viable but the inline pattern is already proven for document-context panels.

## R6: Session close snapshot via beforeunload

**Decision**: Use `navigator.sendBeacon()` to fire a snapshot on page unload. Fall back to synchronous fetch if beacon is unavailable.

**Rationale**: `beforeunload` is unreliable for async operations — the browser may kill the page before a `fetch()` completes. `sendBeacon()` is designed specifically for this: it queues the request and the browser guarantees delivery even after the page unloads. This is the standard approach for analytics and save-on-exit.

**Alternatives considered**:
- `visibilitychange` event — good complement (fires when tab becomes hidden) but doesn't cover tab close. Use both.
- Rely only on idle/periodic — leaves a gap if user types continuously then closes tab. `sendBeacon` closes this gap.
