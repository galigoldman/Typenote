# Research: Fix PDF Export Page Deletion

## Decision 1: How to fix `pageHasContent()` content detection

**Decision**: Check for `"mathExpression"` in addition to `"text"` when scanning JSON content.

**Rationale**: The current check `JSON.stringify(content).includes('"text"')` catches text nodes (`{ "type": "text", "text": "hello" }`) but misses math nodes (`{ "type": "mathExpression", "attrs": { "latex": "..." } }`). Adding `"mathExpression"` to the check covers the primary content type that's being silently discarded.

**Alternatives considered**:

- Invert the check (detect "empty" instead of "has content") — riskier, could miss future empty states
- Check for any non-paragraph, non-doc node type — too broad, might count structural nodes as content
- Use a whitelist of ALL content node types — overkill for this bug; `"text"` + `"mathExpression"` covers all current user content

## Decision 2: How to fix the echo guard race condition

**Decision**: Add a page-count guard in `onRemotePagesUpdate` — never accept remote pages with fewer pages than local state when a save recently completed.

**Rationale**: The root issue is that the WebSocket echo can arrive before the HTTP save response (extra hop through Vercel). Instead of replacing the time-based echo guard (which works in most cases), add a defensive check: if remote has fewer pages than local, it's almost certainly a stale echo of our own save that stripped trailing pages. This is simpler than adding save IDs or server-side tracking.

**Alternatives considered**:

- Save-in-flight flag — requires threading a new ref through multiple hooks; more invasive
- Server-side `updated_by` field — requires DB migration, overkill for this fix
- Increase the 5-second window — just delays the problem, doesn't fix it
- Flush save before export — adds latency to the export flow

## Decision 3: E2E test approach

**Decision**: Create a new E2E spec that logs in, creates a real canvas document, types content on 6 pages, clicks the export button, waits 60 seconds, and verifies all 6 pages remain.

**Rationale**: The user explicitly requested a "perfect browser use test" that writes 6 pages, exports, waits, and checks. Using a real document (not a mock page) ensures the full auto-save and Realtime pipeline is exercised.

**Alternatives considered**:

- Test against `/test/editor` mock page — doesn't exercise Supabase save/sync, wouldn't catch the bug
- Shorter wait time — the user said the bug takes "some minutes," so 60 seconds is a reasonable CI-friendly compromise

## Key Files to Modify

| File                                                                | Change                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/components/canvas/page-utils.ts`                               | Add `"mathExpression"` to content checks in `pageHasContent()` |
| `src/components/canvas/__tests__/page-utils.test.ts`                | Add tests for math-only pages                                  |
| `src/components/canvas/canvas-editor.tsx`                           | Add page-count guard in `onRemotePagesUpdate`                  |
| `src/components/canvas/__tests__/canvas-editor-undo-export.test.ts` | Add test for page-count guard                                  |
| `e2e/export-pdf-page-persistence.spec.ts`                           | New E2E test file                                              |
| `e2e/TEST_REGISTRY.md`                                              | Register new test scenarios                                    |
