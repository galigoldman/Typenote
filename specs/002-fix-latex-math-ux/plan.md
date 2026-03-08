# Implementation Plan: Fix LaTeX Math UX

**Branch**: `002-fix-latex-math-ux` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-fix-latex-math-ux/spec.md`

## Summary

Fix four UX issues in the LaTeX math input feature: (1) ensure math expressions auto-save immediately on Enter (fix race condition in `flush()`), (2) fix cursor auto-focus in the math input box after `$` trigger (ProseMirror focus reclaim), (3) remove the purple/blue background overlay from rendered math nodes, and (4) add a click-to-edit interface with dual modes (natural language re-conversion and direct LaTeX editing). Requires adding `originalText` attribute to the `MathExpression` node (no migration).

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 18+
**Primary Dependencies**: Next.js 16.1.6, TipTap 3.20.1, KaTeX, Supabase SSR 0.9.0
**Storage**: PostgreSQL via Supabase — existing `documents.content` JSONB column (no migration)
**Testing**: Vitest 4.0.18 + React Testing Library + Playwright 1.58.2
**Target Platform**: Web (desktop browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Edit panel appears in <100ms on click; no unnecessary AI calls
**Constraints**: Must be backward-compatible with existing math nodes (no `originalText`)
**Scale/Scope**: Single-user editor with real-time sync across devices

## Constitution Check

_Constitution not configured for this project (template placeholder). No gates to evaluate._

**Post-design re-check**: N/A — no constitution constraints defined.

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-latex-math-ux/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Data model changes
├── quickstart.md        # Phase 1: Developer quickstart
├── contracts/
│   └── ai-latex-api.md  # API contract (unchanged from 001)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (modified files)

```text
src/
├── lib/
│   └── editor/
│       ├── math-extension.ts        # MODIFIED: Add originalText attribute, update insertMath command
│       ├── math-extension.test.ts   # MODIFIED: Add tests for originalText attribute
│       └── math-input-box.tsx       # MODIFIED: Fix auto-focus timing
├── components/
│   └── editor/
│       ├── math-node-view.tsx       # MODIFIED: Remove background, add click-to-edit panel
│       ├── math-node-view.test.tsx  # NEW: Tests for edit panel behavior
│       └── tiptap-editor.tsx        # MODIFIED: Pass originalText, fix save flow
├── hooks/
│   └── use-auto-save.ts            # MODIFIED: Fix flush() race condition
└── app/
    └── api/
        └── ai/
            └── latex/
                └── route.ts         # UNCHANGED
```

**Structure Decision**: All changes are modifications to existing files from 001. One new test file (`math-node-view.test.tsx`) for the click-to-edit functionality. No new directories or architectural changes.

## Phase 0: Research (Complete)

All research documented in [research.md](./research.md). Key findings:

| Topic                    | Finding                                                                                                | Decision                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Auto-save race condition | `flush()` checks `status === 'unsaved'` but React state may not have updated yet after `triggerSave()` | Make `flush()` always save when explicitly called (remove status guard) or add a force parameter |
| Input focus timing       | ProseMirror may reclaim focus after `handleKeyDown` returns                                            | Wrap `focus()` in `requestAnimationFrame` and blur editor before showing input                   |
| Background removal       | Inline styles in `MathNodeView`: purple background + border                                            | Remove `background` and `border` styles, add `cursor: pointer` for edit affordance               |
| Click-to-edit UI         | TipTap NodeView can handle clicks + maintain React state                                               | Extend `MathNodeView` with local state for edit panel, two-mode input, `updateAttributes()`      |
| Original text storage    | Need `originalText` to pre-fill expression editor and detect changes                                   | Add attribute to MathExpression node, default `''` for backward compat                           |

## Phase 1: Design

### 1.1 Data Model

Documented in [data-model.md](./data-model.md).

- **MathExpression Node** gains `originalText: string` attribute (default: `''`)
- Stored within existing `documents.content` JSONB — no migration
- Backward compatible: existing nodes without `originalText` render normally

### 1.2 Interface Contracts

Documented in [contracts/ai-latex-api.md](./contracts/ai-latex-api.md).

- **POST /api/ai/latex**: Unchanged from 001. Reused by the edit feature when natural language text is modified.

### 1.3 Component Architecture

#### Fix 1: Auto-Save (`use-auto-save.ts`)

```
flush() function changes:
  BEFORE: if (status === 'unsaved') → performSave()
  AFTER:  always performSave() when flush() is called explicitly
          (cancel any pending debounced save first)
