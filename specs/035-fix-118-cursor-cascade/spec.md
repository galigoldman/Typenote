# Feature Specification: Fix Cursor Jumps in Multi-Page Reflow Cascade (#118 follow-up)

**Feature Branch**: `035-fix-118-cursor-cascade`
**Created**: 2026-04-09
**Status**: Draft
**Input**: User description: "I worked with Claude about issue 118, we tried to solve it. He did something that works halfway, but still have a few bugs. When working with a very long, like 9 pages text, and putting cursor on the last line and then 'Enter' it sometimes jumps to a different part of the page. Claude added a delay so it will be visual just temporarily for the tests. Also sometimes when doing the Enter thing on the border between pages 1–2 it jumps to page 9. Please read and see what's the cause and how can be fixed. Use the branch because it's closer to the solution as I see it."

## Clarifications

### Session 2026-04-09

- Q: Should paste-triggered cascades be in scope for this fix? → A: Defer paste. This spec only covers Enter/typing-triggered cascades.
- Q: When the user presses Enter in the **middle** of a page (not the last line), where should the cursor end up? → A: At the user's split position — i.e. on the new line that holds the second half of the split, on the **same page** the user was on (not on the next page). This is the same rule Word/Google Docs uses, and it works automatically for both LTR (English) and RTL (Hebrew): the cursor stays "behind" the pushed text in reading order, regardless of which physical screen-side that is.
- Q: Should the cursor **wait** at its old position during the cascade and jump to the final position when the cascade ends, or should it **move first** (same frame as the keystroke) and let the cascade run silently in the background? → A: Move first, cascade silently. The cursor lands at its final position on the same frame as the keystroke; the cascade runs invisibly in the background. The cursor never appears in the wrong place because it goes to the right place first.

## Context

