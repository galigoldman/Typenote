# Implementation Plan: Device-Aware Document Editor Layout

**Branch**: `034-device-layout-detection` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/034-device-layout-detection/spec.md`

## Summary

Replace the document editor's viewport-width breakpoint (`xl:` / `max-xl:`, which fires at 1280px) with a device-input-type query (`pointer: fine` / `pointer: coarse`) at all five sites where the editor flips between its desktop ("page mode") and tablet ("full-width mode") presentations.

The implementation is **CSS-only**: swap five Tailwind class strings in two files, using Tailwind 4's built-in `pointer-fine:` and `pointer-coarse:` variants. No JavaScript, no React state, no custom hooks, no Tailwind config changes, no new dependencies, no DOM structure changes. The cascade is rewritten so that **page mode is the default** and `pointer-coarse:` overrides apply tablet styles — this satisfies FR-005 (page-mode fallback when the media feature is unavailable).

Coverage: a Playwright e2e test that runs the editor in two browser projects (desktop default + iPad device descriptor) and asserts the desktop header bar visibility flips with device type, not viewport width. Per the constitution's bug-fix rule (II), the test is written first, confirmed to fail against the current code, then made to pass by the class swaps.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 22+
**Primary Dependencies**: Next.js 16 (App Router), React 19, Tailwind CSS 4 (built-in `pointer-fine:` / `pointer-coarse:` variants — no config changes needed)
**Storage**: N/A — purely a presentation/CSS change
**Testing**: Playwright (e2e) for the device-emulation regression test; Vitest for any unit-level assertions
**Target Platform**: Browsers — desktop Chrome/Firefox/Safari, mobile Safari (iPad), Android Chrome
**Project Type**: Web application (Next.js)
**Performance Goals**: Zero runtime cost — pure CSS, no JS execution, no hydration step
**Constraints**: No layout flash on initial paint (FR-004); no behavior change for drawing/text/scroll (FR-006); no user-agent sniffing (FR-007); page surface and chrome must always agree (FR-008)
**Scale/Scope**: Five Tailwind class strings in two files (`canvas-editor.tsx`, `canvas-page.tsx`) + one new e2e test file + one new Playwright project entry

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Walking through each principle in `.specify/memory/constitution.md`:

| #   | Principle                    | Status                              | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I   | Incremental Development      | ✅ Pass                             | Bug fix on existing infrastructure. No new feature surface, no foundations to skip.                                                                                                                                                                                                                                                                                      |
| II  | Test-Driven Quality          | ✅ Pass — with explicit requirement | The constitution says: "When fixing a bug, MUST write a failing test that reproduces the bug first, then fix the code, then confirm the test passes." This plan complies: Phase 1 produces an e2e test that reproduces the bug, Phase 2 (tasks) will run that test against unchanged code to confirm it fails, then implement the fix, then re-run to confirm it passes. |
| III | Protected Main Branch        | ✅ Pass                             | Already on `034-device-layout-detection`. Will open a PR; merge gated by CI.                                                                                                                                                                                                                                                                                             |
| IV  | Migrations as Code           | N/A                                 | No schema changes.                                                                                                                                                                                                                                                                                                                                                       |
| V   | Interview-Ready Architecture | ✅ Pass                             | The "Why CSS over JS?" trade-off, the "page-mode default + pointer-coarse override" cascade decision, and the difference between `pointer:` and `any-pointer:` are all explained in `research.md` so the user can discuss them in interviews.                                                                                                                            |

**Result**: All gates pass. No complexity tracking entries needed. No deviations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/034-device-layout-detection/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature spec (/speckit.specify + /speckit.clarify output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output — manual verification steps
├── checklists/
│   └── requirements.md  # Spec-quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created here)
```

**Not generated** (and why):

- `data-model.md` — N/A. This feature is purely a presentation/CSS change. No entities, no validation rules, no state transitions. The spec already says so explicitly under "Key Entities".
- `contracts/` — N/A. The editor exposes no public API surface that this change touches. No API endpoints, no CLI, no public component contract change. The JSX shape and props are identical before and after; only the className strings change.

### Source Code (repository root)

```text
src/
└── components/
    └── canvas/
        ├── canvas-editor.tsx    # 4 of the 5 className edits live here
        └── canvas-page.tsx      # 1 of the 5 className edits lives here

e2e/
└── editor-device-layout.spec.ts # NEW — Playwright regression test (Phase 1)

playwright.config.ts             # MODIFIED — add second project for iPad emulation
```

**Structure Decision**: Existing Next.js App Router layout, no new directories. The change touches two existing component files plus one new e2e test file plus a small Playwright config addition. No new modules, no new shared utilities, no new hooks.

## Phase 0: Research

See `research.md` for full details. Summary of key decisions:

1. **Mechanism**: CSS-only via Tailwind 4's built-in `pointer-fine:` / `pointer-coarse:` variants. Rejected: JavaScript hook with `window.matchMedia` (causes hydration flash and adds runtime cost for zero benefit over CSS).
2. **Cascade direction**: Default styles = page mode; `pointer-coarse:` overrides apply full-width/tablet styles. This makes FR-005 (page-mode fallback when detection is unavailable) automatic, because in any browser that doesn't match the media query, only the default styles apply.
3. **Why `pointer:` and not `any-pointer:`**: `pointer:` reports the user's _primary_ input device, which is exactly what the spec asks for ("primary input type"). `any-pointer:` would report `fine` for any device with even an attached mouse, which would mis-categorize iPads with a magic keyboard as desktops.
4. **Test strategy**: Add a `chromium-tablet` Playwright project using the built-in `iPad Pro 11` device descriptor (which sets `hasTouch: true` + `isMobile: true`, both of which cause Chromium to report `pointer: coarse`). Write one e2e spec that runs against both projects and asserts opposite layout outcomes. Approach validated against Playwright's documentation: device descriptors are the standard way to emulate mobile/touch contexts.
5. **No Tailwind config changes needed**: `pointer-fine` and `pointer-coarse` ship as built-in variants in Tailwind 3.4+ and Tailwind 4. The project is on Tailwind 4 (`@import 'tailwindcss';` in `globals.css`), so these are available immediately.

