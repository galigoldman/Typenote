# Feature Specification: Document Version History

**Feature Branch**: `039-document-versioning`
**Created**: 2026-04-12
**Status**: Draft
**Input**: User description: "Document version history with smart auto-snapshots and restore sidebar"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View Version History (Priority: P1)

A user is editing a document and wants to see previous versions. They open a version history sidebar that shows a chronological list of saved snapshots. Each entry shows a relative timestamp ("30 min ago", "2 hours ago") and what triggered the save ("Auto-saved", "Before restore"). The list is ordered newest-first with a maximum of 8 versions shown.

**Why this priority**: Without the ability to see versions, no other versioning feature is useful. This is the foundation.

**Independent Test**: Can be fully tested by opening the sidebar on a document that has saved versions and verifying the list renders with correct timestamps and labels.

**Acceptance Scenarios**:

1. **Given** a document with 3 saved versions, **When** the user opens the version history sidebar, **Then** they see 3 entries ordered newest-first with relative timestamps and trigger labels.
2. **Given** a document with no saved versions, **When** the user opens the version history sidebar, **Then** they see an empty state message like "No version history yet."
3. **Given** a document with 8 versions, **When** the user opens the version history sidebar, **Then** they see exactly 8 entries (the cap).

---

### User Story 2 - Automatic Version Snapshots (Priority: P1)

The system automatically creates version snapshots at smart intervals without user action. Snapshots are created when:

- The user stops typing for ~30 seconds (idle timeout)
- Every ~5 minutes during active editing (periodic safety net)
- When the user navigates away from the document or closes the browser (session close)

Only meaningful changes trigger a snapshot — if the document content hasn't changed since the last snapshot, no new version is created.

The system keeps a maximum of 8 versions per document. When a 9th snapshot would be created, the oldest version is deleted.

**Why this priority**: Auto-snapshots are equally critical to viewing — without them, there's nothing to view. Combined with Story 1, this delivers a usable MVP.

**Independent Test**: Can be tested by editing a document, waiting 30 seconds, and verifying a version was created in the database. Then editing more, waiting another 30 seconds, and verifying a second version appears.

**Acceptance Scenarios**:

1. **Given** a user is editing a document, **When** they stop typing for 30 seconds, **Then** a version snapshot is saved with trigger label "Auto-saved".
2. **Given** a user is actively editing for 5+ minutes without a 30-second pause, **When** 5 minutes elapse since the last snapshot, **Then** a periodic snapshot is saved with trigger label "Auto-saved".
3. **Given** a user is editing a document, **When** they navigate away or close the tab, **Then** a snapshot is saved with trigger label "Auto-saved".
4. **Given** a document already has 8 versions, **When** a new snapshot is created, **Then** the oldest version is deleted and the new one is added (total remains 8).
5. **Given** the document content has not changed since the last snapshot, **When** an idle timeout or periodic trigger fires, **Then** no new snapshot is created.

---

### User Story 3 - Restore a Previous Version (Priority: P2)

A user selects a version from the history sidebar and restores it. The current document state is overwritten with the selected version's content. Before overwriting, the system automatically creates a snapshot of the current state labeled "Before restore" — so the user can always undo a restore by restoring the pre-restore snapshot.

**Why this priority**: Viewing history is useful on its own for peace of mind, but restore is what makes it actionable. Depends on Stories 1 and 2.

**Independent Test**: Can be tested by creating a document with content "Version A", editing it to "Version B" (triggering a snapshot), then restoring the "Version A" snapshot and verifying the document now shows "Version A" content and a new "Before restore" entry appears in the history.

**Acceptance Scenarios**:

1. **Given** a user is viewing the version history sidebar, **When** they click a version entry, **Then** the entry is highlighted as selected.
2. **Given** a user has selected a version, **When** they click "Restore", **Then** the document content is replaced with the selected version's content.
3. **Given** a user clicks "Restore", **When** the restore completes, **Then** a new snapshot labeled "Before restore" is created containing the pre-restore document state.
4. **Given** a user just restored a version, **When** they open the history sidebar, **Then** they see the "Before restore" entry at the top and can restore it to undo.

---

### Edge Cases

- What happens when a version snapshot is triggered during an active auto-save? The snapshot waits for the auto-save to complete first, then captures the saved state.
- What happens if the user restores a version while offline? The restore applies locally, and when connectivity returns, the auto-save persists it.
- What happens if two browser tabs are editing the same document? Each tab manages its own version triggers independently; the version cap (8) is enforced at the database level regardless of source.
- What happens if the user rapidly triggers multiple snapshots (e.g., stop/start typing repeatedly near the 30s boundary)? A minimum interval between snapshots (30 seconds) prevents duplicate or near-duplicate versions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST automatically create version snapshots when the user stops editing for approximately 30 seconds.
- **FR-002**: System MUST automatically create version snapshots every ~5 minutes during continuous active editing.
- **FR-003**: System MUST attempt to create a version snapshot when the user navigates away from the document.
- **FR-004**: System MUST enforce a maximum of 8 versions per document, deleting the oldest when the cap is exceeded.
- **FR-005**: System MUST NOT create a new snapshot if the document content has not changed since the last snapshot.
- **FR-006**: System MUST display version history in a sidebar with relative timestamps and trigger labels, ordered newest-first.
- **FR-007**: System MUST allow users to restore any previous version, replacing the current document content.
- **FR-008**: System MUST automatically create a "Before restore" snapshot of the current state before any restore operation.
- **FR-009**: System MUST store both text editor content and canvas/drawing data in each version snapshot.
- **FR-010**: Version data MUST be scoped per user — users can only see and restore their own document versions.

### Key Entities

- **Document Version**: A point-in-time snapshot of a document's full state. Belongs to exactly one document. Contains the text editor state, canvas/drawing state, document title at time of snapshot, what triggered the snapshot, and when it was created.
- **Document** (existing): Extended with version history — a document has zero to eight versions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Version snapshots are created within 5 seconds of a trigger event (idle timeout, periodic, or navigation).
- **SC-002**: Users can view and restore any version in under 3 clicks (open sidebar, click version, click restore).
- **SC-003**: Restoring a version completes in under 2 seconds from the user's perspective.
- **SC-004**: No document content is ever permanently lost — every restore creates a "Before restore" snapshot first.
- **SC-005**: Storage overhead per document stays under 1 MB for 8 versions (typical document).