The branch this spec is built on (`fix/118-reflow-surgical`) already contains a partial fix for [issue #118](https://github.com/galigoldman/typenote/issues/118) ("Type mode: text doesn't flow to next line/page automatically like Word/Docs"). Three commits were added in that branch:

1. `381bd6b` — surgical "linked text boxes" walk-around: when a per-page text box (`-ftb` migrated flow text box) overflows, the overflowing blocks are extracted and handed off to `handleTextOverflow`, which prepends them into the next page's text box (or creates a new page).
2. `584c655` — first attempt at keeping the cursor on the immediate next page during a multi-hop overflow cascade by guarding focus calls inside `focusPage`.
3. `47fa9a8` — second attempt: suppress ALL focus calls inside `focusPage` during a cascade, record the immediate-next page as the cursor target when the cascade starts, and restore the cursor to that target page **300 ms later** once the cascade has "fully settled".

The base reflow walk-around itself works (typed content is correctly migrated from page to page with no data loss). The remaining problems are entirely in the **cursor restoration after a multi-hop cascade**.

## Observed Bugs

### Bug A — Cursor jumps to a different part of the page when pressing Enter at the end of a long document

**Reproduction**: Open a document with ~9 pages of text. Place the cursor on the last visible line. Press `Enter`.

**Observed**: The cursor sometimes lands somewhere else on the page (not where the new empty paragraph actually is), and the user briefly sees the cursor in the wrong location before it eventually moves.

**Likely root cause** (from reading `src/components/canvas/canvas-editor.tsx:1053–1185`): the cursor restoration is performed inside a `setTimeout(..., 300)` at the end of the outermost cascade hop. The 300 ms is a hand-tuned heuristic for "the cascade has settled". When the document is long and every page is already near-full, even a tiny insertion at the end can cascade through more pages than 300 ms accounts for, so the timeout fires _while the cascade is still ripping through the document_ — and by then `cascadeCursorTargetRef` has been cleared (or pages have been re-ordered) and the cursor lands on whichever page the cascade had reached at that instant.

### Bug B — Pressing Enter at the boundary between pages 1–2 lands the cursor on page 9

**Reproduction**: Open the same ~9-page document. Place the cursor on the last line of page 1 (or the first line of page 2 — the visual border between them). Press `Enter`.

**Observed**: The cursor jumps all the way to page 9 (the very last page) instead of staying on the immediate next page next to the user's typing.

**Likely root cause**: same family of bug as A. The cascade `page 1 → 2 → 3 → … → 9` happens because every downstream page is already near-full, so prepending one extra block to page N pushes its tail block onto page N+1, which pushes its tail block onto page N+2, etc. The 300 ms cursor-restoration timer fires _during_ that cascade. When the timer fires the guard ref (`cascadeCursorTargetRef.current`) has either been nulled or overwritten by an inner hop that promoted itself to "outermost" because the original outermost target had already been cleared, so the restored cursor ends up on the page where the cascade is currently being processed — which, for a 9-page domino fall, is page 9.

### Bug C — A temporary 300 ms visual delay must not exist in production

The `setTimeout(..., 300)` in `handleTextBoxOverflow` is _itself_ a problem the user wants gone. They explicitly described it as "claude added a delay so it will be visual just temporarily for the tests". Even when the cursor lands on the correct page, the 300 ms gap between pressing `Enter` and the cursor visibly moving feels broken. A document editor's cursor must respond to typing without any perceptible delay.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Cursor stays where I was typing (Priority: P1)

When I press `Enter` (or any key that overflows a page) anywhere in a multi-page document, the text caret must end up at **my logical edit position**, exactly like Word and Google Docs:

- If I press `Enter` in the **middle** of a page, my cursor stays on that page, on the new line I just created (the second half of the split). The cascade pushes other content forward invisibly — my cursor does not move to the next page.
- If I press `Enter` at the **end of the last line of a page** (so the new empty paragraph itself is the thing that overflows), my cursor follows the new paragraph onto the next page.
- This rule must work identically in **LTR (English)** and **RTL (Hebrew)** documents — "before" and "after" the cursor are reading-order concepts, not screen-side concepts. ProseMirror's split already handles direction correctly; the fix must simply leave the cursor where ProseMirror put it (or restore it to that position) instead of forcibly moving it to the next page.

It must never jump to a page deeper in the document, and it must never jump to an unrelated location on the same page.

**Why this priority**: This is the single biggest source of "feels broken" behavior in the multi-page editor. Without it, users lose their place on every overflow event, which makes long documents unusable.

**Independent Test**: In a 9-page document, perform two distinct test paths:

1. Place cursor on the **last line of page 1**, press `Enter`, assert cursor lands on page 2 first line (because the new empty paragraph is the overflow).
2. Place cursor in the **middle of a paragraph in the middle of page 1**, press `Enter`, assert cursor stays on page 1 at the start of the new line, and only the displaced trailing block(s) move to page 2.

Repeat both paths in an RTL (Hebrew) document.

**Acceptance Scenarios**:

1. **Given** a 9-page document where every page is already near-full, **When** the user places the cursor at the end of the last line of page 1 and presses `Enter`, **Then** the cursor must be on page 2 on the line containing the new empty paragraph, and the viewport must scroll to that line.
2. **Given** a 9-page document where every page is already near-full, **When** the user places the cursor in the middle of a paragraph in the middle of page 1 and presses `Enter`, **Then** the cursor must stay on page 1 at the start of the new line (the second half of the split), and only the displaced trailing block(s) move to page 2 — invisibly to the user.
3. **Given** a 9-page document where every page is already near-full, **When** the user places the cursor on the last line of page 1 and the resulting overflow cascades through pages 2–9 (each domino-pushing a block forward), **Then** the cursor must still end up on page 2 — _not_ on the deepest cascade page (page 9).
4. **Given** the user is typing on the last visible line of the last page, **When** they press `Enter` and the overflow forces a brand-new page to be appended, **Then** the cursor must land on the first line of that new page.
5. **Given** the user presses `Enter` rapidly 5 times in a row at a page boundary, **When** each `Enter` triggers its own cascade, **Then** the cursor must end up on a single, well-defined location (the line where the most recent insertion went) — never on a different page than the latest insertion.
6. **Given** an RTL (Hebrew) document of 9 pages, **When** the user presses `Enter` at any position (middle of page or end of page), **Then** the cursor must follow exactly the same rules as scenarios 1–4 — the position-based rule is direction-agnostic.

---

### User Story 2 - Cursor moves instantly, with no perceptible delay (Priority: P1)

When I press `Enter` and a cascade is triggered, the cursor must arrive at its final position without a visible "pause then jump" effect. The user must not see the cursor briefly in the wrong place, then see it move 300 ms later. From the user's perspective, the cursor moves on the same frame as the keystroke.

**Why this priority**: Tied with User Story 1. A correct cursor that arrives 300 ms late still feels broken. This bug is what the user explicitly called out as "claude added a delay so it will be visual just temporarily for the tests".

**Independent Test**: Instrument an end-to-end browser test that records the time between the `Enter` keydown event and the next `selectionchange` event on the document. The delta must be under 100 ms (one frame at 60 Hz is 16.7 ms; allow some headroom for layout). Or, more pragmatically: assert that the cursor's `getBoundingClientRect()` is at the expected target position within 100 ms of the keydown.

**Acceptance Scenarios**:

1. **Given** any cursor restoration triggered by an overflow cascade, **When** the cascade resolves, **Then** the cursor must reach its final position within 100 ms of the triggering keydown — measured end-to-end in a real browser.
2. **Given** the codebase, **When** searching the cursor restoration path in `canvas-editor.tsx`, **Then** there must be no `setTimeout` with a delay greater than one animation frame (≈ 50 ms) used as a "wait for cascade to settle" heuristic.

---

### User Story 3 - Existing reflow walk-around still works, no regressions (Priority: P1)

The fix must not break the partial reflow fix that the branch already delivers. Specifically, content must still flow correctly from page to page, no typed characters must be lost, and the per-text-box overflow cascade must still terminate cleanly.

**Why this priority**: Without this guarantee, fixing the cursor bugs could re-introduce the original issue #118 data-loss bug. The user spent two sessions getting the walk-around to work without losing content; that property must be preserved.

**Independent Test**: The browser-verified scenario from commit `381bd6b` must still pass: insert 10 new paragraphs into the middle of a 43-paragraph baseline document and verify all 10 inserted paragraphs are still present after the cascade settles, correctly distributed across the appropriate pages.

**Acceptance Scenarios**:

1. **Given** the existing browser test from commit `381bd6b` (43 baseline blocks + 10 inserted blocks), **When** the cascade runs to completion, **Then** all 53 blocks must be present in the document with no content loss.
2. **Given** a multi-block overflow at the bottom of a `-ftb` text box, **When** the cascade hands the overflow off to the next page, **Then** the next page's text box must contain the overflow content prepended to its existing content (matching the current `focusPage` merge behavior).
3. **Given** the user is typing in a non-`-ftb` (user-positioned) text box, **When** content grows past the box's current height, **Then** the text box must continue to auto-grow freely without triggering the cascade — only `-ftb` boxes participate in inter-page reflow.

---

### Edge Cases

- **Enter in the middle of a page**: this is the most common real-world case. The user's cursor must stay on the **same page** at the start of the new line (the second half of the split). Only the displaced trailing block(s) move to the next page, invisibly. The cursor must not jump to the next page just because a cascade was triggered.
- **Enter at the end of the last line of a page**: the new empty paragraph itself is the overflow. Cursor follows it onto the immediately next page, on the first line.
- **Cascade triggered by typing one character at a time**: typing rapidly into a near-full page must not cause the cursor to "lag behind" or repeatedly jump to a different page on each keystroke.
- **Cascade that terminates by creating a new page**: if the cascade reaches the last existing page and a new page must be appended, the cursor must wait for the new page's editor to mount before being placed there. The polling/retry behavior currently in `focusPage` must continue to work.
- **Cascade triggered while a previous cascade is still in progress** (e.g., the user holds down `Enter`): each cascade's cursor target must not be overwritten by a later cascade — the cursor must always match the most recent insertion.
- **Empty target page**: if the cursor target is a brand-new page that has not yet mounted its editor, the cursor restoration must wait for mount (using the existing `focusPageRef` polling pattern) and then place the cursor on the first paragraph.
- **RTL document**: the same rules apply with no special-casing. The cursor stays at the user's split position in document-order terms; ProseMirror handles direction automatically.
- **Cursor on page 1, only one downstream page exists, page 2 was empty**: simplest case — cascade is exactly one hop, cursor must land per the rules above. This is the baseline that the test must guarantee works perfectly.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When an overflow cascade is triggered by user input, the system MUST place the text cursor at the user's **logical edit position** — the position where ProseMirror's split or insert command put the cursor — as soon as the cascade's synchronous work completes, with no visible delay or interim wrong-position state.
- **FR-002**: The system MUST NOT use a fixed-duration `setTimeout` (300 ms or otherwise) as a "wait for cascade to settle" heuristic in the cursor restoration path. Cursor placement must instead be tied to a deterministic "cascade fully done" signal — for example, a depth counter that decrements as each hop's synchronous work completes, a `processingTextBoxOverflowRef.size === 0` check after the final RAF, or any other event-driven signal that does not depend on a hand-tuned wall-clock delay.
- **FR-003**: The cursor target MUST be determined by **where the user's edit landed**, not by "the next page". Specifically:
  - If the user's edit is in the middle of a page (i.e., the displaced overflow blocks are different blocks from the user's edited block), the cursor stays on the **same page** at the user's edit position.
  - If the user's edit is itself the block that overflows (e.g., `Enter` at the end of the last line of a page, where the new empty paragraph is what gets pushed onto the next page), the cursor follows that block onto the **immediately next page**, at the position ProseMirror's split put it.
  - In no case may the cursor land on a page **further along the cascade chain** than the page that contains the user's edit. (For a cascade `page 1 → 2 → 3 → 4 → 5` triggered by an edit on page 1, the cursor lands on page 1 or page 2 — never on page 3+.)
