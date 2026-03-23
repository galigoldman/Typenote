# Implementation Plan: Change LaTeX Trigger from $ to :{

**Branch**: `020-change-latex-trigger` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-change-latex-trigger/spec.md`

## Summary

Replace the single-key `$` trigger for the LaTeX math input popup with the two-character sequence `:{`. The `:` is inserted normally when typed; if `{` immediately follows, the `:` is deleted from the document and the popup opens (insert-then-cleanup). All popup behavior (AI conversion, submit, cancel, quota display) remains unchanged. No data model or API changes needed — this is a client-side ProseMirror plugin modification.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16, TipTap 3, ProseMirror (`@tiptap/pm/state`, `@tiptap/pm/view`)
**Storage**: N/A — no data changes
**Testing**: Vitest (unit tests for plugin behavior)
**Target Platform**: Web browser (desktop + mobile)
**Project Type**: Web application (Next.js)
**Performance Goals**: No perceptible delay — trigger detection is a single character comparison on keydown
**Constraints**: Must not introduce false triggers for normal `:` or `{` usage
**Scale/Scope**: 1 file primary change, 1 test file, 2 comment updates

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status     | Notes                                                                                          |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| I. Incremental Development      | PASS       | Single-phase change to existing infrastructure; no new features added                          |
| II. Test-Driven Quality         | PASS       | New trigger behavior tests will be added to `math-extension.test.ts`                           |
| III. Protected Main Branch      | PASS       | Work is on `020-change-latex-trigger` branch; will PR to main                                  |
| IV. Migrations as Code          | PASS (N/A) | No database changes                                                                            |
| V. Interview-Ready Architecture | PASS       | Plugin pattern, ProseMirror transaction model, and event-driven decoupling are all discussable |

**Post-Phase 1 re-check**: All gates remain PASS. No design decisions introduced new violations.

## Project Structure

### Documentation (this feature)

```text
specs/020-change-latex-trigger/
├── plan.md              # This file
├── research.md          # Phase 0: trigger strategy, transaction approach
├── data-model.md        # Phase 1: no changes needed
├── quickstart.md        # Phase 1: test/dev guide
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/lib/editor/
├── math-extension.ts          # PRIMARY: Replace $ handler with :{ handler
└── math-extension.test.ts     # Add trigger behavior tests

src/components/editor/
└── tiptap-editor.tsx           # Update comment referencing $ trigger

src/components/canvas/
└── canvas-editor.tsx           # Update comments referencing $ trigger
```

**Structure Decision**: No new files or directories. All changes are modifications to existing files within the established `src/lib/editor/` and `src/components/` structure.

## Implementation Design

### Core Change: `math-extension.ts` Plugin

**Current behavior** (lines 89–125): The ProseMirror plugin intercepts `$` keydown, checks code context guards, calculates cursor coords, dispatches `math-input-trigger` custom event, and returns `true` to prevent `$` insertion.

**New behavior**: The plugin intercepts `{` keydown instead. Additional logic:

1. Check if cursor position > 0 (need at least one preceding character)
2. Read the character immediately before cursor using `state.doc.textBetween(pos - 1, pos)`
3. If preceding character is `:`:
   - Apply existing code context guards (code block, inline code mark)
   - Delete the `:` via `state.tr.delete(pos - 1, pos)` and dispatch the transaction
   - Calculate cursor coords at new position (post-deletion)
   - Dispatch `math-input-trigger` custom event
   - Return `true` to prevent `{` insertion
4. If preceding character is not `:`: return `false` (let `{` insert normally)

**Why this approach works**:

- **No state tracking**: No need for flags, timers, or cross-keystroke state. A single keydown handler examines document state synchronously.
- **Paste-safe**: `handleKeyDown` does not fire on paste operations, naturally preventing FR-005 violations.
- **False-positive resistant**: The preceding-character check ensures only the exact `:{` sequence triggers, regardless of timing.

### Interview-Relevant Concepts

- **ProseMirror Plugin Architecture**: Plugins intercept low-level editor events (`handleKeyDown`) and return `true` to consume the event or `false` to pass it through. This is the Chain of Responsibility pattern.
- **Transaction-Based State Management**: ProseMirror uses immutable state with explicit transactions (`state.tr.delete(...)` → `view.dispatch(tr)`). This is similar to Redux's action/dispatch model — state is never mutated directly.
- **Event-Driven Decoupling**: The plugin fires a `CustomEvent` that React components listen for, decoupling ProseMirror's plugin lifecycle from React's component lifecycle. This prevents tight coupling between two different reactive systems.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
