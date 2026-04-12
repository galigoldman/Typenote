# Research: Auto-Expanding LaTeX Editor

**Feature**: 038-latex-editor-resize
**Date**: 2026-04-12

## R1: Auto-Expanding Textarea Technique

### Decision: Replace `<input>` with `<textarea>` + JavaScript scrollHeight resizing

### Rationale

The classic and most reliable pattern for auto-expanding text inputs on the web is:

1. Replace `<input type="text">` with a `<textarea>` element
2. Set the textarea to `rows="1"` so it starts at single-line height
3. On every input change, reset `height` to `auto`, then set `height` to `scrollHeight + "px"`
4. Set `max-height` to cap growth, with `overflow-y: auto` to show scrollbar beyond that
5. Use CSS `resize: none` to disable manual drag-resizing

This approach is used by GitHub, Slack, Notion, and most modern editors.

**Why not CSS `field-sizing: content`?** This is a newer CSS property that auto-sizes inputs/textareas to their content. However, browser support is still limited (Chrome 123+, no Firefox/Safari as of early 2026), so it's not safe to rely on as the sole solution. The JavaScript scrollHeight approach works everywhere.

**Why not a hidden measurement div?** Some implementations use a hidden `<div>` that mirrors the textarea content to calculate height. This adds DOM complexity for no benefit — `scrollHeight` on the textarea itself is simpler and equally performant.

### Alternatives Considered

| Approach                       | Pros                      | Cons                         | Verdict                        |
| ------------------------------ | ------------------------- | ---------------------------- | ------------------------------ |
| CSS `field-sizing: content`    | Zero JS, clean            | Poor browser support         | Rejected — not cross-browser   |
| Hidden measurement div         | Framework-agnostic        | Extra DOM, sync issues       | Rejected — overengineered      |
| scrollHeight on textarea       | Universal support, simple | Needs JS event handler       | **Selected**                   |
| Horizontal scroll (status quo) | No changes needed         | Poor UX for long expressions | Rejected — this is the problem |

## R2: Enter Key Behavior in Textarea

### Decision: Intercept Enter to submit, prevent newline insertion

### Rationale

The current `<input>` elements submit on Enter. Switching to `<textarea>` changes the default Enter behavior to "insert newline." We must intercept Enter in `onKeyDown` to call `e.preventDefault()` and trigger submission, preserving the existing UX.

This is already handled in both components — the existing `handleKeyDown` callbacks call `e.preventDefault()` on Enter. Moving from `<input>` to `<textarea>` requires no logic changes, only the element swap and the resize handler.

## R3: Existing Codebase Patterns

### Decision: No new hooks or utilities needed — inline the resize logic

### Rationale

- The codebase has **no existing auto-expanding textarea** pattern to reuse
- The `text-box.tsx` canvas component uses `scrollHeight` + `ResizeObserver` for a similar purpose, but it's measuring a `contenteditable` div, not a textarea
- The resize logic is ~5 lines of code — creating a custom hook for a two-use pattern would be overengineering
- Both components (`MathInputBox` and `MathNodeView`) will use the same inline pattern: a `resizeTextarea` callback triggered on mount, on value change, and on mode switch

## R4: Max Height and Scroll Boundary

### Decision: Max height of 200px (~8 lines of text at 14px font size)

### Rationale

- The edit panels appear as floating popups positioned below math expressions
- They should not dominate the viewport — 200px allows ~8 visible lines of LaTeX, which covers the vast majority of expressions
- Beyond 200px, the textarea gets `overflow-y: auto` and a vertical scrollbar appears
- 200px works well on both desktop and mobile (well under half the viewport on any device)
- The MathInputBox container already has `max-w-[min(400px,calc(100vw-2rem))]` which constrains width; adding a height cap creates a bounded editing area

## R5: Testing Strategy

### Decision: Unit tests with Vitest + React Testing Library, E2E with Playwright

### Rationale

- **Unit tests**: Verify that the textarea element renders, that it has correct initial height, and that keyboard shortcuts (Enter, Escape) still work. Follow existing patterns in `math-input-box.test.tsx` and `math-node-view.test.tsx`.
- **E2E tests**: The existing `e2e/latex-math.spec.ts` covers the LaTeX flow. Add a scenario that types a long expression and verifies the editor area grows (check computed height or bounding box).
- Note: Testing actual scrollHeight resizing in jsdom is unreliable (jsdom doesn't compute layout). Unit tests should verify the textarea element exists and has the right CSS classes. Visual resize behavior is best verified in E2E.
