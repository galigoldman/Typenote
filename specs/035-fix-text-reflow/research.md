# Phase 0 Research: Reliable Text Reflow and Pagination in Type Mode

**Feature**: 035-fix-text-reflow
**Date**: 2026-04-07

This document records the technical decisions made before implementation. Each decision is framed as **Decision → Rationale → Alternatives Considered**, per constitutional principle V (Interview-Ready Architecture).

The starting point is a detailed static read of `src/components/canvas/canvas-page.tsx` lines 427–562, `src/lib/canvas/text-split.ts`, `src/components/canvas/canvas-editor.tsx` lines 859–897, and the existing unit tests in `src/lib/canvas/__tests__/overflow-utils.test.ts`. That read identified four independent bugs; each decision below addresses one of them.

---

## Decision 1 — Measure content height via the last block's `offsetTop + offsetHeight`, not via `editorDom.scrollHeight`

### Decision

Replace the overflow-gate measurement:

```ts
const contentHeight = editorDom.scrollHeight; // old
```

with:

```ts
const lastChild = editorDom.lastElementChild as HTMLElement | null;
const contentBottom =
  lastChild != null ? lastChild.offsetTop + lastChild.offsetHeight : 0;
// replaces `contentHeight` in the `if (contentHeight > PAGE_HEIGHT)` check
```

The existing per-block measurement loop (`blockBottoms.push(el.offsetTop + el.offsetHeight)`) is unchanged — it was already correct. The goal is to make the **gate decision** and the **split-index decision** reference the exact same coordinate system.

### Rationale

The current code uses `scrollHeight` for the gate and `offsetTop + offsetHeight` for the per-block bottom. These measure different things:

- `scrollHeight` includes the editor DOM's padding (`pt-4` + `pb-4` ≈ 32px) and the margin collapse from the last block's `margin-bottom`.
- `offsetTop + offsetHeight` of the last block is measured in the editor DOM's padding-edge coordinates and does not include the editor's own `padding-bottom`.

This means there is a window roughly `pb-4 + last-block-margin-bottom` wide (≈16–32px) where `scrollHeight > PAGE_HEIGHT` is true **but** every block's `offsetTop + offsetHeight <= PAGE_HEIGHT`. In that window:

1. The gate check `if (contentHeight > PAGE_HEIGHT)` passes, so the code enters the split path and sets `overflowNotifiedRef.current = true` (line 442).
2. `findOverflowSplitIndex(blockBottoms, PAGE_HEIGHT)` returns `null` because no block bottom exceeds `PAGE_HEIGHT`.
3. The split path bails out without dispatching `onTextOverflow`. **Critically**, `overflowNotifiedRef.current` is never reset.
4. All subsequent `onUpdate` calls hit `if (... || overflowNotifiedRef.current) return;` at line 433 and bail out silently.
5. The editor appears "stuck" — typing no longer produces overflow detection.

This matches the user-observed symptom exactly: "typing past the bottom sometimes just... stops working." By using `lastChild.offsetTop + lastChild.offsetHeight` for both the gate AND the split-index loop, the two decisions are always consistent: if the gate says "overflow," the per-block loop will find the overflowing block.

### Alternatives considered

- **Subtract the editor's padding-bottom from `scrollHeight`**: would work (`scrollHeight - paddingBottom > PAGE_HEIGHT`) but is fragile — any future CSS change to `pb-4` silently re-introduces the bug. Tying the gate to a CSS value that can change out from under the measurement code is a smell.
- **Add hysteresis around the gate** (e.g. `contentHeight > PAGE_HEIGHT + 50`): papers over the symptom without fixing the root cause. The 50px buffer would fail the moment a user has exactly-fitting content.
- **Reset the gate with a `finally` block regardless of measurement**: this is a separate fix (see Decision 3) and is needed in addition to this one, because even with consistent measurement there are other no-op paths (e.g. `posInfo === null` in the single-block branch) that still leak.
- **Use ProseMirror's `view.coordsAtPos` for the end of the document**: the previous implementation tried this and failed because the text layer has `overflow: hidden`, so `coordsAtPos` returns clipped (visible-area) coordinates, not layout coordinates. Commit `e546a8d` switched away from `coordsAtPos` for exactly this reason.

---

## Decision 2 — `findOverflowSplitIndex` returns `null` when block 0 itself overflows

