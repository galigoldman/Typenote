# Tasks: Responsive Mobile/Tablet Layout

**Feature**: 010-responsive-mobile-layout | **Branch**: `010-responsive-mobile-layout`
**Generated**: 2026-03-17 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Phase 1: Setup

- [x] T001 Verify branch `010-responsive-mobile-layout` is checked out and up-to-date with `origin/main`
- [x] T002 Install shadcn/ui Sheet component: run `npx shadcn@latest add sheet` — verify `src/components/ui/sheet.tsx` is created and follows project patterns (cn(), data-slot, Radix primitives)

## Phase 2: Foundation (Hooks)

_Must complete before any user story. Creates the two hooks that the responsive sidebar depends on._

- [x] T003 [P] Create `src/hooks/use-media-query.ts`: implement `useMediaQuery(query: string): boolean` hook per contracts/ui-contracts.md — use `window.matchMedia` with `addEventListener('change', ...)`, return `false` during SSR/initial render, clean up listener on unmount
- [x] T004 [P] Create `src/hooks/use-swipe-drawer.ts`: implement `useSwipeDrawer(ref, options)` hook per contracts/ui-contracts.md — detect `touchstart` within `edgeWidth` (default 20px) of left screen edge, `touchmove` rightward exceeding `threshold` (default 50px) calls `onOpen`, leftward swipe when `isOpen` calls `onClose`, ignore vertical-dominant swipes, no-op when `enabled` is false or on non-touch input
- [x] T005 [P] Write unit test `src/hooks/use-media-query.test.ts`: test returns `false` on SSR, returns `true` when media query matches, returns `false` when it doesn't match, updates when `change` event fires, cleans up listener on unmount
- [x] T006 [P] Write unit test `src/hooks/use-swipe-drawer.test.ts`: test fires `onOpen` on rightward swipe from left edge, fires `onClose` on leftward swipe when open, ignores swipes from middle of screen (> edgeWidth), ignores vertical-dominant swipes, respects `enabled: false` flag, does not fire on mouse events

## Phase 3: User Story 1 — Auto-Collapsing Sidebar on Small Screens (P1)

_Goal: On screens <768px, sidebar is hidden and replaced with a hamburger menu that opens a Sheet overlay. Navigation auto-closes the overlay._

**Independent test**: Open app at <768px. Sidebar is hidden, hamburger visible. Tap hamburger → sidebar slides in as overlay. Tap a course → navigates and sidebar closes. Tap backdrop → sidebar closes.

