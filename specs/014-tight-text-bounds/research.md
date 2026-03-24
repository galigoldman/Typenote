# Research: Tight Text Selection Bounds

## R1: How to Measure Actual Content Width in a Fixed-Width Container

**Decision**: Use the Range API to measure actual rendered text bounds within each ProseMirror block element.

**Rationale**: Block elements (`<p>`, `<h1>`) in a fixed-width container always span the full container width via CSS. The Range API lets us select the inline content within each block and get its pixel-accurate bounding rect via `getBoundingClientRect()`. This works for plain text, KaTeX math, and mixed content without causing layout thrash or visual flicker.

**Alternatives considered**:

- `scrollWidth` on the container — returns the container width since text wraps; doesn't help
- Temporarily set `width: max-content` — causes layout thrash, flickers, unreliable with math content
- Off-screen clone measurement — expensive, doesn't render KaTeX correctly without re-initializing
- `getComputedStyle` on text nodes — doesn't account for inline math or multi-font rendering

## R2: How to Handle RTL Text Bounds

**Decision**: Use viewport-relative coordinates from `getBoundingClientRect()` and convert to container-relative coordinates. RTL text naturally renders to the right side, and the Range API captures these positions correctly.

**Rationale**: No special RTL handling needed beyond the coordinate conversion. `getBoundingClientRect()` returns the actual visual position regardless of text direction. For RTL text, the resulting `offsetX` from the container's left edge will be positive (content is shifted right), which is the correct behavior.

**Alternatives considered**:

- Check `dir` attribute and flip coordinates manually — unnecessary; the browser already computes correct visual positions
- Use `getComputedStyle(el).direction` — adds complexity with no benefit since Range API handles it

## R3: When to Trigger Content Bounds Measurement

**Decision**: Measure inside the existing ResizeObserver callback in the TextBox component, alongside the current height measurement.

**Rationale**: The ResizeObserver already fires when content changes (typing, pasting, deleting). Adding width measurement here avoids a second observer and ensures bounds stay synchronized with height. The measurement is cheap (one `getBoundingClientRect()` per block element) and only fires on content change, not per frame.

**Alternatives considered**:

- Separate MutationObserver on ProseMirror DOM — additional observer with its own lifecycle; ResizeObserver already covers all relevant changes
- Measure on every TipTap `onUpdate` event — would fire on every keystroke even if bounds don't change; less efficient than ResizeObserver which batches

## R4: What Data to Store for Content Bounds

**Decision**: Store `contentBounds?: { offsetX: number; width: number }` on the TextBox interface. Height is already measured separately.

**Rationale**: Two values are sufficient:

- `offsetX`: horizontal offset of content from the text box origin (0 for LTR, positive for RTL)
- `width`: actual rendered content width (max width across all lines)

The selection bbox becomes: `(tb.x + contentBounds.offsetX, tb.y)` to `(tb.x + contentBounds.offsetX + contentBounds.width, tb.y + tb.height)`.

**Alternatives considered**:

- Store full `{minX, minY, maxX, maxY}` bounds — redundant with existing x/y/height; only horizontal adjustment is needed
- Store per-line bounds array — overly complex; the spec requires a single bounding rectangle

## R5: Empty Text Box Handling

**Decision**: When no content nodes exist in ProseMirror, use a minimum selectable area of 24x24px at the text box origin.

**Rationale**: Empty text boxes must remain selectable (spec FR-005). A 24x24px area is large enough to click/tap reliably on both desktop and touch devices, matching common touch target guidelines.

**Alternatives considered**:

- Use full container bounds for empty boxes — contradicts the tight bounds principle
- Use 0x0 bounds — makes empty boxes un-selectable