### Decision

Change the pure function `findOverflowSplitIndex` in `src/lib/canvas/text-split.ts`:

```ts
// CURRENT (buggy)
for (let i = 0; i < blockBottoms.length; i++) {
  if (blockBottoms[i] > pageHeight) {
    return Math.max(i, 1);
  }
}
return null;

// NEW
for (let i = 0; i < blockBottoms.length; i++) {
  if (blockBottoms[i] > pageHeight) {
    // A multi-block split only helps if at least ONE block still fits.
    // If block 0 already overflows, there is no valid block-level split —
    // the caller must split within block 0 (word-boundary path).
    if (i === 0) return null;
    return i;
  }
}
return null;
```

Adjust the existing unit tests accordingly: the "returns 1 (not 0) when the first block itself overflows" case and the "clamps to 1 when block 0 overflows in a multi-block doc" case both change to `null`.

The caller in `canvas-page.tsx` is updated to fall through to the single-block `splitBlock` path (which uses `posAtCoords` + word-boundary walk) when `findOverflowSplitIndex` returns `null` even though `doc.childCount > 1`.

### Rationale

The current `Math.max(i, 1)` was introduced (see existing test at line 23 of `overflow-utils.test.ts`) to "ensure at least one block stays on the current page." But this is the wrong invariant. The right invariant is: **a multi-block split is only valid if the blocks that remain on the current page actually fit on the current page.** If block 0 is itself 1500px tall, there is no block-level split that leaves the current page not-overflowing — block 0 has to be split internally.

The current behavior causes a **two-cycle flow**:

1. First cycle: `findOverflowSplitIndex([1500, 300], 1123)` returns `1`. Block 1 (the small paragraph) is moved to the next page. Block 0 (1500px) stays on the source page, which is still overflowing.
2. Second cycle: `onUpdate` fires again. Now `doc.childCount === 1`, so the code takes the single-block path, which splits block 0 at a word boundary near the page bottom. Now it works.

The two cycles are visible to the user as a flash (content briefly shows block 1 on the source page, then block 0 gets split, then the trailing portion of block 0 joins block 1 on the new page). Worse: between cycle 1 and cycle 2, if another keystroke lands, the second split can race with the first and produce a visually-broken intermediate state.

Returning `null` from `findOverflowSplitIndex` and making the caller fall through to the single-block word-boundary split resolves this in a single pass: block 0 is split at its natural word boundary, the trailing half becomes the overflow content, and the flow completes in one cycle.

This also simplifies reasoning about the function's contract: `findOverflowSplitIndex` now always returns a value `i` such that blocks `[0, i)` are guaranteed to fit on the page. The `Math.max(i, 1)` hack is gone.

### Alternatives considered

- **Return `0` instead of `null` with a "force split within block 0" flag**: adds a second return type and requires all callers to handle two variants. Simpler to just return `null` and let the caller take a different code path.
- **Keep `Math.max(i, 1)` and accept the two-cycle flow**: the flash and race conditions are real symptoms in the bug report. Two cycles is not acceptable.
- **Split block 0 at a block-level boundary even if it's too large**: there is no block-level boundary inside block 0 by definition — it's a single paragraph. The split has to happen at a character/word boundary, which is the single-block path's job.

---

## Decision 3 — Always reset `overflowNotifiedRef` after the overflow-detection pass

### Decision

Restructure the `onUpdate` overflow-detection block in `canvas-page.tsx` so that `overflowNotifiedRef.current = false` is guaranteed to run once the pass completes, regardless of which branch was taken. The cleanest form:

```ts
requestAnimationFrame(() => {
  const layer = textLayerRef.current;
  if (!layer || overflowNotifiedRef.current) return;
  try {
    // ... measurement + split logic (Decision 1 + Decision 2) ...
  } finally {
    overflowNotifiedRef.current = false;
  }
});
```

The existing intermediate assignments `overflowNotifiedRef.current = true` at entry (line 442) become **no longer needed** — the gate is actually provided by the `if (... || overflowNotifiedRef.current) return;` check at the top combined with the fact that `onTextOverflow` blurs the editor, which stops further `onUpdate` events from firing on this editor until the user focuses it again.

