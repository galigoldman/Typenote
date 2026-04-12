# Implementation Plan: Auto-Expanding LaTeX Editor

**Branch**: `038-latex-editor-resize` | **Date**: 2026-04-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/038-latex-editor-resize/spec.md`

## Summary

Replace the single-line `<input type="text">` fields in both LaTeX editor components (`MathInputBox` and `MathNodeView`) with auto-expanding `<textarea>` elements that grow vertically to fit content, capped at a maximum height with scrollbar overflow. This is a purely client-side UI change — no database, API, or dependency changes.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: React 19, Next.js 16 (App Router), TipTap 3 (ProseMirror)
**Storage**: N/A — no database changes, client-side only
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Textarea resize must be imperceptible (<16ms per resize, within a single animation frame)
**Constraints**: Must work in all modern browsers (Chrome, Firefox, Safari, Edge). No new dependencies.
**Scale/Scope**: 2 components modified, ~50 lines of code changed

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status | Notes                                                                        |
| ------------------------------- | ------ | ---------------------------------------------------------------------------- |
| I. Incremental Development      | PASS   | No foundational infrastructure needed — modifying existing UI components     |
| II. Test-Driven Quality         | PASS   | Will update existing unit tests + add E2E coverage                           |
| III. Protected Branches         | PASS   | Working on feature branch `038-latex-editor-resize` off `dev`                |
| IV. Migrations as Code          | N/A    | No database changes                                                          |
| V. Interview-Ready Architecture | PASS   | Auto-expanding textarea is a classic UI pattern; will document the technique |

**Post-Phase 1 Re-check**: All gates still pass. No design decisions introduced new concerns.

## Project Structure

### Documentation (this feature)

```text
specs/038-latex-editor-resize/
├── plan.md              # This file
├── research.md          # Phase 0 output — technique decisions
├── quickstart.md        # Phase 1 output — developer guide
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── editor/
│       ├── math-input-box.tsx       # MODIFY — replace <input> with <textarea>
│       └── math-input-box.test.tsx  # MODIFY — update element queries
├── components/
│   └── editor/
│       ├── math-node-view.tsx       # MODIFY — replace <input> with <textarea>
│       └── math-node-view.test.tsx  # MODIFY — update element queries

e2e/
└── latex-math.spec.ts               # MODIFY — add long-expression test
```

**Structure Decision**: No new files or directories. All changes are modifications to existing files in existing locations.

## Implementation Approach

### Core Pattern: Auto-Expanding Textarea

Both components will use the same inline resize technique:

1. **Element change**: `<input type="text">` → `<textarea rows={1}>`
2. **Resize callback**: On every value change, reset `style.height = "auto"`, then set `style.height = scrollHeight + "px"`
3. **CSS constraints**: `max-h-[200px]` to cap growth, `overflow-y: auto` for scrollbar, `resize-none` to disable drag handle
4. **Enter handling**: Existing `handleKeyDown` already prevents default Enter and submits — no logic change needed
5. **Ref update**: Change `useRef<HTMLInputElement>` to `useRef<HTMLTextAreaElement>`

### Key Design Decisions

| Decision          | Choice              | Why                                                      |
| ----------------- | ------------------- | -------------------------------------------------------- |
| Resize technique  | scrollHeight JS     | Universal browser support, 5 lines of code               |
| Max height        | 200px (~8 lines)    | Fits well in floating panels without dominating viewport |
| Enter behavior    | Submit (no newline) | Preserves existing UX; LaTeX is logically single-line    |
| New hook/utility? | No                  | Only 2 call sites; inline is simpler than abstraction    |
| New dependencies? | No                  | Native textarea + vanilla JS                             |
