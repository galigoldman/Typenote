# Research: Fix LaTeX Math UX

**Feature**: 002-fix-latex-math-ux
**Date**: 2026-03-08

## Research Topics

### 1. Auto-Save Trigger After Math Insertion

**Context**: Currently, `handleMathSubmit` in `tiptap-editor.tsx` calls `editor.chain().focus().insertMath(data.latex).run()` followed by `flushSave()`. The `insertMath` command uses `tr.replaceSelectionWith(node)` which triggers TipTap's `onUpdate` → `triggerSave()` (debounced 800ms). The `flushSave()` call immediately after should bypass the debounce and save.

**Finding**: The code already calls `flushSave()` after inserting the math node. However, the `flush()` function in `use-auto-save.ts` has a conditional: it only saves if `status === 'unsaved'`. There's a potential race condition — `triggerSave()` sets status to `'unsaved'` and schedules a debounced save, but `flushSave()` is called in the same microtask. The React state update (`setStatus('unsaved')`) is batched and may not have applied yet when `flush()` checks `status`.

**Decision**: Fix the race condition by ensuring `flushSave()` always performs a save when called from `handleMathSubmit`, regardless of current status. This can be done by calling `performSave()` directly or by adding a `forceFlush` option.

**Alternatives Considered**:

- Adding a separate `setTimeout` before flush — fragile, timing-dependent
- Using `triggerSave()` with 0ms debounce — changes existing behavior for all saves

---

### 2. Input Box Auto-Focus on `$` Trigger

**Context**: The `MathInputBox` component already has `useEffect(() => { inputRef.current?.focus() }, [])` which should auto-focus on mount. The issue may be that the component renders asynchronously after the custom event dispatch.

**Finding**: The `$` key handler in `math-extension.ts` dispatches a `CustomEvent`. The React component `TiptapEditor` listens via `window.addEventListener('math-input-trigger', ...)` which calls `setMathInputPosition(detail)`. This triggers a React re-render that mounts `MathInputBox`. The `useEffect` with empty deps runs after mount and calls `focus()`. This should work in theory.

**Possible Issue**: The ProseMirror editor may reclaim focus after the `handleKeyDown` returns `true`. Since `handleKeyDown` returns synchronously but the React component mounts asynchronously (on next render), the editor might re-focus between the event dispatch and the input mount.

**Decision**: Add a small `requestAnimationFrame` or `setTimeout(0)` wrapper around the `focus()` call in the `useEffect` to ensure it runs after ProseMirror's focus cycle completes. Additionally, explicitly call `editor.commands.blur()` before showing the input box.

**Alternatives Considered**:

- Using `autoFocus` prop on the input element — does not solve the ProseMirror focus reclaim
- Using `e.stopPropagation()` in the ProseMirror plugin — doesn't prevent editor focus restoration

---

### 3. Removing Colored Background from Math Nodes

**Context**: The `MathNodeView` component in `math-node-view.tsx` has inline styles: `background: 'rgba(139, 92, 246, 0.08)'` (purple) and `border: '1px solid rgba(139, 92, 246, 0.2)'`.

**Decision**: Remove the `background` and `border` inline styles entirely. Math expressions should render with no visual container, blending with surrounding text. A subtle cursor change (`cursor: 'pointer'`) can indicate clickability for the new edit feature.

**Alternatives Considered**:

- Adding a hover-only background — user specifically said no colored overlay
- Using a lighter tint — still a colored overlay, doesn't meet requirements

---

### 4. Click-to-Edit Interface Design

**Context**: Currently `MathNodeView` is a read-only React NodeView. The `atom: true` setting means TipTap treats it as a single unit (not editable inline). Clicking currently selects the node.

**Finding**: TipTap NodeViews can handle click events and maintain their own React state. The NodeView can detect clicks, show an edit UI (popover/floating panel), and update the node's attributes via `updateAttributes()` from `NodeViewProps`.

**Decision**: Extend `MathNodeView` to:

1. Accept click events → toggle an edit popover
2. Show two tabs/buttons: "Edit Expression" and "Edit LaTeX"
3. Store `originalText` as a new node attribute for pre-filling the expression editor
4. Use `updateAttributes()` to update `latex` and `originalText` on save
5. Compare current text to `originalText` to decide whether to call AI

**Data Model Change**: Add `originalText` attribute to `MathExpression` node. Default: `''`. This stores the natural language input used to generate the LaTeX. Stored in the JSONB content column alongside `latex` — no migration needed.

**UI Pattern**: Use a small floating panel (similar to `MathInputBox`) positioned relative to the clicked node. Two modes:

- **Expression mode**: Text input pre-filled with `originalText`, Enter submits (with AI call only if changed)
- **LaTeX mode**: Text input pre-filled with `latex`, Enter submits (no AI call, direct update)
- Mode selector via two clickable labels/buttons at the top of the panel

**Alternatives Considered**:

- Modal dialog — too heavy for inline edits
- Inline editing within the node — incompatible with `atom: true`
- Context menu — less discoverable, requires right-click