```

This ensures that `flushSave()` called from `handleMathSubmit` always triggers an immediate save, regardless of React state batching.

#### Fix 2: Input Focus (`math-input-box.tsx`)

```
useEffect on mount:
  BEFORE: inputRef.current?.focus()
  AFTER:  requestAnimationFrame(() => inputRef.current?.focus())
```

The `requestAnimationFrame` ensures focus is set after ProseMirror's event handling cycle completes.

#### Fix 3: Background Removal (`math-node-view.tsx`)

```
NodeViewWrapper style:
  BEFORE: background: rgba(139,92,246,0.08), border: 1px solid rgba(139,92,246,0.2)
  AFTER:  no background, no border, cursor: pointer
```

#### Fix 4: Click-to-Edit (`math-node-view.tsx`)

```
MathNodeView (extended)
  ├── State: isEditing, editMode ('expression' | 'latex'), editValue
  ├── Click handler: opens edit panel
  ├── Edit panel (floating div):
  │   ├── Mode selector: "Edit Expression" | "Edit LaTeX" buttons
  │   ├── Text input pre-filled based on mode
  │   ├── Enter handler:
  │   │   ├── Expression mode + text changed → call API → updateAttributes({ latex, originalText })
  │   │   ├── Expression mode + text unchanged → close panel
  │   │   └── LaTeX mode → updateAttributes({ latex }) directly
  │   └── Escape handler: close panel without changes
  └── Props used: node.attrs.latex, node.attrs.originalText, updateAttributes()
```

#### Updated `insertMath` command (`math-extension.ts`)

```
insertMath(latex, originalText):
  BEFORE: insertMath(latex) → creates node with { latex }
  AFTER:  insertMath(latex, originalText) → creates node with { latex, originalText }
```

#### Updated `handleMathSubmit` (`tiptap-editor.tsx`)

```
handleMathSubmit(text):
  1. Call API with text → get latex
  2. editor.chain().focus().insertMath(latex, text).run()  // pass originalText
  3. flushSave()  // immediate save (always executes now)
```

### 1.4 Integration Flow

```
=== NEW MATH CREATION (updated) ===
1. User types '$'
   └── ProseMirror plugin → dispatch 'math-input-trigger' event
       └── Input box appears with auto-focus (requestAnimationFrame fix)

2. User types text + Enter
   └── API call → latex returned
       └── insertMath(latex, originalText) → node inserted with both attrs
           └── flushSave() → immediate persist (race condition fixed)

=== EDITING EXISTING MATH (new) ===
1. User clicks rendered math node
   └── MathNodeView onClick → setIsEditing(true)
       └── Edit panel appears with mode selector

2a. "Edit Expression" mode
    └── Input pre-filled with node.attrs.originalText
    └── Enter (text changed) → API call → updateAttributes({ latex, originalText })
    └── Enter (text unchanged) → close panel (no API call)

2b. "Edit LaTeX" mode
    └── Input pre-filled with node.attrs.latex
    └── Enter → updateAttributes({ latex }) → KaTeX re-renders
```

## Complexity Tracking

No constitution violations. Changes are minimal and focused:

- 0 new dependencies
- 0 new API routes
- 0 database migrations
- 1 new test file
- 5 modified files (all existing)
- 1 new node attribute (`originalText`)