## Phase 1: Design & Contracts

### Data Model

**N/A — no data model.** This is a CSS-only presentation change. There are no entities, no fields, no relationships, no state transitions. The DOM structure is unchanged; only the className strings change. The spec's "Key Entities" section explicitly says so.

### Contracts

**N/A — no contracts.** The editor's public surface (props, exported components, route URLs, server actions, database schema) is identical before and after. The change is internal to two component files' className strings.

### The exact code change

This is small enough to enumerate completely in the plan. Five className edits, all symmetrical:

| #   | File                                      | Line (approx) | Current className                                                | New className                                                                |
| --- | ----------------------------------------- | ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `src/components/canvas/canvas-editor.tsx` | ~1503         | `hidden xl:flex items-center justify-between border-b px-4 py-2` | `flex pointer-coarse:hidden items-center justify-between border-b px-4 py-2` |
| 2   | `src/components/canvas/canvas-editor.tsx` | ~1587         | `flex items-center gap-1 mr-2 xl:hidden shrink-0`                | `hidden pointer-coarse:flex items-center gap-1 mr-2 shrink-0`                |
| 3   | `src/components/canvas/canvas-editor.tsx` | ~1853         | `flex-1 bg-white xl:bg-gray-100`                                 | `flex-1 bg-gray-100 pointer-coarse:bg-white`                                 |
| 4   | `src/components/canvas/canvas-editor.tsx` | ~1872         | `py-8 max-xl:py-0`                                               | `py-8 pointer-coarse:py-0`                                                   |
| 5   | `src/components/canvas/canvas-page.tsx`   | ~677          | `relative bg-white shadow-md mx-auto max-xl:shadow-none`         | `relative bg-white shadow-md mx-auto pointer-coarse:shadow-none`             |

**Cascade rule applied consistently**: in every row, the **default** className (the one without a variant prefix) represents **page mode**, and the **`pointer-coarse:`** prefix represents the tablet override. So if a browser doesn't match `(pointer: coarse)` — including the case where it doesn't support the media feature at all — the default page-mode styles apply. This is exactly what FR-005 requires.

Edits 1 and 2 invert the previous `hidden`/`flex` defaults, but the visual outcome is identical to what desktop and tablet users see today; we're just choosing the default differently so the fallback is correct.

### Test contract

**File**: `e2e/editor-device-layout.spec.ts` (new)

**Setup**: Two Playwright projects in `playwright.config.ts`:

- `chromium` (existing) — `devices['Desktop Chrome']`, no touch, primary input is mouse → `pointer: fine`
- `chromium-tablet` (new) — `devices['iPad Pro 11']`, `hasTouch: true`, `isMobile: true` → `pointer: coarse`

**Assertions** (the same spec runs in both projects):

1. **Sanity check**: `await page.evaluate(() => matchMedia('(pointer: coarse)').matches)` returns `true` in the tablet project and `false` in the desktop project. This proves the test infrastructure actually flips the media feature.
2. **Desktop header bar visibility**: Locate it by the title `<input>` (the desktop header is the only place with an editable title input). Assert visible on desktop, hidden on tablet.
3. **Mobile title cluster visibility**: Locate it by the truncated title `<span>` inside the toolbar. Assert hidden on desktop, visible on tablet.
4. **Page surface presentation**: On desktop, the scroll container should compute to `background-color: rgb(243, 244, 246)` (Tailwind's `bg-gray-100`). On tablet, it should compute to `background-color: rgb(255, 255, 255)` (`bg-white`). Use `getComputedStyle` via `page.evaluate`.
5. **Resize stability**: On the **desktop** project, resize the viewport to 800×600 (well below the old 1280px breakpoint) and re-assert assertions 2 and 3. They must still hold — this is the actual bug from the GitHub issue.

Assertion 5 is the regression test: it would fail today (because the old `xl:` breakpoint would flip the layout at 1280px) and pass after the className swaps.

### Agent context update

Run after this plan is finalized: `.specify/scripts/bash/update-agent-context.sh claude` — appends only new tech (none expected; everything used here is already in CLAUDE.md's tech list).

## Constitution Re-check (post-design)

| #   | Principle                    | Status                                                                                       |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| I   | Incremental Development      | ✅ Still passes — no new infrastructure introduced by the design                             |
| II  | Test-Driven Quality          | ✅ Plan explicitly includes failing-test-first sequencing for `editor-device-layout.spec.ts` |
| III | Protected Main Branch        | ✅ Unchanged                                                                                 |
| IV  | Migrations as Code           | N/A                                                                                          |
| V   | Interview-Ready Architecture | ✅ All non-trivial decisions are explained in `research.md`                                  |

No violations. Ready for `/speckit.tasks`.

## Complexity Tracking

_(No constitutional violations to justify. Section intentionally empty.)_
