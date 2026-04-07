# Phase 0 Research: Device-Aware Document Editor Layout

**Feature**: 034-device-layout-detection
**Date**: 2026-04-07

This document records the technical decisions made before implementation. Each decision is framed as **Decision → Rationale → Alternatives Considered**, in line with constitutional principle V (Interview-Ready Architecture).

---

## Decision 1 — Mechanism: CSS-only via Tailwind's `pointer-fine:` / `pointer-coarse:` variants

### Decision

Drive the layout choice **purely from CSS** using Tailwind 4's built-in `pointer-fine:` and `pointer-coarse:` variants, which compile to `@media (pointer: fine) { ... }` and `@media (pointer: coarse) { ... }`. No JavaScript, no React state, no custom hook, no Tailwind config changes.

### Rationale

1. **No layout flash on first paint (FR-004)** — the browser evaluates `@media` queries during stylesheet parsing, before the first paint. Compare with the JS approach: Server-side rendering has no `window` object, so a `useEffect` + `matchMedia` hook can only run after the React component has mounted on the client, which means the first server-rendered paint MUST pick a default that may then visibly switch when the hook runs. That's the layout flash the spec forbids.
2. **Zero runtime cost** — no JS executes, no React re-renders, no state to keep in sync. The browser does the work natively. Compare: a JS hook adds an event listener for the `MediaQueryList`, schedules React state updates, and contributes to bundle size and hydration cost.
3. **Smaller change surface** — five className edits in two files. No new files, no new hooks, no new tests of the hook itself, no risk of stale state, no SSR/CSR mismatch to handle.
4. **Consistent with how the editor already works** — the existing implementation uses Tailwind's `xl:` variant, which is also a CSS-only @media query mechanism. We're swapping one media feature (`min-width`) for another (`pointer`), not switching paradigms.
5. **Tailwind 4 ships these variants out of the box** — no `tailwind.config.js` changes (the project doesn't even have one; Tailwind 4 uses the `@import 'tailwindcss';` directive in `globals.css`). The `pointer-*` variants have been built-in since Tailwind 3.4 and remain in v4. No extra arbitrary-variant syntax needed.

### Alternatives considered

- **JavaScript hook with `window.matchMedia` and React state** — rejected. Causes the flash described above, adds runtime cost, adds a new hook to test, adds hydration concerns, and provides no benefit over CSS for this use case. Worth it only if we needed live re-evaluation when the user plugs/unplugs a device mid-session, which the spec explicitly says we don't (Out of Scope).
- **Server-side user-agent sniffing in Next.js middleware** — rejected. Forbidden by FR-007. UA strings are unreliable and don't capture hybrid devices (touchscreen laptops, iPads with keyboards). Also still causes a flash if the user changes devices via account sync.
- **Custom Tailwind variant via `tailwind.config.ts` `addVariant()`** — rejected. Tailwind 4 already ships `pointer-fine` and `pointer-coarse`. Adding a custom variant would be redundant and would also force the project to introduce a config file it currently doesn't need.

---

## Decision 2 — Cascade direction: page mode is the default; `pointer-coarse:` is the override

### Decision

In every className, the **default style** (the one with no variant prefix) represents **page mode**, and the `pointer-coarse:` variant represents the **tablet override**.

This means rewriting all five existing classNames to flip the cascade direction. For example:

- Today: `bg-white xl:bg-gray-100` — full-width is the default, page mode is the desktop override.
- Tomorrow: `bg-gray-100 pointer-coarse:bg-white` — page mode is the default, full-width is the tablet override.

### Rationale

This is the cleanest way to satisfy **FR-005** (page-mode fallback when detection is unavailable) without any extra logic. CSS media queries follow this rule: if a query doesn't match (or isn't supported by the browser at all), only the default styles apply. So:

| Browser scenario                                    | What matches                                            | Result                                                |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Modern browser, desktop user                        | `(pointer: fine)` matches; `(pointer: coarse)` does not | Default styles only → page mode ✅                    |
| Modern browser, tablet user                         | `(pointer: coarse)` matches                             | Default + override → full-width mode ✅               |
| Old browser without `pointer` media feature support | Neither matches                                         | Default styles only → page mode ✅ (FR-005 satisfied) |
| Browser bug: pointer media feature is broken        | Behaves as "no match"                                   | Default styles only → page mode ✅                    |

If we'd done it the other way around (default = full-width, `pointer-fine:` overrides to page mode), the fallback case would land on **full-width** mode, which violates FR-005 and would actually make the user experience strictly worse on broken/old browsers (which are most likely on old desktops).

### Alternatives considered

- **Default = full-width, `pointer-fine:` override = page mode** — rejected. Lands on the wrong fallback (FR-005 violation). Also has the philosophical issue that "tablet" is the more constrained design intended for touch surfaces, so making it the default would imply "assume tablet unless proven otherwise," which is backwards for a project where the majority of users are on desktops.
- **Use both `pointer-fine:` and `pointer-coarse:` variants together with a neutral default** — rejected. More verbose, no benefit, harder to read, doesn't change the fallback behavior, and provides three states (fine / coarse / neither) where we only have two desired outcomes.

---

## Decision 3 — Use `pointer:` not `any-pointer:`

### Decision

Use the `pointer` media feature (Tailwind: `pointer-fine` / `pointer-coarse`), not the `any-pointer` variant (Tailwind: `any-pointer-fine` / `any-pointer-coarse`).

### Rationale

The two media features mean different things:

- **`pointer`** reports the user's **primary** input device. On a touchscreen Windows laptop, the trackpad is primary, so `pointer: fine` is true and `pointer: coarse` is false. On an iPad with a magic keyboard attached, touch is still primary, so `pointer: coarse` is true.
- **`any-pointer`** reports whether the device has _any_ pointing device of a given type. The same touchscreen laptop has BOTH `any-pointer: fine` AND `any-pointer: coarse` true, because it has both a trackpad and a touchscreen.

The spec asks for layout decisions based on the **primary** input type (FR-001, FR-002, FR-003 all say "primary input"). That maps directly to `pointer`, not `any-pointer`. Using `any-pointer` would mis-categorize an iPad with a paired keyboard+trackpad as a desktop, which would regress User Story 3 acceptance scenario 2.

This is also the recommendation from the W3C Media Queries Level 4 spec and from MDN: "Use `pointer` to query the primary pointing device."

### Alternatives considered

- **`any-pointer`** — rejected for the reason above (would break User Story 3 ACE 2).
- **`hover` media feature instead of `pointer`** — rejected. `hover` reports whether the primary pointing device can hover (mouse: yes, finger: no), which produces almost the same partition but is less semantically precise. `pointer: fine` more directly means "this user has a precise pointing device," which is the concept the spec is built around. Also: stylus-on-tablet reports `hover: hover` on some devices but `pointer: coarse`, which would put the iPad-with-Pencil case in the wrong bucket if we used `hover`.

---

## Decision 4 — Test strategy: Playwright project for iPad emulation

### Decision

Add a second Playwright project (`chromium-tablet`) to `playwright.config.ts` that uses Playwright's built-in `devices['iPad Pro 11']` descriptor. Write one new e2e spec, `e2e/editor-device-layout.spec.ts`, that runs against both the existing `chromium` (desktop) project and the new tablet project, and asserts opposite layout outcomes.

The spec contains a sanity check that calls `matchMedia('(pointer: coarse)').matches` to confirm that the test infrastructure actually flips the media feature. If that sanity check fails, the test fails loudly with a message pointing at the Playwright config — preventing silent green tests.

### Rationale