Wait — the gate at line 442 was guarding against `onUpdate` re-entry _within_ a single rAF pass (e.g. if `ed.chain().deleteRange(...).run()` synchronously fires another `onUpdate`, which schedules another rAF). We need to keep that guard. The simplest pattern:

```ts
requestAnimationFrame(() => {
  const layer = textLayerRef.current;
  if (!layer) return;
  if (overflowNotifiedRef.current) return;
  overflowNotifiedRef.current = true;
  try {
    // ... measurement + split logic ...
  } finally {
    overflowNotifiedRef.current = false;
  }
});
```

Now the gate is held only during the synchronous body of the rAF and released at the end, every time.

### Rationale

The original code sets `overflowNotifiedRef.current = true` once, and resets it in three places:

1. After a successful multi-block split (line 484, after dispatching `onTextOverflow`).
2. After a successful single-block split (line 544).
3. In the hysteresis branch `contentHeight < PAGE_HEIGHT - 100` (line 557).

But there are at least four **no-op paths** where the gate is not reset:

- `splitIdx === null` in the multi-block branch (line 465 — the `if` is false, the code falls out of the inner `if` and exits the outer `if (contentHeight > PAGE_HEIGHT)` body without a reset). This is the main issue caused by the measurement mismatch in Decision 1 (now also addressed there).
- `splitIdx >= doc.childCount` in the multi-block branch (ditto).
- `posInfo == null` in the single-block branch (line 500 — the `if` is false, takes the `else` branch which calls `onTextOverflow(pageId, null)`). Actually this one DOES navigate without passing content, so the gate DOES need to stay set until the navigation finishes... or does it? Navigation blurs the current editor, so it won't fire `onUpdate` again on this editor. Resetting the gate is safe.
- `posInfo.pos <= 2` in the single-block branch (implicit — the outer `if (posInfo && posInfo.pos > 2)` is false, and the `else` handles it correctly).

Using a `try/finally` makes the cleanup a local invariant of the function: the gate is held exactly as long as the rAF body runs, no matter which path it takes. This is the same pattern as acquiring a lock in a constructor and releasing it in a destructor — it's robust to future edits that add new branches.

A subtle correctness concern: what about the **nested `onUpdate`** fired by `ed.chain().deleteRange(...).run()`? That nested onUpdate synchronously queues another rAF. When that rAF fires, will the gate already be released by the outer `finally`? Yes — the outer rAF body completes before the nested rAF runs (nested rAFs run in the _next_ frame, not synchronously). So by the time the nested rAF runs, `overflowNotifiedRef.current === false`, and it can re-check overflow freely. That's exactly what we want: cascade should happen.

### Alternatives considered

- **Reset the gate at the start of every rAF pass**: removes the ability to guard against re-entry within a single pass. Unsafe if ProseMirror changes transaction semantics in a future release.
- **Use a local variable instead of a ref for the gate**: doesn't survive across frames; the ref is needed to prevent concurrent rAF callbacks from both entering the split path.
- **Explicit `dispatched` flag + conditional reset**: marginally more intent-revealing but noisier. `try/finally` is idiomatic and shorter.

---

## Decision 4 — Line wrapping for long words is already handled by TipTap's default styles (no production change needed)

### Update during implementation

During Phase 4 of implementation, a Playwright test was added that inserts a 300-character single-word string (`'x'.repeat(300)`) into the flow editor and asserts `scrollWidth <= clientWidth`. The test **passed without any production code change**. Investigation of `node_modules/@tiptap/core/src/style.ts` showed that TipTap already ships the following CSS with every editor:

```css
.ProseMirror {
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  ...
}
```

`word-wrap: break-word` is the legacy alias for `overflow-wrap: break-word`, which is exactly the CSS property that Decision 4 originally proposed to add via Tailwind's `break-words` class. Adding `break-words` on top of this would be **redundant** — the behavior is already in place.

**Conclusion**: The line-wrap symptom reported in issue #118 was most likely a _visual consequence_ of the page-overflow bug fixed by Decisions 1–3, not a separate CSS problem. When the overflow gate got stuck (Decisions 1 and 3) and the page's bottom content was clipped by `overflow: hidden`, the user saw text that appeared to "not wrap" when it was actually just invisible below the clip boundary. Fixing the overflow cascade fixes the perceived wrap issue too.

