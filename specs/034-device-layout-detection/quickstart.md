# Quickstart: Device-Aware Document Editor Layout

**Feature**: 034-device-layout-detection
**Audience**: Anyone reviewing or testing this fix
**Time to verify**: ~5 minutes

This document explains how to manually verify the fix works, and how to run the automated test that proves it.

---

## What this fix does in one sentence

It changes the document editor so it picks between its desktop ("page mode") and tablet ("full-width mode") layouts based on the **type of device** the user is on, not based on **how wide the browser window** happens to be.

---

## Manual verification

### Reproduce the bug (before applying the fix)

1. Run `pnpm dev` and sign in
2. Open any document in the editor
3. **Make sure your browser window is at least 1280px wide.** You should see:
   - Centered A4 page on a gray background with a soft drop shadow
   - A header bar above the toolbar showing: back arrow, home, sidebar toggle, the **editable title input**, connection indicator, save button, and save status
4. **Now drag the browser window narrower than 1280px** (or open DevTools docked to one side until the page is narrower)
5. Observe the bug:
   - The page background flips from gray to edge-to-edge white
   - The page surface loses its shadow and vertical padding
   - The desktop header bar disappears entirely
   - In its place, a cramped truncated title label appears at the start of the toolbar
   - You no longer have a save button, sidebar toggle, or connection indicator
6. This is wrong: you're on a desktop with a mouse, but the editor is treating you like a tablet user

### Verify the fix (after applying it)

Repeat the same steps. After step 4, **nothing should change**:

- The page background stays gray
- The page keeps its shadow and padding
- The desktop header bar stays visible with the editable title, save button, etc.
- No truncated tablet title appears in the toolbar
- Resizing the browser through any range of widths should produce **zero visible layout changes** — the layout no longer reacts to width at all

### Verify it on an actual tablet (or DevTools mobile mode)

1. Open the same document in either:
   - Chrome DevTools' device toolbar set to "iPad Pro" (or any tablet preset), OR
   - An actual iPad or Android tablet
2. You should see the **full-width / tablet layout**: edge-to-edge white background, no shadow, no padding, the cramped truncated title label inside the toolbar instead of the desktop header bar
3. Rotate the device (or rotate the DevTools viewport). Layout should stay full-width in both portrait and landscape
4. **Resize the DevTools viewport to be very wide** (e.g. 1600px) while still in iPad emulation mode. The layout should **stay** in full-width mode — because the device is still a tablet, even though the viewport is wide

---

## Run the automated regression test

The fix ships with a Playwright e2e test at `e2e/editor-device-layout.spec.ts` that runs against two browser projects:

| Project                 | Configuration               | Reports `pointer:` as |
| ----------------------- | --------------------------- | --------------------- |
| `chromium` (existing)   | `devices['Desktop Chrome']` | `fine`                |
| `chromium-tablet` (new) | `devices['iPad Pro 11']`    | `coarse`              |

To run only the layout-detection test:

```bash
pnpm test:e2e e2e/editor-device-layout.spec.ts
```

To run it interactively in Playwright's UI mode (lets you watch the assertions run in a real browser):

```bash
pnpm test:e2e:ui e2e/editor-device-layout.spec.ts
```

### What the test checks

1. **Sanity check** — confirms the test infrastructure actually flips the `pointer` media feature: `matchMedia('(pointer: coarse)').matches` returns `true` on the tablet project and `false` on the desktop project. If this fails, no layout assertions can be trusted.
2. **Desktop header bar visibility** — visible on desktop, hidden on tablet
3. **Mobile title cluster visibility** — hidden on desktop, visible on tablet
4. **Computed background color of the scroll container** — `bg-gray-100` on desktop, `bg-white` on tablet
5. **The actual bug repro** — on the desktop project, resize to 800×600 (well below the old 1280px breakpoint) and re-assert assertions 2 and 3 still hold. This is the test that would have caught issue #114.

### What "passing" means

- Run the test against the **current code** (before applying the className fixes): assertions 2 and 5 must **fail**, because the old `xl:` rule swaps the layout at 1280px.
- Run the test after applying the className fixes: all assertions must **pass**.
- This is the failing-test-first sequence the constitution requires for bug fixes (Principle II).

### Run the rest of the test suite

To make sure nothing else broke:

```bash
pnpm lint
pnpm test                    # unit tests (Vitest, jsdom)
pnpm test:e2e                # full Playwright suite, both projects
pnpm build                   # ensure the production build still works
```

All four must pass before opening a PR. CI will run the same commands on the PR.

---

## Files that change

- `src/components/canvas/canvas-editor.tsx` — four className edits (lines ~1503, ~1587, ~1853, ~1872)
- `src/components/canvas/canvas-page.tsx` — one className edit (line ~677)
- `playwright.config.ts` — add a `chromium-tablet` project entry
- `e2e/editor-device-layout.spec.ts` — new test file

That's it. No new dependencies, no Tailwind config, no React hooks, no JavaScript logic. Five className strings + one new test.

---

## Why these decisions?

If you're reviewing this and want to know **why** we used CSS instead of a JavaScript hook, why the cascade defaults to page mode, why `pointer:` instead of `any-pointer:`, etc., read [`research.md`](./research.md) — every decision is captured there with rationale and alternatives considered.