1. **Tests the real CSS media feature, not a stub.** Stubbing `window.matchMedia` in JSDOM doesn't actually evaluate the CSS — the styles applied to elements wouldn't change, so we'd be testing nothing useful.
2. **Playwright's `iPad Pro 11` device descriptor sets `hasTouch: true` and `isMobile: true`, both of which cause Chromium's `pointer` media feature to report `coarse`.** This is the same machinery that makes Chrome DevTools' "device toolbar" work. Verified by the sanity check in step 1 of the test.
3. **Aligns with how the existing e2e suite is structured** — the project already uses Playwright with a `chromium` project; adding a sibling project is a small, idiomatic change.
4. **Constitutional requirement (II)**: "When fixing a bug, MUST write a failing test that reproduces the bug first." The desktop-resize assertion (test step 5) reproduces the GitHub issue exactly: load editor on desktop project (which uses `pointer: fine`), shrink the viewport to 800×600 (well below the 1280px old breakpoint), assert the desktop header bar is still visible. This would fail today because the old `xl:` rule would have hidden it; it will pass after the className swaps.

### Alternatives considered

- **Vitest unit test that mounts the editor in JSDOM and stubs `matchMedia`** — rejected. JSDOM doesn't compute styles from CSS, so even with a stubbed media query, `display: none` from `@media (pointer: coarse) { display: none }` would not actually be applied. We'd be testing the stub, not the behavior.
- **Vitest test that snapshots the className strings** — rejected as the _primary_ test. It catches accidental reverts to `xl:` but doesn't actually prove the layout flips on a real touch device. It's a useful regression check but not a substitute. Could be added as a small bonus assertion in addition to the e2e test, but I don't think it's worth the maintenance cost given the e2e test already covers the same intent more robustly.
- **Visual snapshot tests with `expect(page).toHaveScreenshot()`** — rejected. Slower, brittler, and require platform-specific baseline images. The DOM-based assertions in the planned e2e test give us all the verification we need without the maintenance burden.
- **Skip e2e tests, rely on manual smoke testing** — rejected. Violates constitutional principle II ("When fixing a bug, MUST write a failing test"). Also makes regression catching impossible.

---

## Decision 5 — No conditional rendering, no DOM structure changes

### Decision

Both the desktop header bar and the mobile title cluster remain in the DOM at all times. Visibility is controlled purely via CSS `display: none` from the media query — same pattern the editor uses today, just with a different signal.

### Rationale

1. **React state preservation** — there's no React state in either of these elements that would be lost on layout flip, but keeping them mounted means we don't have to think about it. It also means no React reconciliation is triggered by media query changes (which would happen with conditional rendering driven by a hook).
2. **Same as today's behavior** — the existing `xl:` and `max-xl:` classes also use CSS `display` toggles. We're not changing the rendering model, just the trigger.
3. **Accessibility** — `display: none` removes elements from the accessibility tree, so screen readers see only the visible variant. This matches today's behavior. Both copies of the back/home buttons are correctly hidden from assistive tech in their respective inactive layouts.

### Alternatives considered

- **Conditional rendering driven by a `useDeviceLayout()` hook** — rejected. Reintroduces all the SSR/flash/state-sync problems Decision 1 avoided. Would require a `useEffect` that runs after mount, picking up `matchMedia('(pointer: coarse)').matches`, and storing it in state. The first render (server + first client paint) would have to guess, causing exactly the layout flash FR-004 forbids.
- **Render only one variant based on a request header in middleware** — rejected. Requires user-agent sniffing in middleware (forbidden by FR-007) or the [Sec-CH-UA-Mobile](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA-Mobile) Client Hint, which is Chromium-only and still reflects "is this a phone-class device" not "is the primary pointer coarse." Doesn't capture hybrid devices correctly.

---

## Decision 6 — Fix the JavaScript zoom hook to use the same signal as the CSS

### Decision

Update `src/hooks/use-pinch-zoom.ts` to detect "pure touch device" using `window.matchMedia('(any-pointer: coarse) and (not (any-pointer: fine))').matches` instead of the previous `'ontouchstart' in window || navigator.maxTouchPoints > 0`. The new check exactly mirrors the `pointer-touch:` CSS variant defined in `globals.css`, so JS and CSS agree on the same definition of "touch device."

### Why this was discovered late (and what it teaches)