- [x] T007 [US1] Modify `src/components/dashboard/sidebar-layout.tsx`: import `useMediaQuery` hook, derive `isMobile` from `!useMediaQuery('(min-width: 768px)')`. Extend SidebarContext interface to add `isMobile: boolean` and `close: () => void`. Update the context provider to include these new fields. On mobile, do NOT render the inline `<aside>` — instead render sidebar content inside `<Sheet side="left">` with `isSheetOpen` state controlling open/close
- [x] T008 [US1] In `src/components/dashboard/sidebar-layout.tsx`: add a hamburger menu button (Menu icon from lucide-react) that is visible only on mobile (`md:hidden`). Place it as a child of the layout that renders in the mobile header area. The button sets `isSheetOpen = true`. On desktop, hide the hamburger button (`hidden md:block` is not needed — just don't render it)
- [x] T009 [US1] In `src/components/dashboard/sidebar-layout.tsx`: integrate `useSwipeDrawer` on the layout container ref — pass `onOpen` to set `isSheetOpen = true`, `onClose` to set `isSheetOpen = false`, `isOpen = isSheetOpen`, `enabled = isMobile`. This enables swipe-to-open/close on mobile
- [x] T010 [US1] Modify `src/app/(dashboard)/layout.tsx`: on mobile, render a header bar at the top with the hamburger button (from SidebarContext) and "Typenote" text. On desktop, keep the existing layout where the logo is inside the sidebar. Use the `isMobile` flag from SidebarContext to conditionally render the mobile header
- [x] T011 [US1] Modify `src/components/dashboard/sidebar-folder-tree.tsx`: import `useSidebar` and destructure `isMobile` and `close`. In the `FolderNode` and `CourseNode` click handlers, after `router.push(...)`, call `close()` if `isMobile` is true — this auto-closes the Sheet overlay after navigation
- [x] T012 [US1] Write component test `src/components/dashboard/sidebar-layout.test.tsx`: mock `useMediaQuery` to return false (mobile) — verify Sheet component is rendered and hamburger button is visible. Mock to return true (desktop) — verify inline `<aside>` is rendered and hamburger is not present. Verify clicking hamburger opens the Sheet. Verify backdrop click closes it

## Phase 4: User Story 2 — Swipe Gesture for Sidebar (P1)

_Goal: Swipe right from left edge opens sidebar, swipe left closes it. Does not interfere with canvas drawing._

**Independent test**: On touch device, swipe right from left 20px edge → sidebar opens. Swipe left on sidebar → closes. Draw on canvas near left edge → sidebar does NOT open.

_Note: The swipe gesture integration (T009) is already done in Phase 3. This phase validates and hardens the interaction._

- [x] T013 [US2] Verify in `src/hooks/use-swipe-drawer.ts` that the `touchstart` handler checks `event.touches[0].clientX <= edgeWidth` (not pageX) to correctly detect left-edge touch. Verify `touchmove` calculates horizontal delta and only triggers when `Math.abs(deltaX) > Math.abs(deltaY)` (horizontal-dominant). Verify `touchend` resets tracking state
- [x] T014 [US2] Verify swipe gesture does not conflict with canvas drawing: the `useSwipeDrawer` hook attaches to the sidebar layout container, while canvas drawing handlers attach to the canvas element. Since the swipe only triggers from the leftmost 20px and the canvas content area is inset from the edge, no conflict should occur. Add a note/comment in the hook documenting this coexistence strategy

## Phase 5: User Story 3 — Touch-Friendly Tap Targets (P1)

_Goal: All interactive elements have minimum 44x44px tappable area._

**Independent test**: On mobile device, tap each sidebar item, toolbar button, and week section toggle. Each is easy to tap without hitting adjacent elements.

- [x] T015 [P] [US3] Modify `src/components/dashboard/sidebar-folder-tree.tsx`: increase vertical padding on FolderNode and CourseNode buttons from `py-1.5` to `py-2.5` (or add `min-h-[44px]`) to meet 44px touch target. Ensure the ChevronRight expand icon also has adequate tappable area (increase its parent span size)
- [x] T016 [P] [US3] Modify `src/components/canvas/canvas-editor.tsx`: add `min-h-[44px] min-w-[44px]` classes to all toolbar buttons (pen, eraser, highlighter, undo, redo, delete, add page, sidebar toggle, cursor tool). Ensure the page type selector buttons also meet 44px minimum
- [x] T017 [P] [US3] Modify `src/components/dashboard/week-section.tsx`: increase the week header button/row height to minimum 44px — add `min-h-[44px]` to the clickable header element. Ensure the ChevronDown expand/collapse icon has adequate tappable area
- [x] T018 [US3] Review and verify touch targets on remaining interactive elements: sign-out button in `src/app/(dashboard)/layout.tsx` (already uses shadcn Button — likely adequate), AI chat send button in `src/components/ai/ai-chat-panel.tsx` (verify and add `min-h-[44px]` if needed), dialog action buttons (shadcn Dialog buttons — likely adequate)

## Phase 6: User Story 4 — Full-Width Canvas When Sidebar Hidden (P1)

_Goal: Main content fills 100% viewport width when sidebar is hidden. No wasted space._

**Independent test**: Open document on mobile — canvas fills full width. On desktop, collapse sidebar — content expands smoothly. Expand sidebar — content shrinks smoothly.

_Note: This is largely already handled by the existing `flex-1` layout and the sidebar's `w-0`/`w-[250px]` toggle. The Sheet overlay on mobile does not push content, so content is always full-width. This phase validates and ensures no gaps._

- [x] T019 [US4] Verify in `src/components/dashboard/sidebar-layout.tsx` that the mobile path does NOT render the inline `<aside>` at all (not just `w-0`) — the Sheet overlay is a portal and does not affect the flex layout. The `<main>` element should have `flex-1` and fill the full viewport width on mobile
- [x] T020 [US4] Verify smooth transitions on desktop: the existing `transition-[width] duration-200` on the `<aside>` element handles the animation. Test that toggling the sidebar results in a smooth expand/contract of the main content area with no layout jumps. If the transition is jarring after the refactor, adjust the CSS transition properties

## Phase 7: User Story 5 — Persistent Collapse State (P2)

_Goal: Desktop sidebar preference persists via localStorage across navigations and sessions._

**Independent test**: On desktop, collapse sidebar. Navigate to another page — sidebar stays collapsed. Refresh browser — sidebar stays collapsed. Expand it. Navigate — stays expanded. On mobile — always starts hidden regardless.

- [x] T021 [US5] Modify `src/components/dashboard/sidebar-layout.tsx`: on mount (desktop only), read `localStorage.getItem('typenote-sidebar-collapsed')`. If value is `'true'`, initialize sidebar as collapsed. On toggle (desktop only), write the new state to localStorage. On mobile, skip localStorage read/write — always start closed
- [x] T022 [US5] Handle the edge case where the existing route-based auto-collapse (document pages collapse sidebar) interacts with persistence: the current `store.set(!isDocumentPage)` behavior on pathname change should continue to work, and the localStorage should reflect the latest state. Ensure that navigating TO a document page collapses sidebar (overriding preference temporarily) and navigating AWAY from a document page restores based on preference
- [x] T023 [US5] Write unit test in `src/components/dashboard/sidebar-layout.test.tsx`: mock localStorage. Verify on desktop mount with `'true'` in localStorage, sidebar starts collapsed. Verify toggle writes to localStorage. Verify mobile mount ignores localStorage and starts with sidebar hidden

## Phase 8: User Story 6 — Responsive AI Chat Panel (P2)

_Goal: AI chat goes full-screen on mobile instead of fixed 420px side panel._

**Independent test**: Open course-linked document on mobile. Tap AI chat button — panel fills entire screen. Type a question — input stays visible above keyboard. Close panel — canvas returns to full width.

- [x] T024 [US6] Modify `src/components/ai/ai-chat-panel.tsx`: change the outer container width from `w-[420px]` to `w-full md:w-[420px]`. Change position from `right-0` to `inset-0 md:right-0 md:inset-auto md:top-0`. This makes the panel full-screen on mobile and retains the right-anchored 420px behavior on desktop
- [x] T025 [US6] In `src/components/ai/ai-chat-panel.tsx`: ensure the input area at the bottom uses `sticky bottom-0` or equivalent so it stays visible when the on-screen keyboard appears. Add `pb-safe` (Tailwind safe-area padding) if supported, or `pb-4` as fallback for devices with bottom home indicators
- [x] T026 [US6] Verify the AI chat close button (X button) is prominently visible on mobile and has a 44px touch target. The existing close button should work, but verify it's not obscured by the full-screen layout

## Phase 9: User Story 7 — Easy Back Navigation (P2)

_Goal: Breadcrumb navigation on all nested pages. 1-tap back from document to course, 1-tap from course to dashboard._

**Independent test**: On mobile, navigate to a document inside a course. Verify breadcrumb shows course name, tapping it goes to course page. On course page, verify breadcrumb to dashboard, tapping it goes to dashboard.

- [x] T027 [US7] Modify `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`: add a breadcrumb link at the top of the page — "← Dashboard" linking to `/dashboard`. Style it with the existing breadcrumb pattern or a simple styled link with `min-h-[44px]` touch target. Place it above the course title/header section
- [x] T028 [US7] Modify `src/app/(dashboard)/dashboard/documents/[docId]/page.tsx`: the course breadcrumb already exists (`<Link href={/dashboard/courses/${course.id}}>` with GraduationCap icon). Ensure it has `min-h-[44px]` touch target and is prominently visible on mobile. Increase padding if needed. For documents without a course, no breadcrumb is needed (dashboard is accessible via hamburger menu)
- [x] T029 [US7] Verify that week sections on the course page (`src/components/dashboard/week-section.tsx`) are already collapsible (they use useState + ChevronDown toggle). Touch target increase was done in T017. No additional work needed unless the expand/collapse interaction is broken

## Phase 10: Polish & Cross-Cutting

- [x] T030 Run `pnpm test` — verify all existing tests plus new tests pass (no regressions)
- [x] T031 Run `pnpm lint` — verify zero lint errors
- [x] T032 Run `pnpm build` — verify the build succeeds with the Sheet component and modified components
- [x] T033 Manual verification (mobile phone — 375px): open app, verify sidebar hidden, hamburger visible. Tap hamburger → sidebar overlay opens. Navigate → sidebar closes. Swipe from left edge → sidebar opens. Swipe left → closes. Open document → canvas fills full width. Open AI chat → full-screen. Close chat → canvas restored. Tap breadcrumb → navigates back. Verify all touch targets are easy to tap
- [x] T034 Manual verification (tablet — 768px portrait): verify the breakpoint transition. At exactly 768px, sidebar should behave as desktop (inline). At 767px, it should behave as mobile (overlay). Rotate device — verify smooth transition between modes
- [x] T035 Manual verification (desktop — 1024px+): verify no changes to existing desktop behavior. Sidebar toggles as before. Canvas editor, folder tree, AI chat all work normally. Collapse sidebar → preference persists across pages and refresh
- [x] T036 Edge case verification: rapidly tap hamburger button — no stuck states. Open dialog while sidebar overlay is open — dialog appears on top. Long folder tree — sidebar scrolls independently. Rotate device while sidebar open — adapts correctly
- [x] T037 Run `pnpm format:check` — verify code formatting is consistent

## Dependencies

```
Phase 1 (Setup) + Phase 2 (Foundation: Hooks) ────┐
    │                                               │
    ▼                                               ▼
Phase 3 (US1: Auto-Collapse Sidebar)    Phase 5 (US3: Touch Targets)
    │                                               │
    ├───► Phase 4 (US2: Swipe Gesture)              │
    │                                               │
    ▼                                               ▼
Phase 6 (US4: Full-Width Canvas) ◄──────────────────┘
    │
    ▼
Phase 7 (US5: Persistent State)
    │
    ├───► Phase 8 (US6: Responsive AI Chat)
    │
    ├───► Phase 9 (US7: Back Navigation)
    │
    ▼
Phase 10 (Polish)
```

### Parallel Opportunities

- **T003 + T004** (useMediaQuery + useSwipeDrawer) — different files, no dependency
- **T005 + T006** (hook tests) — different files, can write in parallel
- **T015 + T016 + T017** (touch targets across sidebar, canvas, week sections) — different files, fully independent
- **Phase 5** (touch targets) can run in parallel with **Phase 3** (sidebar refactor) — different files
- **Phase 8** (AI chat) and **Phase 9** (breadcrumbs) are independent and can run in parallel after Phase 7

## Implementation Strategy

### MVP (Ship First)

Phase 1 + Phase 2 + Phase 3 (US1) = **responsive sidebar with hamburger menu and Sheet overlay**. This solves the core issue (GitHub #46) — mobile users can access the app without the sidebar consuming half the screen. Touch targets and other improvements can follow incrementally.

### Full Feature

Add Phases 4-9 for swipe gestures, touch targets, persistence, responsive AI chat, and back navigation. Polish in Phase 10.

### Task Summary

| Phase     | Story                      | Tasks  | Key Files                                                           |
| --------- | -------------------------- | ------ | ------------------------------------------------------------------- |
| 1         | Setup                      | 2      | `sheet.tsx` (installed via CLI)                                     |
| 2         | Foundation (Hooks)         | 4      | `use-media-query.ts`, `use-swipe-drawer.ts`, tests                  |
| 3         | US1: Auto-Collapse Sidebar | 6      | `sidebar-layout.tsx`, `layout.tsx`, `sidebar-folder-tree.tsx`, test |
| 4         | US2: Swipe Gesture         | 2      | `use-swipe-drawer.ts` (verify)                                      |
| 5         | US3: Touch Targets         | 4      | `sidebar-folder-tree.tsx`, `canvas-editor.tsx`, `week-section.tsx`  |
| 6         | US4: Full-Width Canvas     | 2      | `sidebar-layout.tsx` (verify)                                       |
| 7         | US5: Persistent State      | 3      | `sidebar-layout.tsx`, test                                          |
| 8         | US6: Responsive AI Chat    | 3      | `ai-chat-panel.tsx`                                                 |
| 9         | US7: Back Navigation       | 3      | `courses/[courseId]/page.tsx`, `documents/[docId]/page.tsx`         |
| 10        | Polish                     | 8      | — (tests, lint, build, manual verification)                         |
| **Total** |                            | **37** |                                                                     |