- **FR-004**: The cursor MUST NOT land on an unrelated visual location on the same page (e.g., the top of the page when the user was typing at the bottom).
- **FR-005**: During a cascade, the system MUST suppress focus and viewport-scroll calls on _intermediate_ cascade hops (the pages whose content is being pushed forward by the cascade, not the page that received the user's content) so the viewport does not visibly jump to those intermediate pages.
- **FR-006**: When the cascade ends by creating a new page (i.e., the user was typing at the very end of the last existing page), the cursor MUST land on the first line of the newly created page once that page's editor has mounted. The existing `focusPageRef` retry-poll pattern must still be used for this case.
- **FR-007**: The cursor restoration rule MUST be **direction-agnostic**: it must work identically in LTR (English) and RTL (Hebrew) documents. The rule is expressed in **document-position terms** ("the position where ProseMirror put the cursor after the split"), not in screen-side terms ("left of the new content"), so direction is handled automatically by ProseMirror's existing behavior.
- **FR-008**: The fix MUST NOT cause any regression in the partial reflow walk-around already on the branch. Specifically, the browser-verified scenario from commit `381bd6b` (43 baseline blocks + 10 inserted blocks → all 53 present after cascade) must continue to pass.
- **FR-009**: The fix MUST NOT cause any regression in the existing per-page Enter handling for non-`-ftb` legacy flow editors (`canvas-page.tsx` lines 344–389). User-positioned text boxes must continue to grow freely without triggering inter-page cascade behavior.
- **FR-010**: When a cascade is triggered by holding down `Enter` (or otherwise pressing it rapidly), the cursor MUST always match the most-recent insertion. The system MUST handle overlapping cascades correctly — a later cascade's target must not be lost because of an earlier cascade's pending work.
- **FR-011**: The fix MUST be covered by an end-to-end Playwright test that types a 9-page document, performs an Enter both at the **end of a page** and in the **middle of a page**, and asserts that the cursor's bounding rect is in the correct location within 100 ms of the keydown. A second variant of the test MUST be run against an RTL (Hebrew) document to validate FR-007.

### Non-Functional Requirements

- **NFR-001 (testability)**: The cascade-completion signal used for cursor restoration must be deterministic enough that an E2E test can wait on it without using arbitrary `sleep`s or polling.
- **NFR-002 (perceived responsiveness)**: From the user's keydown to the cursor's final position, the elapsed time must be under 100 ms in a real browser, including layout. (One animation frame at 60 Hz = 16.7 ms; we leave generous headroom for cascades that touch many pages.)
- **NFR-003 (no flicker, "move first" strategy)**: The cursor MUST be placed at its final position on the **same frame** as the user's keystroke — _before_ the cascade begins to ripple through downstream pages. The cascade then runs silently in the background. The cursor must never appear in any wrong location at any point during the cascade, and the user must never see the cursor "freeze" while a cascade is in progress. (See Clarifications, Q3.)

### Out of Scope

- A full architectural rewrite of the per-page editor model into a single ProseMirror document. That is the "real" long-term fix for issue #118 but is much larger than this spec. This spec only addresses the cursor-jump bugs in the existing surgical walk-around.
- **Paste-triggered cascades.** A paste of multi-page content has a fundamentally different cursor rule (cursor → end of pasted content, which can be many pages later) and a different implementation (the algorithm has to track which inserted nodes are the user's pasted content vs. existing content displaced by the cascade). This is deferred to a separate follow-up spec. See Clarifications, Q1.
- Undo/redo behavior across a cascade. Whether `Cmd-Z` after a cascade restores the document and cursor correctly is a separate concern from the cursor-jump bugs and is not addressed here.
- Changes to the text-box height auto-fit logic or the `findOverflowSplitIndex` algorithm — those work correctly today.
- Changes to the legacy `canvas-page.tsx` flow editor's own onUpdate overflow path — that path is dormant on migrated documents.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a 9-page document, pressing `Enter` at the **end of the last line of page 1** places the cursor on page 2 (where the new empty paragraph went) in 100% of test runs, never on page 3 or later. (Verified by an E2E Playwright test.)
- **SC-002**: In a 9-page document, pressing `Enter` in the **middle of a paragraph in the middle of page 1** keeps the cursor on page 1 at the start of the new line in 100% of test runs, never moving to page 2 or beyond — even when the displaced trailing block(s) cascade through pages 2–9. (Verified by an E2E Playwright test.)
- **SC-003**: In a 9-page document, pressing `Enter` on the last line of the last page causes a new page to be created and the cursor lands on the first line of that new page in 100% of test runs. (Verified by an E2E Playwright test.)
- **SC-004**: SC-001 and SC-002 also pass when run against an **RTL (Hebrew)** document with the same content density. (Verified by a parallel E2E Playwright test.)
- **SC-005**: From the user's `Enter` keydown to the cursor reaching its final visible position, the elapsed time is under 100 ms — including all cascade hops, layout, and React commits — in 100% of test runs across at least 3 different document lengths (3, 6, 9 pages). (Verified by an E2E Playwright test that records `performance.now()` at keydown and at the next `selectionchange`.)
- **SC-006**: A search of `src/components/canvas/canvas-editor.tsx` for `setTimeout` returns no result that is part of the cursor-restoration path. The polling retries inside `focusPage` (which use 50 ms intervals to wait for newly-mounted editors to appear) are explicitly allowed to remain.
- **SC-007**: The 53-block scenario from commit `381bd6b` continues to pass with zero data loss after the fix.
- **SC-008**: All existing unit and integration tests in `pnpm test && pnpm test:integration` pass on the branch with the fix applied.
- **SC-009**: The full E2E suite in `pnpm test:e2e` passes on the branch with the fix applied.

## Assumptions

- The existing per-text-box overflow cascade is the only way the cursor can land on the wrong page. There are no other code paths (e.g., from drawing tools or PDF imports) that would cause the same symptom in Type mode.
- React 19's automatic batching and `pagesRef` already correctly reflect the cascade's intermediate state — the bug is _only_ in how the cursor-restoration code interprets that state, not in the state itself.
- The "near-full page" condition that produces a 9-hop cascade is reproducible in a Playwright test by inserting a known amount of dense text into each page (we don't need to rely on a specific font / line-height — we just need to fill each page to within ~1 line of its bottom margin).
- The user's two original reproduction descriptions ("jumps to a different part of the page" and "jumps to page 9") and the **middle-of-page Enter** case revealed during clarification all share the same root cause: the current `handleTextBoxOverflow` always sets the cursor target to "the next page" regardless of where the user's edit actually was. Fixing the cursor target rule (FR-003) and the cascade-completion signal (FR-002) together resolves all three.
- ProseMirror's `splitBlock` and direction-aware editing already correctly position the cursor after a split in both LTR and RTL documents. This spec leverages that behavior — we just need to **not move the cursor away from where ProseMirror put it** when the user's edit is in the middle of a page.