**Action taken**: The production edit originally planned for Phase 4 was **dropped**. The Playwright test for long-word wrapping was **kept** as a regression guard — if a future TipTap upgrade removes `word-wrap: break-word` from its default CSS, the test will catch it before it ships.

### Original Decision (retained for history)

### Decision

### Decision

Change the `editorProps.attributes.class` in `canvas-page.tsx` (around line 342):

```ts
// BEFORE
class: `prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`;

// AFTER
class: `prose prose-sm sm:prose-base max-w-none break-words focus:outline-none min-h-full ${editorPaddingTop} pb-4 px-4`;
```

`break-words` is the Tailwind class for `overflow-wrap: break-word`, which tells the browser to break a word mid-character when (and only when) it would otherwise overflow its container.

### Rationale

The line-wrap symptom in the bug report ("text doesn't always wrap to the next line correctly") is independent of the overflow-detection bugs. It manifests on very long words — URLs, no-space strings, certain code snippets — where native word-based wrap has no whitespace to break at. The editor's parent (`textLayerRef`) has `overflow: hidden` (see line 717 of `canvas-page.tsx`), so an over-wide paragraph is visually clipped at the right edge and the user thinks "the editor stopped wrapping."

`break-words` only kicks in when natural word-boundary wrap would otherwise overflow, so it is a zero-impact change for normal prose (where words are short and fit naturally). The Tailwind Typography `prose` base styles do not set `overflow-wrap`, so adding `break-words` explicitly is necessary.

An even more aggressive alternative, `break-all` (maps to `word-break: break-all`), was considered and rejected because it breaks _every_ line at a character boundary, not just overflowing ones — which is ugly for CJK text and URLs. `break-words` is the goldilocks choice.

### Rationale for not also adding `hyphens-auto`

`hyphens-auto` would add nicer typography for ordinary long words, but it is out of scope for a bug fix and introduces locale-dependent behavior (hyphenation dictionaries). Deferred.

### Alternatives considered

- **`word-break: break-word`** (non-standard, equivalent to `overflow-wrap: break-word` in most browsers) — deprecated. Use `overflow-wrap` explicitly via `break-words`.
- **Custom CSS rule scoped to `.ProseMirror` in `globals.css`**: works, but diffuses the fix across two files. Scoping it to the editor's attribute class is more local and survives CSS refactors.
- **Global `*` selector**: too broad; would affect non-editor text across the app.

---

## Decision 5 — Test strategy: adjust unit tests for the pure function; add one Playwright e2e for the integration

### Decision