This decision was added during implementation, AFTER the user tested the CSS-only fix on a Windows touchscreen laptop and reported that the page was still rendering edge-to-edge. The CSS chrome (header bar, toolbar) was correctly in desktop mode — but the document page surface itself was being **stretched to fill the entire viewport**, regardless of any CSS layout rules.

Root cause: `use-pinch-zoom.ts` ran a JavaScript `useEffect` that computed `fitScale = containerWidth / pageWidth` if it detected the device had any touch hardware (`navigator.maxTouchPoints > 0`). On a Windows touchscreen laptop, `navigator.maxTouchPoints > 0` is **true** because the laptop has a touchscreen — even though the user is interacting via the trackpad. So the hook would scale the page to fill the window width via a CSS `transform: scale()`, which is independent of and not affected by any of the className changes I made.

This is the same conceptual pitfall as the original `xl:` viewport-width check, just hidden in JavaScript instead of CSS. **The lesson**: when fixing a "is this a touch device?" decision in one place, grep the entire codebase for any other touch-detection logic — including JS-level checks like `ontouchstart`, `maxTouchPoints`, `isTouchDevice`, `hasTouch` — and apply the same definition consistently. JS and CSS must use the same signal, or they will disagree and produce broken half-fixes.

### Rationale for the new check

- **Consistent definition with the CSS variant**: both use `(any-pointer: coarse) and (not (any-pointer: fine))`. There's only one place to think about "what counts as a touch device" — change it in one place and JS + CSS update together.
- **Correctly handles Windows touch laptops**: `(any-pointer: fine)` is true (the trackpad is a fine pointer), so the negation makes the whole expression false. The hook caps `fitScale` at 1 and the page renders at its natural 794px width.
- **Correctly handles real tablets**: `(any-pointer: coarse)` is true and `(any-pointer: fine)` is false, so the expression is true. The hook computes `fitScale = containerWidth / 794`, and the page fills the screen — the desired tablet experience.
- **No SSR concerns**: the check lives inside a `useEffect`, which only runs on the client. `window.matchMedia` is always available there.
- **No fallback issue**: if the browser doesn't support `any-pointer` (very rare in 2026), the entire media query evaluates to "not all" and `.matches` returns false. The hook then caps `fitScale` at 1 — page mode. Same fallback as the CSS rule.

### Alternatives considered (and why we didn't pick them)

- **Keep the original `navigator.maxTouchPoints > 0` check** — this is the bug. Misclassifies Windows touch laptops.
- **`!matchMedia('(any-pointer: fine)').matches`** — semantically close, but if `any-pointer` is unknown to the browser, `.matches` is false and `!false` is true → would incorrectly enter touch mode on browsers that don't understand the feature. Bad fallback.
- **A `useDeviceMode()` React hook that exposes the result via context** — overengineered for one call site. If a second call site appears in the future, refactor then.

### Verification

1. Manual browser test on Mac (page renders correctly, centered, gray background) — ✅
2. Manual browser test on Windows touchscreen laptop (the original bug repro) — ✅ confirmed by user after the fix
3. Unit/lint/build tests still pass — covered by Phase 6 of the task list

## Open questions / non-issues

- **Print stylesheet?** — N/A. The editor's print/PDF export goes through a separate puppeteer-based pipeline, not the live editor stylesheet. This change does not affect PDF export.
- **What happens if a user plugs in a mouse mid-session on a tablet?** — Per spec assumption #2 and User Story 3, we don't need to react live. The CSS approach naturally handles this because `@media` queries do re-evaluate on input device changes — but if there's no JavaScript involved, there's no React state to get out of sync. The page surface and chrome will both flip together on the next browser repaint, which is fine.
- **Dark mode interaction?** — The `bg-gray-100` and `bg-white` classes used here are not theme-aware. They're hardcoded light-mode colors, matching the existing behavior. Dark mode is out of scope for this fix; if dark mode lands later, it'll need to update these colors regardless of which media query drives the layout.
