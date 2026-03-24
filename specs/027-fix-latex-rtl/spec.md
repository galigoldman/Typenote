# Feature Specification: Fix LaTeX Math Direction in RTL Text

**Feature Branch**: `027-fix-latex-rtl`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Math should be LTR even though it is in a Hebrew text"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Inline Math Renders LTR in Hebrew Text (Priority: P1)

A user writes notes in Hebrew and inserts an inline LaTeX expression such as `y \in S` into the middle of a Hebrew sentence. The math expression renders left-to-right with correct symbol orientation (e.g., `y ∈ S`, not the mirrored `S ∋ y`), regardless of the surrounding text's RTL direction.

**Why this priority**: This is the core bug. Math is universally written LTR, and mirrored symbols change mathematical meaning (∈ vs ∋ are different operators). Incorrect rendering makes notes mathematically wrong and unusable.

**Independent Test**: Insert a LaTeX expression containing directional symbols (∈, →, ≤) into a Hebrew paragraph and verify the symbols display in their standard LTR orientation.

**Acceptance Scenarios**:

1. **Given** a text box containing Hebrew text, **When** the user inserts an inline LaTeX expression like `y \in S`, **Then** the rendered math displays as `y ∈ S` (LTR) with correct symbol orientation.
2. **Given** a Hebrew paragraph with an inline LaTeX expression, **When** the page is rendered or re-opened, **Then** the math expression maintains LTR direction and correct symbol orientation.
3. **Given** a Hebrew sentence with multiple inline LaTeX expressions, **When** rendered, **Then** each math expression independently renders LTR while the surrounding Hebrew text remains RTL.

---

### User Story 2 - Block/Display Math Renders LTR in RTL Context (Priority: P2)

A user creates a standalone (display/block) LaTeX equation while writing in Hebrew. The entire block equation renders LTR with correct symbol orientation, centered or aligned appropriately regardless of the page's text direction.

**Why this priority**: Display math is less common than inline math but follows the same LTR requirement. The fix should apply consistently to both inline and block math.

**Independent Test**: Create a display-mode LaTeX equation in a document that contains Hebrew text and verify it renders LTR.

**Acceptance Scenarios**:

1. **Given** a document with Hebrew text, **When** the user creates a display/block LaTeX equation, **Then** the equation renders in LTR direction with correct symbol orientation.
2. **Given** a block LaTeX equation between Hebrew paragraphs, **When** rendered, **Then** the equation displays LTR while surrounding paragraphs remain RTL.

---

### User Story 3 - PDF Export Preserves LTR Math in RTL Text (Priority: P3)

A user exports a document containing Hebrew text with embedded LaTeX expressions to PDF. The exported PDF preserves the correct LTR direction for all math expressions.

**Why this priority**: Export is a downstream consumer of the rendering. If the in-editor rendering is fixed, the export should ideally inherit the fix, but it needs verification.

**Independent Test**: Export a Hebrew document with inline and block LaTeX to PDF and verify math symbols are correctly oriented.

**Acceptance Scenarios**:

1. **Given** a Hebrew document with inline LaTeX expressions, **When** exported to PDF, **Then** all math expressions appear LTR with correct symbol orientation in the PDF output.

---

### Edge Cases

- What happens when a LaTeX expression contains Hebrew characters (e.g., variable names in Hebrew)? The math container should still be LTR, with Hebrew characters appearing as-is within the LTR math context.
- What happens with mixed LTR (English) and RTL (Hebrew) text both containing inline LaTeX? Math should be LTR in both contexts.
- What happens with LaTeX expressions that use directional arrows (→, ←, ↔)? Arrows must maintain their intended direction and not be mirrored.
- What happens with nested expressions like `\underset{n \to \infty}{\lim} \frac{1}{x}`? The entire nested structure should render LTR.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST render all inline LaTeX math expressions in LTR direction regardless of the surrounding text's directionality.
- **FR-002**: System MUST render all block/display LaTeX math expressions in LTR direction regardless of the document's text directionality.
- **FR-003**: System MUST NOT mirror or reverse mathematical symbols (∈, →, ≤, ∑, ∫, etc.) when they appear within RTL text context.
- **FR-004**: System MUST preserve the correct reading order of math operands (e.g., `y ∈ S` must not become `S ∋ y`).
- **FR-005**: System MUST maintain correct RTL direction for non-math text surrounding the LaTeX expressions.
- **FR-006**: System MUST apply LTR direction to math expressions in all rendering contexts: live editor, document view, and PDF export.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of LaTeX expressions containing directional symbols (∈, →, ≤, ∑) render with correct LTR orientation when embedded in RTL text.
- **SC-002**: Mathematical expressions maintain identical visual output regardless of whether the surrounding text is LTR or RTL.
- **SC-003**: No regression in LTR-only documents — existing LaTeX rendering in English/LTR text remains unchanged.
- **SC-004**: Fix applies across all rendering surfaces (editor, viewer, PDF export) without surface-specific workarounds needed by the user.

## Assumptions

- The root cause is that the KaTeX/math rendering container inherits the RTL direction from the surrounding text or document context.
- The fix involves ensuring math rendering containers explicitly enforce LTR direction to isolate math from the surrounding text direction.
- This is a presentation-level fix, not a data model change — no database migration is needed.
- The existing KaTeX library supports LTR rendering correctly; the issue is in how the application wraps/embeds KaTeX output.