1. **Unit tests** — modify `src/lib/canvas/__tests__/overflow-utils.test.ts`:
   - Change the "returns 1 (not 0) when the first block itself overflows" test to expect `null`.
   - Change the "clamps to 1 when block 0 overflows in a multi-block doc" test to expect `null`.
   - Add a new test: `findOverflowSplitIndex([600, 1500, 1800], 1123)` returns `1` (regression guard for the "block 1+ overflows" case, which must still return the correct split index after Decision 2's refactor).
   - Add a new test documenting the "block 0 exactly at the boundary, block 1 overflows" case: `[1123, 1400]` returns `1`.

2. **E2E test** — new file `e2e/canvas-type-mode-flow.spec.ts`:
   - Uses the shared `e2e/helpers/auth.ts` login helper.
   - Navigates to a new or seeded canvas-backed document, switches to Text mode.
   - Pastes a deterministic 12-paragraph block (see test contract in `plan.md`). Paste is deterministic; typing character-by-character is too slow and flaky in CI.
   - Asserts: `pages >= 2` after settle; first paragraph visible on page 1, last paragraph visible on last page; no paragraph text is missing from the visible DOM.

3. **Constitution II compliance** — both the unit test changes and the new e2e spec MUST be written and committed FIRST, observed to FAIL against the current `canvas-page.tsx` / `text-split.ts`, then the production fix applied, and finally the tests re-run to confirm they pass.

### Rationale

**Why unit tests for the pure function?** `findOverflowSplitIndex` is a pure function with clear input/output types. Unit testing it is cheap, fast, and gives high-confidence coverage of Decision 2. The existing test file already exists — we just need to update it.

**Why Playwright for the integration?** The actual bug is an interaction between measurement, gate state, and React/TipTap transaction timing. Unit testing that in isolation would require mocking `requestAnimationFrame`, `scrollHeight`, `offsetTop`, React state updates, and ProseMirror's transaction semantics — more test code than production code, and high maintenance cost. Playwright runs a real browser with real layout and real React; it catches the end-to-end bug and is a realistic regression guard.

**Why paste instead of typing in the e2e test?** Typing a 2000-character paragraph via `page.keyboard.type()` takes multiple seconds per test run and is known to be flaky on slow CI machines. A single paste operation triggers the same overflow-detection code path and is deterministic.

**Why one e2e test, not three (one per user story)?** The three user stories in the spec all touch the same underlying code paths. One multi-assertion test that paste-overflows then verifies the resulting document state covers US1 (page overflow), US2 line-wrap can be covered by a sibling assertion (paste a long URL and check it's not visually clipped), and US3 paste is covered by construction. Splitting into three tests would triple the setup cost without meaningfully increasing coverage.

### Alternatives considered

- **Add a Vitest test that constructs a TipTap editor in JSDOM**: JSDOM does not compute layout (`offsetTop` is 0 for everything), so the test would be meaningless.
- **Use Playwright to type 2000 characters via `page.keyboard.type`**: too slow, too flaky. Paste is the right primitive.
- **Snapshot-test the editor's rendered HTML after overflow**: brittle — any CSS change breaks the snapshot for reasons unrelated to the fix. Use DOM locator assertions instead.
- **Skip the e2e test and rely on manual verification**: violates constitution principle II (no failing-test-first). Also leaves the bug unguarded against regression.

---

## Decision 6 — Scope explicitly excludes backward reflow and the `TiptapEditor` (text-only docs)

### Decision

This fix does NOT touch:

- `src/components/editor/tiptap-editor.tsx` — the standalone text editor used for text-only documents (imported `.docx`, etc.). It has no pagination model and is not part of "Type mode" as defined in the spec.
- `handleTextOverflow` in `canvas-editor.tsx` lines 859–897 — the parent-side orchestration. Its current polling-based `focusPage` is unchanged; the bugs are upstream of it (in the page-local overflow detection).
- Backward reflow (pulling content back from later pages when a page becomes under-filled after deletion). See "Out of Scope" in `spec.md`.

### Rationale

The spec is clear that "Type mode" means the per-page flow editor inside `CanvasEditor`, and that backward reflow is out of scope. Keeping the scope tight reduces risk and makes the fix reviewable in one pass. If the polling-based `focusPage` race turns out to be a distinct second bug, it can be addressed in a follow-up feature — but static analysis did not find evidence that it's contributing to issue #118, so chasing it speculatively would violate the "don't over-engineer" principle.

### Alternatives considered

- **Unify `TiptapEditor` and Canvas flow-content into a single editor component**: out of scope, risky, and the two serve different document types with different data shapes.
- **Also rewrite `focusPage` to use `editor.commands.focus()` via an event-driven hook instead of polling**: speculative. Wait for evidence this is actually a user-visible bug.

---

## Summary of bugs and fixes

| #   | Bug                                                           | Root cause                                                                                                                                                 | Fix                                                                                            | Location                                                             |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Overflow detection gets "stuck" after some content heights    | `scrollHeight` (gate) and `offsetTop + offsetHeight` (split index) use different reference frames; `overflowNotifiedRef` is never reset when they disagree | Use the last block's `offsetTop + offsetHeight` for the gate                                   | `canvas-page.tsx` ~line 439                                          |
| 2   | Paste of a very long first paragraph causes a two-cycle flash | `findOverflowSplitIndex` clamps to `Math.max(i, 1)` which keeps an oversized block 0 on the source page                                                    | Return `null` when block 0 overflows; caller falls through to single-block word-boundary split | `text-split.ts` lines 87–90 and `canvas-page.tsx` branch at line 465 |
| 3   | Gate never resets on no-op paths                              | No `finally`; reset only inside success branches                                                                                                           | `try { ... } finally { overflowNotifiedRef.current = false; }` around the rAF body             | `canvas-page.tsx` ~line 431                                          |
| 4   | Long words / URLs extend past the right edge and get clipped  | `.prose` does not set `overflow-wrap`                                                                                                                      | Add `break-words` to the editor's `attributes.class`                                           | `canvas-page.tsx` line 342                                           |

Together these four edits are expected to make Type mode flow reliable enough to satisfy all the success criteria in `spec.md`.
